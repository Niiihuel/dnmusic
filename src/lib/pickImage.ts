import { Platform } from 'react-native'
import * as ImagePicker from 'expo-image-picker'

/**
 * Elegir una imagen del dispositivo.
 *
 * Dos caminos según la plataforma, por una razón concreta: en web un
 * `<input type="file">` abre el diálogo del sistema sin pedir permisos ni
 * cargar un módulo nativo, mientras que en el teléfono hace falta el selector
 * de fotos de verdad. Quien llama recibe lo mismo en los dos casos —un Blob y
 * un nombre de archivo— y no se entera de la diferencia.
 *
 * Devuelve `null` si se canceló. Cancelar no es un error: no hay nada que
 * avisar. Permisos no pide — ver el comentario dentro de `pickImage`.
 */
export type PickedImage = {
  /**
   * Los bytes de la imagen: un File en la web, un **ArrayBuffer** en el
   * teléfono.
   *
   * No es un capricho: storage-js mete un Blob adentro de un FormData y ahí
   * **ignora el `contentType`** que se le pasa — viaja el tipo del Blob, que
   * en React Native sale del `fetch` sobre `file://` como `text/plain`. El
   * bucket lo rechazaba con «mime type text/plain is not supported» por más
   * correcto que fuera nuestro `mime`. Con un ArrayBuffer no hay FormData: el
   * `contentType` de la subida se manda tal cual.
   */
  blob: Blob | ArrayBuffer
  fileName: string
  /**
   * El tipo de la imagen, deducido si hace falta.
   *
   * **No se puede confiar en `blob.type`.** En el teléfono el Blob sale de un
   * `fetch` sobre un `file://`, y ahí React Native devuelve el tipo vacío. Las
   * dos subidas rechazaban la imagen antes de intentarla —«tiene que ser JPG,
   * PNG o WebP»— por comparar contra esa cadena vacía, y por eso no se podía
   * subir ni la foto de perfil ni la ilustración por más permisos que hubiera.
   */
  mime: string
  /**
   * Alto dividido ancho, si se pudo saber.
   *
   * Lo mide **quien elige la imagen** y no quien la usa, porque cada plataforma
   * lo sabe de una forma distinta: el selector nativo ya devuelve las medidas
   * del asset, y en el navegador hay que cargar la imagen para preguntárselas.
   * Intentarlo después, desde el Blob, no funciona en el teléfono:
   * `URL.createObjectURL` no existe en React Native.
   */
  alto?: number
}

export type PickOptions = {
  /**
   * Aceptar también videos.
   *
   * Apagado por defecto: una foto de perfil es una foto. Se prende para las
   * ilustraciones del perfil, donde un clip corto es justamente la gracia — es
   * lo que hace Steam con sus vitrinas animadas.
   */
  conVideo?: boolean
  /**
   * Recortar en cuadrado con el editor del sistema, antes de devolverla.
   *
   * **Apagado, y hay que pensarlo dos veces antes de prenderlo.** El editor de
   * iOS re-codifica lo que le entra: un GIF vuelve como un JPG de un solo
   * cuadro, así que una foto de perfil animada se subía bien y llegaba quieta,
   * sin que nada avisara. Encuadrar ahora se hace después de subir y sin tocar
   * el archivo (ver `app/perfil/encuadrar` y la migración `encuadre_perfil`).
   *
   * Queda como opción porque para una imagen que sí se quiera recortar de
   * verdad —achicando el archivo— el editor del sistema sigue siendo el mejor
   * que hay; simplemente no es lo que quiere una foto de perfil.
   */
  cuadrada?: boolean
}

const TYPES = 'image/jpeg,image/png,image/webp,image/gif'
const TYPES_CON_VIDEO = `${TYPES},video/mp4,video/quicktime`

/** Extensión → tipo. Lo que aceptamos, y nada más. */
const POR_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
}

/**
 * De qué tipo es la imagen.
 *
 * **Al `blob.type` no se le puede creer.** En el teléfono el Blob sale de un
 * `fetch` sobre un `file://`, y ahí React Native no devuelve el tipo real: a
 * veces viene vacío y a veces `text/plain`. Lo segundo es peor que lo primero,
 * porque parece un dato válido — se lo mandábamos a Storage tal cual y
 * respondía «mime type text/plain is not supported».
 *
 * Así que solo se le cree si dice algo que tenga sentido; si no, manda la
 * extensión del archivo, que es lo que el selector sí conoce.
 */
function mimeDe(nombre: string, delBlob: string): string {
  if (delBlob.startsWith('image/') || delBlob.startsWith('video/')) return delBlob
  const ext = nombre.split('.').pop()?.toLowerCase() ?? ''
  /* JPEG por defecto: es lo que devuelve la fototeca de iOS y el único formato
     que el selector garantiza. */
  return POR_EXTENSION[ext] ?? 'image/jpeg'
}

export async function pickImage({
  cuadrada = false,
  conVideo = false,
}: PickOptions = {}): Promise<PickedImage | null> {
  if (Platform.OS === 'web') return pickOnWeb(conVideo)

  /*
   * **Sin pedir permiso.**
   *
   * El selector de fotos del sistema (PHPicker en iOS, el Photo Picker en
   * Android) corre en un proceso aparte: la app nunca ve la fototeca, solo
   * recibe lo que se eligió, así que abrirlo no requiere ningún permiso.
   *
   * Acá se pedía `requestMediaLibraryPermissionsAsync` igual, y eso era la
   * trampa: si alguna vez se contestó que no, iOS no vuelve a preguntar y la
   * puerta quedaba clavada en «las fotos están bloqueadas — andá a Ajustes»
   * para un permiso que el selector ni siquiera necesita. Sin el pedido, tocar
   * «Subir foto» abre el selector directo, siempre.
   */
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: conVideo ? ['images', 'videos'] : ['images'],
    // Ver el comentario de `cuadrada`: prendido, esto aplasta los GIF.
    allowsEditing: cuadrada,
    ...(cuadrada ? { aspect: [1, 1] as [number, number] } : {}),
    quality: 0.9,
  })
  if (result.canceled || !result.assets[0]) return null

  const asset = result.assets[0]
  /*
   * El selector devuelve una URI local, y Storage necesita bytes. `fetch` sobre
   * un `file://` funciona en React Native y es la forma más corta de leerlos sin
   * sumar expo-file-system solo para esto.
   *
   * Se leen como **ArrayBuffer**, no como Blob: el Blob de React Native viene
   * con `text/plain` de tipo y storage-js se lo cree — ver el comentario de
   * `PickedImage.blob`. El tipo real va aparte, en `mime`.
   */
  const blob = await fetch(asset.uri).then((r) => r.arrayBuffer())
  const fileName = asset.fileName || asset.uri.split('/').pop() || 'foto.jpg'
  return {
    blob,
    fileName,
    mime: mimeDe(fileName, asset.mimeType ?? ''),
    /* El selector ya las midió: no hay que volver a abrir la imagen. */
    alto: asset.width > 0 && asset.height > 0 ? asset.height / asset.width : undefined,
  }
}

function pickOnWeb(conVideo: boolean): Promise<PickedImage | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = conVideo ? TYPES_CON_VIDEO : TYPES
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return resolve(null)
      /* En el navegador hay que cargarla para preguntarle sus medidas. Si no se
         puede, se devuelve sin `alto` y quien la use decide qué hacer. */
      const url = URL.createObjectURL(file)
      const img = new window.Image()
      img.onload = () => {
        URL.revokeObjectURL(url)
        resolve({
          blob: file,
          fileName: file.name,
          mime: mimeDe(file.name, file.type),
          alto: img.width > 0 && img.height > 0 ? img.height / img.width : undefined,
        })
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        resolve({ blob: file, fileName: file.name, mime: mimeDe(file.name, file.type) })
      }
      img.src = url
    }
    // Cancelar el diálogo no dispara `change` en todos los navegadores; sin
    // esto la promesa quedaría colgada para siempre.
    input.oncancel = () => resolve(null)
    input.click()
  })
}
