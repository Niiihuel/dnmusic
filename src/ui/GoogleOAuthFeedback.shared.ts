export type ContextoGoogle = 'acceso' | 'registro' | 'vinculacion'
export type SuperficieGoogle = 'ios' | 'escritorio' | 'web' | 'otro'

export function textoEsperaGooglePara(contexto: ContextoGoogle, superficie: SuperficieGoogle): string {
  if (superficie === 'escritorio') {
    if (contexto === 'vinculacion') {
      return 'Google se abrió en tu navegador. Terminá ahí y volverás a esta misma cuenta.'
    }
    if (contexto === 'registro') {
      return 'Terminá el alta en tu navegador. Al volver, la solicitud quedará lista para que @nihuel la apruebe.'
    }
    return 'Google se abrió en tu navegador. Completá el acceso ahí; al terminar, dnmusic continuará en esta ventana.'
  }
  if (superficie === 'ios') {
    if (contexto === 'vinculacion') {
      return 'Terminá en la ventana segura de Google. Al volver, esta cuenta quedará conectada.'
    }
    if (contexto === 'registro') {
      return 'Terminá en la ventana segura de Google. Al volver, la solicitud quedará lista para que @nihuel la apruebe.'
    }
    return 'Terminá en la ventana segura de Google. Volverás automáticamente a dnmusic.'
  }
  if (superficie === 'web') return 'Te estamos llevando a Google…'
  return 'Terminá en Google. Volverás automáticamente a dnmusic.'
}

/** Conserva sólo mensajes accionables; los detalles internos de Auth no llegan a la UI. */
export function mensajeErrorGoogle(error: unknown, fallback: string): string {
  const code = (error as { code?: string })?.code ?? ''
  const message = error instanceof Error ? error.message : ''

  if (code === 'over_request_rate_limit') return 'Demasiados intentos. Probá de nuevo en un rato.'
  if (code === 'manual_linking_disabled') return 'La vinculación con Google todavía no está habilitada. Intentá más tarde.'
  if (code === 'identity_already_exists') return 'Ese Google ya está conectado a otra cuenta de dnmusic. Elegí otro.'
  if (message.includes('Failed to fetch') || message.includes('Network')) return 'Sin conexión. Revisá internet y volvé a intentarlo.'

  const accionables = [
    'Actualizá la app de escritorio',
    'Para usar Google, abrí una compilación',
    'Iniciá sesión antes de conectar Google',
    'La sesión cambió',
    'Google no devolvió la cuenta original',
    'No se confirmó la vinculación',
    'El inicio con Google venció',
  ]
  return accionables.some(fragmento => message.includes(fragmento)) ? message : fallback
}
