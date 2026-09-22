import { Platform, Share } from 'react-native'
import { avisar } from '../state/aviso'
import { publicarCancion } from '../services/compartidos'
import { copiarAlPortapapeles } from './portapapeles'

/**
 * De dónde salen todos los links que se comparten, y cómo se ofrecen.
 *
 * Antes esto vivía copiado en `compartirLista` y en `invitarJam`, con el mismo
 * dominio escrito dos veces y la misma función de ofrecer escrita dos veces.
 * Con la canción y el perfil sumándose eran cuatro copias, así que la parte
 * común bajó acá y aquellos dos módulos quedaron con lo suyo: el mensaje que
 * acompaña a cada cosa y sus casos especiales.
 *
 * El dominio va **cableado** y no en una variable de entorno: es el que está
 * declarado en `associatedDomains` (app.json), en el
 * `apple-app-site-association` y en los rewrites de `vercel.json`, y los cuatro
 * tienen que decir lo mismo o el link deja de abrir la app. Un valor que se
 * puede cambiar por build es justo lo que no queremos acá.
 */
export const SITIO = 'https://dnmusic-production-c3f4.up.railway.app'

/**
 * Las cuatro cosas que tienen link propio.
 *
 * El nombre de cada una **es** el primer tramo de su URL y **es** la carpeta de
 * su ruta en expo-router (`app/cancion/[id].tsx`, `app/lista/[id].tsx`, …). Que
 * sean el mismo string no es una coincidencia que haya que mantener a mano: es
 * lo que hace que el mismo link lo entiendan el navegador, el universal link de
 * iOS, el `dnmusic://` del escritorio y la función que arma la tarjeta, sin que
 * ninguno tenga su propia tabla de traducción.
 */
export const COMPARTIBLES = ['cancion', 'lista', 'jam', 'perfil'] as const
export type Compartible = (typeof COMPARTIBLES)[number]

/**
 * El link de algo.
 *
 * El id se codifica porque no todos son inocentes: una canción propia se llama
 * `propia:<uuid>` y ese `:` suelto en un path es legal pero confunde a la mitad
 * de los previsualizadores que lo leen. Al recibirlo se decodifica una sola
 * vez, en `enlaceDeDnmusic`.
 */
export function linkDe(que: Compartible, id: string): string {
  return `${baseDe(que)}/${encodeURIComponent(id)}`
}

/** El link sin el id: lo que hace falta para reconocer uno o para armarlo aparte. */
export function baseDe(que: Compartible): string {
  return `${SITIO}/${que}`
}

/**
 * El link para **incrustar** en otra página: lo que va adentro de un `<iframe>`.
 *
 * Es una página aparte y no la misma con un parámetro porque lo que sirve cada
 * una no se parece: `/cancion/x` entrega la app entera —5 MB de bundle— y eso
 * adentro del iframe de un blog es una barbaridad; `/embed/cancion/x` entrega
 * una tarjeta suelta de unos pocos KB. Es la misma división que hace Spotify
 * entre `open.spotify.com/track/…` y `open.spotify.com/embed/track/…`.
 */
export function linkIncrustado(que: Compartible, id: string): string {
  return `${SITIO}/embed/${que}/${encodeURIComponent(id)}`
}

/** El `<iframe>` listo para pegar, que es lo que alguien espera al copiar un embed. */
export function codigoIncrustado(que: Compartible, id: string): string {
  return `<iframe src="${linkIncrustado(que, id)}" width="100%" height="152" frameborder="0" loading="lazy" title="dnmusic"></iframe>`
}

/**
 * Qué apunta un link nuestro, si es que apunta a algo.
 *
 * Lo usan tres lugares que no se conocen entre sí y que necesitan la misma
 * respuesta: el escritorio, para saber a qué ruta llevar la ventana cuando el
 * sistema le entrega un `dnmusic://…`; la tarjeta de aterrizaje, para armar el
 * `dnmusic://` que intenta abrir la app; y el chat, para reconocer un link
 * propio pegado en un mensaje.
 *
 * Acepta las tres formas en las que un link nuestro puede llegar —el `https`
 * del sitio, el `dnmusic://` del escritorio y el `app://dnmusic` con el que la
 * ventana de Electron se sirve a sí misma— y **solo** esas: un link de otro
 * lado nunca se convierte en una ruta de esta app.
 */
export function enlaceDeDnmusic(entrada: string): { que: Compartible; id: string } | null {
  const texto = entrada.trim()
  if (!texto) return null
  const patron = new RegExp(
    `^(?:${SITIO.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|dnmusic:/|app://dnmusic)` +
      `/(${COMPARTIBLES.join('|')})/([^/?#\\s]+)`,
    'i',
  )
  const m = patron.exec(texto)
  if (!m) return null
  const que = m[1].toLowerCase() as Compartible
  try {
    const id = decodeURIComponent(m[2])
    return id ? { que, id } : null
  } catch {
    /* Un `%` suelto no es un link: es basura pegada. */
    return null
  }
}

/** La ruta de expo-router a la que lleva un link nuestro. */
export function rutaDeEnlace(entrada: string): string | null {
  const destino = enlaceDeDnmusic(entrada)
  return destino ? `/${destino.que}/${encodeURIComponent(destino.id)}` : null
}

/**
 * El gesto nativo de cada lado: la hoja de compartir en el teléfono, el
 * portapapeles en el navegador — que no tiene hoja.
 *
 * El link se copia **siempre**, en todos lados, antes de cualquier otra cosa:
 * era lo que fallaba en el escritorio, donde `navigator.clipboard` puede no
 * estar y se caía a una hoja de compartir que en web no existe, y el link no
 * llegaba a ningún lado.
 *
 * El mensaje lleva el nombre de lo que se comparte porque una URL con un uuid
 * no dice nada; con el nombre, quien lo recibe sabe si le interesa antes de
 * tocarlo.
 */
export async function ofrecer(enlace: string, mensaje: string): Promise<void> {
  const copiado = await copiarAlPortapapeles(enlace)
  if (Platform.OS !== 'web') {
    try {
      await Share.share({ message: mensaje })
      return
    } catch {
      /* Hoja cancelada: el link ya quedó copiado. */
    }
  }
  avisar(copiado ? 'Link copiado. Mandáselo a quien quieras.' : `Compartí el link ${enlace}`)
}

/**
 * Pasar una canción.
 *
 * Publica la tarjeta **antes** de ofrecer el link, y no en paralelo: quien
 * recibe el mensaje lo abre en segundos, y WhatsApp le pide el preview al
 * servidor apenas se pega. Una tarjeta que llega después del preview no llega:
 * el que la vio sin tapa la va a seguir viendo sin tapa, porque queda cacheada
 * del otro lado.
 *
 * Si publicar falla, se comparte igual. Perder la tapa del preview es un
 * detalle; no poder mandar la canción, no.
 */
export async function compartirCancion(track: {
  videoId: string
  title: string
  artist: string
  artworkPath?: string | null
  artworkUrl?: string
  durationMs?: number
}): Promise<void> {
  await publicarCancion(track).catch(() => {})
  const enlace = linkDe('cancion', track.videoId)
  const quien = track.artist ? ` de ${track.artist}` : ''
  await ofrecer(enlace, `Escuchá «${track.title}»${quien} en dnmusic: ${enlace}`)
}

/** Pasar un perfil. Solo tiene tarjeta si está en público; ver `tarjeta_enlace`. */
export async function compartirPerfil(usuario: string, nombre?: string | null): Promise<void> {
  const enlace = linkDe('perfil', usuario)
  const quien = nombre?.trim() ? `${nombre.trim()} (@${usuario})` : `@${usuario}`
  await ofrecer(enlace, `Mirá el perfil de ${quien} en dnmusic: ${enlace}`)
}

/**
 * Si la ruta en la que estás es la de un link compartido.
 *
 * Recibe los **segmentos** de expo-router y no el pathname, y eso no es un
 * detalle: `useSegments` devuelve el patrón de la ruta (`['lista','[id]']`) y
 * no el camino real (`/lista/abc`). Con el pathname habría que adivinar, y se
 * adivinaría mal: `/lista/nueva`, `/lista/personas`, `/jam/opciones` y
 * `/perfil/encuadrar` son pantallas de adentro que tienen exactamente la misma
 * forma que un link de afuera. Con el patrón, la pregunta es exacta.
 */
export function esAterrizaje(segmentos: readonly string[]): boolean {
  return (
    segmentos.length === 2 &&
    (COMPARTIBLES as readonly string[]).includes(segmentos[0]) &&
    /^\[[a-z]+\]$/.test(segmentos[1])
  )
}
