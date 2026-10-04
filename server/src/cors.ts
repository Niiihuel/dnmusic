/** El esquema seguro registrado por Electron en desktop/src/protocolo.ts. */
const ORIGEN_ESCRITORIO = 'app://dnmusic'

const ORIGENES = (process.env.ALLOWED_ORIGIN ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

/** Las dos entradas HTTP del servicio deben aceptar los mismos clientes. */
export function cors(origen: string | null | undefined): Record<string, string> {
  const permitido = ORIGENES.length === 0
    ? '*'
    : origen && (origen === ORIGEN_ESCRITORIO || ORIGENES.includes(origen)) ? origen : null
  return {
    ...(permitido ? { 'Access-Control-Allow-Origin': permitido } : {}),
    Vary: 'Origin',
    'Access-Control-Allow-Headers': 'content-type, authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  }
}
