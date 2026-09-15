import { getSupabase } from '../lib/supabase'

/**
 * Freno compartido por PC, Android e iOS antes de una subida directa.
 *
 * La decisión real la toma Postgres sumando todos los buckets. Se falla
 * cerrado: si no puede comprobarse la reserva, tampoco se arriesga Auth por
 * una imagen o un video nuevo.
 */
export async function assertStorageBudget(file: Blob | ArrayBuffer): Promise<void> {
  const bytes = file instanceof Blob ? file.size : file.byteLength
  const { data, error } = await getSupabase().rpc('storage_upload_allowed', {
    p_size: bytes,
    p_exclude: null,
  })
  if (error) throw new Error(`No se pudo comprobar el espacio disponible. ${error.message}`)
  if (data !== true) {
    throw new Error('No hay espacio seguro para subir este archivo. La reserva para iniciar sesión quedó protegida.')
  }
}
