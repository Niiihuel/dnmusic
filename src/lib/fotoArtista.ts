import { fetchArtist, proxiedImage } from '../services/music'
const fotos = new Map<string, { hasta: number; promesa: Promise<string> }>()
export function fotoDelArtista(id: string): Promise<string> {
  if (!id) return Promise.resolve('')
  const cache = fotos.get(id)
  if (cache && cache.hasta > Date.now()) return cache.promesa
  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), 8000)
  const entrada = { hasta: Date.now() + 60_000, promesa: Promise.resolve('') }
  entrada.promesa = fetchArtist(id, control.signal)
    .then((a) => {
      const url = proxiedImage(a?.photoUrl ?? '')
      if (url) entrada.hasta = Date.now() + 30 * 60_000
      return url
    })
    .finally(() => clearTimeout(reloj))
  if (fotos.size >= 100) fotos.delete(fotos.keys().next().value!)
  fotos.set(id, entrada)
  return entrada.promesa
}
