import type { PlaylistTrack } from '../services/playlists'

export type RedPrecarga = 'no' | 'datos' | 'amplia'
/** Diez minutos listos, conservando al menos dos temas y un techo de memoria/disco. */
export function ventanaPrecarga(candidatas: PlaylistTrack[], red: RedPrecarga, disco: boolean): PlaylistTrack[] {
  if (red === 'no') return []
  const maximo = disco && red === 'amplia' ? 5 : 2
  let duracion = 0
  const salida: PlaylistTrack[] = []
  for (const track of candidatas.slice(0, maximo)) {
    salida.push(track)
    duracion += Number.isFinite(track.durationMs) && track.durationMs > 0 ? track.durationMs : 180_000
    if (salida.length >= 2 && duracion >= 600_000) break
  }
  return salida
}

export function clasificarRedPrecarga({ conectada, segura, datosPermitidos, ahorro = false, lenta = false }: {
  conectada: boolean; segura: boolean; datosPermitidos: boolean; ahorro?: boolean; lenta?: boolean
}): RedPrecarga {
  if (!conectada || ahorro || lenta) return 'no'
  return segura ? 'amplia' : datosPermitidos ? 'datos' : 'no'
}
