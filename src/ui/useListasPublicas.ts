import { useEffect, useState } from 'react'
import { listPublicPlaylists, subscribePublicPlaylistChanges, type Playlist } from '../services/playlists'

type Lectura = { ownerId: string; listas: Playlist[] | null; cargando: boolean; error: string | null }

/** Recarga al volver al perfil y después de publicar/despublicar. La versión
 * del pedido impide que una consulta anterior restaure una lista ya privada. */
export function useListasPublicas(ownerId: string, recarga: number) {
  const [lectura, setLectura] = useState<Lectura | null>(null)
  const [reintento, setReintento] = useState(0)
  useEffect(() => {
    let vivo = true, version = 0
    async function cargar() {
      const pedido = ++version
      setLectura(prev => ({ ownerId, listas: prev?.ownerId === ownerId ? prev.listas : null, cargando: true, error: null }))
      try {
        const listas = await listPublicPlaylists(ownerId)
        if (vivo && pedido === version) setLectura({ ownerId, listas, cargando: false, error: null })
      } catch {
        if (vivo && pedido === version) setLectura(prev => ({ ownerId, listas: prev?.ownerId === ownerId ? prev.listas : null,
          cargando: false, error: 'No se pudieron cargar las listas públicas. Volvé a intentar.' }))
      }
    }
    const desuscribir = subscribePublicPlaylistChanges(id => { if (id === ownerId) void cargar() })
    void cargar()
    return () => { vivo = false; desuscribir() }
  }, [ownerId, recarga, reintento])
  const actual = lectura?.ownerId === ownerId ? lectura : null
  return { listas: actual?.listas ?? null, cargando: actual?.cargando ?? true, error: actual?.error ?? null,
    reintentar: () => setReintento(n => n + 1) }
}
