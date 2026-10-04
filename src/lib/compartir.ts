import { Platform, Share } from 'react-native'
import { avisar } from '../state/aviso'
import { publicarCancion } from '../services/compartidos'
import { copiarAlPortapapeles } from './portapapeles'

/**
 * Links y gestos de compartir comunes a canciones, listas, Jam y perfiles.
 * El host del build debe coincidir con las asociaciones nativas; el fallback
 * conserva enlaces de builds anteriores y entornos sin configuración.
 */
export const SITIO = (
  (typeof process !== 'undefined' ? process.env.EXPO_PUBLIC_SITE_URL?.trim() : undefined) ||
  'https://dnmusic-production-c3f4.up.railway.app'
).replace(/\/$/, '')

/** Los tipos coinciden con las rutas de expo-router y los esquemas nativos. */
export const COMPARTIBLES = ['cancion', 'lista', 'jam', 'perfil'] as const
export type Compartible = (typeof COMPARTIBLES)[number]

/** Codifica también ids propios como `propia:<uuid>`; el receptor decodifica una vez. */
export function linkDe(que: Compartible, id: string): string {
  return `${baseDe(que)}/${encodeURIComponent(id)}`
}

/** El link sin el id: lo que hace falta para reconocer uno o para armarlo aparte. */
export function baseDe(que: Compartible): string {
  return `${SITIO}/${que}`
}

/** URL del iframe liviano, separado del bundle completo de la app. */
export function linkIncrustado(que: Compartible, id: string): string {
  return `${SITIO}/embed/${que}/${encodeURIComponent(id)}`
}

/** El `<iframe>` listo para pegar, que es lo que alguien espera al copiar un embed. */
export function codigoIncrustado(que: Compartible, id: string): string {
  return `<iframe src="${linkIncrustado(que, id)}" width="100%" height="152" frameborder="0" loading="lazy" title="dnmusic"></iframe>`
}

/**
 * Reconoce HTTPS del sitio, dnmusic:// y app://dnmusic.
 * Los hosts ajenos no se convierten en rutas internas.
 */
export function enlaceDeDnmusic(entrada: string): { que: Compartible; id: string } | null {
  const texto = entrada.trim()
  if (!texto) return null
  const patron = new RegExp(
    `^(?:${SITIO.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|https://dnmusic-app\\.vercel\\.app|dnmusic:/|app://dnmusic)` +
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

/** Copia el enlace en todas las plataformas y ofrece la hoja nativa en teléfonos. */
export async function ofrecer(enlace: string, mensaje: string): Promise<void> {
  await ofrecerCopiado(enlace, mensaje, copiarAlPortapapeles(enlace))
}

async function ofrecerCopiado(enlace: string, mensaje: string, copia: Promise<boolean>): Promise<void> {
  const copiado = await copia
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
 * Copia antes de esperar la red para conservar la activación requerida por Safari.
 * Publica el preview antes de abrir la hoja nativa; si falla, comparte igual.
 */
export async function compartirCancion(track: {
  videoId: string
  title: string
  artist: string
  artworkPath?: string | null
  artworkUrl?: string
  durationMs?: number
}): Promise<void> {
  const enlace = linkDe('cancion', track.videoId)
  const copia = copiarAlPortapapeles(enlace)
  await publicarCancion(track).catch(() => {})
  const quien = track.artist ? ` de ${track.artist}` : ''
  await ofrecerCopiado(enlace, `Escuchá «${track.title}»${quien} en dnmusic: ${enlace}`, copia)
}

/** Copia en el gesto y prepara el preview sin retrasar la escritura por la red. */
export async function copiarEnlaceCancion(track: Parameters<typeof publicarCancion>[0]): Promise<boolean> {
  const copia = copiarAlPortapapeles(linkDe('cancion', track.videoId))
  await publicarCancion(track).catch(() => {})
  return copia
}

/** Pasar un perfil. Solo tiene tarjeta si está en público; ver `tarjeta_enlace`. */
export async function compartirPerfil(usuario: string, nombre?: string | null): Promise<void> {
  const enlace = linkDe('perfil', usuario)
  const quien = nombre?.trim() ? `${nombre.trim()} (@${usuario})` : `@${usuario}`
  await ofrecer(enlace, `Mirá el perfil de ${quien} en dnmusic: ${enlace}`)
}

/**
 * Usa patrones de `useSegments`: distingue `[id]` de rutas internas
 * como /lista/nueva, que tienen la misma forma que un enlace compartido.
 */
export function esAterrizaje(segmentos: readonly string[]): boolean {
  return (
    segmentos.length === 2 &&
    (COMPARTIBLES as readonly string[]).includes(segmentos[0]) &&
    /^\[[a-z]+\]$/.test(segmentos[1])
  )
}
