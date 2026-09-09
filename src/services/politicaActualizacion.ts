/** Contrato deliberadamente acotado a releases estables major.minor.patch. */
export const PLATAFORMAS = ['windows', 'linux', 'macos', 'ios', 'android', 'web'] as const
export type PlataformaActualizacion = typeof PLATAFORMAS[number]
export type PoliticaActualizacion = {
  platform: PlataformaActualizacion
  latest_version: string
  minimum_version: string
  update_url: string
  enabled: boolean
  revision: number
}
export type Instalacion = { platform: PlataformaActualizacion; version: string }
const VERSION = /^(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})$/
export const esVersionEstable = (v: unknown): v is string => typeof v === 'string' && v.trim() === v && VERSION.test(v)

export function compararVersiones(a: string, b: string): number {
  if (!esVersionEstable(a) || !esVersionEstable(b)) throw new Error('Usá versiones estables como 1.12.0.')
  const aa = a.split('.').map(Number), bb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if (aa[i] !== bb[i]) return aa[i] < bb[i] ? -1 : 1
  return 0
}

/** Lista de destinos del producto; la misma restricción se exige en SQL. */
export function esDestinoActualizacion(platform: PlataformaActualizacion, value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048 || /[\s\\]/.test(value)) return false
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return false
    if (platform === 'web') return /^https:\/\/dnmusic-app\.vercel\.app\/(?:\?[A-Za-z0-9_=&.%~-]*)?$/.test(value)
    if (platform === 'ios') return /^https:\/\/(?:apps\.apple\.com\/(?:[a-z]{2}\/)?app\/(?:[a-zA-Z0-9-]+\/)?id[0-9]+|testflight\.apple\.com\/join\/[A-Za-z0-9]+)$/.test(value)
    if (platform === 'android' && value === 'https://play.google.com/store/apps/details?id=com.nihuel.dnmusic') return true
    return /^https:\/\/github\.com\/Niiihuel\/dnmusic-releases\/releases\/(?:latest|tag\/v?[0-9]+\.[0-9]+\.[0-9]+|download\/v?[0-9]+\.[0-9]+\.[0-9]+\/[A-Za-z0-9_.-]+)$/.test(value)
  } catch { return false }
}

export function leerPolitica(value: unknown): PoliticaActualizacion {
  const p = value as Partial<PoliticaActualizacion> | null
  if (!p || !PLATAFORMAS.includes(p.platform!) || !esVersionEstable(p.latest_version) ||
      !esVersionEstable(p.minimum_version) || compararVersiones(p.minimum_version, p.latest_version) > 0 ||
      !esDestinoActualizacion(p.platform!, p.update_url) || typeof p.enabled !== 'boolean' ||
      !Number.isSafeInteger(p.revision) || p.revision! < 1) {
    throw new Error('Política inválida: revisá plataforma, versiones y URL de descarga admitida.')
  }
  return p as PoliticaActualizacion
}

export function evaluarPolitica(p: PoliticaActualizacion | null, instalada: Instalacion | null, descartada: string | null) {
  if (!p?.enabled || !instalada || p.platform !== instalada.platform) return 'ninguna' as const
  if (compararVersiones(instalada.version, p.minimum_version) < 0) return 'obligatoria' as const
  if (compararVersiones(instalada.version, p.latest_version) < 0 && descartada !== claveAviso(p)) return 'opcional' as const
  return 'ninguna' as const
}
export const claveAviso = (p: PoliticaActualizacion) => `${p.platform}:${p.latest_version}`

/** No confundir el navegador de un teléfono con su app nativa. */
export function detectarPlataforma(os: string, escritorio: boolean, userAgent = ''): PlataformaActualizacion | null {
  if (os === 'ios' || os === 'android') return os
  if (os !== 'web') return null
  if (!escritorio) return 'web'
  if (/Windows/.test(userAgent)) return 'windows'
  if (/Macintosh|Mac OS X/.test(userAgent)) return 'macos'
  if (/Linux/.test(userAgent)) return 'linux'
  return null // Un puente desconocido nunca recibe la política web.
}

/** Incluye la opcional descartada: descartarla no debe descubrir otro aviso debajo. */
export function politicaCubreAviso(p: PoliticaActualizacion | null, instalada: Instalacion | null): boolean {
  return !!p?.enabled && !!instalada && p.platform === instalada.platform && compararVersiones(instalada.version, p.latest_version) < 0
}
