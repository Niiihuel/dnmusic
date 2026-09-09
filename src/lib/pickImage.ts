import { Platform } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { File } from 'expo-file-system'

/**
 * Elegir una imagen del dispositivo.
 *
 * Dos caminos según la plataforma, por una razón concreta: en web un
 * `<input type="file">` abre el diálogo del sistema sin pedir permisos ni
 * cargar un módulo nativo, mientras que en el teléfono hace falta el selector
 * de fotos de verdad. Quien llama recibe los bytes, el MIME y
 * un nombre de archivo y no se entera de la diferencia.
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
  /**
   * Dónde mirarla antes de subirla: la ruta local del selector en el teléfono,
   * un `blob:` en la web. Es para la **vista previa** —la portada elegida en la
   * hoja de crear una lista— y nada más: a Storage viaja `blob`.
   */
  uri?: string
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
  /**
   * Sacar una foto con la cámara en vez de elegir una de la fototeca.
   *
   * Es la otra puerta del selector de «imagen de fondo» de una vitrina. A
   * diferencia de la fototeca, la cámara **sí pide permiso** —es la app la que
   * la enciende— y si se negó, el selector devuelve `null` como si se hubiera
   * cancelado: quien llama no tiene que distinguir los dos casos.
   */
  desdeCamara?: boolean
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
  const tipo = delBlob.split(';')[0].trim().toLowerCase()
  if (tipo.startsWith('image/') || tipo.startsWith('video/')) return tipo
  const ext = nombre.split(/[?#]/)[0].split('.').pop()?.toLowerCase() ?? ''
  /* JPEG por defecto: es lo que devuelve la fototeca de iOS y el único formato
     que el selector garantiza. */
  return POR_EXTENSION[ext] ?? 'image/jpeg'
}

export async function pickImage({
  cuadrada = false,
  conVideo = false,
  desdeCamara = false,
}: PickOptions = {}): Promise<PickedImage | null> {
  if (Platform.OS === 'web') return pickOnWeb(conVideo, desdeCamara)

  if (desdeCamara) {
    const permiso = await ImagePicker.requestCameraPermissionsAsync()
    if (!permiso.granted) return null
    const foto = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 })
    if (foto.canceled || !foto.assets[0]) return null
    return desdeAsset(foto.assets[0])
  }

  /* PHPicker no necesita permiso para lo seleccionado. La excepción de Expo
   * es video + Passthrough: intenta acceder al PHAsset original y puede pedir
   * Fotos o fallar con iCloud (shouldDownloadFromNetwork es false por defecto).
   * Exportar H.264 usa la copia del picker y descarga el video remoto; además
   * evita subir un MOV HEVC/ProRes de cámara como fondo sin convertirlo.
   * El preset solo afecta videos: no recorta ni aplasta los GIF elegidos.
   */
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: conVideo ? ['images', 'videos'] : ['images'],
    // Ver el comentario de `cuadrada`: prendido, esto aplasta los GIF.
    allowsEditing: cuadrada,
    ...(cuadrada ? { aspect: [1, 1] as [number, number] } : {}),
    quality: 0.9,
    ...(Platform.OS === 'ios' && conVideo ? {
      videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
      shouldDownloadFromNetwork: true,
    } : {}),
  })
  if (result.canceled || !result.assets[0]) return null
  return desdeAsset(result.assets[0])
}

/** Lo que devolvió el selector —o la cámara— en la forma que espera la app. */
async function desdeAsset(asset: ImagePicker.ImagePickerAsset): Promise<PickedImage> {
  // Leer el archivo que Expo copió/exportó, no el PHAsset de la fototeca.
  // File evita el recorrido fetch → Blob → base64 → ArrayBuffer de RN.
  const archivo = new File(asset.uri)
  if (archivo.size > 25 * 1024 * 1024) {
    throw new Error('No puede pesar más de 25 MB.')
  }
  const blob = await archivo.arrayBuffer()
  if (blob.byteLength === 0) throw new Error('El archivo elegido está vacío. Volvé a elegirlo en Fotos.')
  const nombreLocal = asset.uri.split(/[?#]/)[0].split('/').pop() ?? ''
  const extLocal = nombreLocal.split('.').pop()?.toLowerCase() ?? ''
  // El nombre original puede seguir siendo .MOV/.HEIC después de exportar.
  // La extensión de la copia local describe los bytes que realmente subimos.
  const mime = POR_EXTENSION[extLocal] ?? mimeDe(asset.fileName ?? nombreLocal, asset.mimeType ?? '')
  if (asset.type === 'video' && !mime.startsWith('video/')) {
    throw new Error('No se pudo reconocer el formato del video. Elegí un MP4 o MOV.')
  }
  const fileName = POR_EXTENSION[extLocal] ? nombreLocal : asset.fileName || nombreLocal || 'foto.jpg'
  return {
    blob,
    fileName,
    mime,
    /* El selector ya las midió: no hay que volver a abrir la imagen. */
    alto: asset.width > 0 && asset.height > 0 ? asset.height / asset.width : undefined,
    uri: asset.uri,
  }
}

function pickOnWeb(conVideo: boolean, desdeCamara = false): Promise<PickedImage | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = conVideo ? TYPES_CON_VIDEO : TYPES
    /* En un teléfono con navegador, `capture` abre la cámara directo; en una
       compu no hay cámara que abrir y el diálogo de archivos es lo que hay. */
    if (desdeCamara) input.setAttribute('capture', 'environment')
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return resolve(null)
      /* En el navegador hay que cargarla para preguntarle sus medidas. Si no se
         puede, se devuelve sin `alto` y quien la use decide qué hacer. */
      /* La URL se queda viva: es la vista previa de quien la pidió. Es una
         imagen por elección y se va con la página; revocarla acá dejaría al
         que la muestra con un `blob:` muerto. */
      const url = URL.createObjectURL(file)
      const img = new window.Image()
      img.onload = () => {
        resolve({
          blob: file,
          fileName: file.name,
          mime: mimeDe(file.name, file.type),
          alto: img.width > 0 && img.height > 0 ? img.height / img.width : undefined,
          uri: url,
        })
      }
      img.onerror = () => {
        resolve({ blob: file, fileName: file.name, mime: mimeDe(file.name, file.type), uri: url })
      }
      img.src = url
    }
    // Cancelar el diálogo no dispara `change` en todos los navegadores; sin
    // esto la promesa quedaría colgada para siempre.
    input.oncancel = () => resolve(null)
    input.click()
  })
}
