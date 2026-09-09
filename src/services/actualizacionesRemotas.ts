import { getSupabase } from '../lib/supabase'
import { leerPolitica, type PlataformaActualizacion, type PoliticaActualizacion } from './politicaActualizacion'

const PLAZO_MS = 12_000
async function rpc(name: string, args?: Record<string, unknown>): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PLAZO_MS)
  try {
    const { data, error } = await getSupabase().rpc(name, args).abortSignal(controller.signal)
    if (error) throw new Error(`No se pudo consultar o guardar la política (${error.code ?? 'red'}). Si falta la RPC, aplicá la migración de actualizaciones.`)
    return data
  } finally { clearTimeout(timer) }
}
export async function consultarPolitica(platform: PlataformaActualizacion): Promise<PoliticaActualizacion | null> {
  const data = await rpc('update_policy', { p_platform: platform })
  if (data === null) return null // Ausencia confirmada, distinta de un error de infraestructura.
  const p = leerPolitica(data)
  if (p.platform !== platform) throw new Error('La política corresponde a otra plataforma.')
  return p
}
export async function listarPoliticas(): Promise<PoliticaActualizacion[]> {
  const data = await rpc('admin_update_policies')
  if (!Array.isArray(data)) throw new Error('Respuesta de administración inválida.')
  return data.map(leerPolitica)
}
export async function guardarPolitica(p: PoliticaActualizacion, revisionEsperada: number): Promise<PoliticaActualizacion> {
  leerPolitica(p)
  const data = await rpc('admin_save_update_policy', {
    p_platform: p.platform, p_latest_version: p.latest_version, p_minimum_version: p.minimum_version,
    p_update_url: p.update_url, p_enabled: p.enabled, p_expected_revision: revisionEsperada,
  })
  const guardada = leerPolitica(data)
  if (guardada.platform !== p.platform || guardada.revision !== revisionEsperada + 1) throw new Error('No se pudo confirmar el guardado. Volvé a cargar.')
  return guardada
}
