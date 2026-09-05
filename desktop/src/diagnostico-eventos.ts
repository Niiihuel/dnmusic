/** Campos permitidos: los eventos nunca transportan URLs, cookies ni PO tokens. */
export type EventoDiagnostico = {
  etapa: 'sesion' | 'cliente' | 'formato' | 'descifrado' | 'token' | 'rango' | 'reintento'
  cliente?: string
  estado?: string
  itag?: number
  bytes?: number
  total?: number
  desde?: number
  hasta?: number
  status?: number
  intento?: number
  esperaMs?: number
  duracionMs?: number
}
export type ObservadorDiagnostico = (evento: EventoDiagnostico) => void
