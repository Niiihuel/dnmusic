import { estadoDiscordRemoto, identidadControlDiscord, mensajeControlDiscord, type EstadoDiscordRemoto, type MensajeControlDiscord, type PresenciaControlDiscord } from './protocoloDiscordRemoto'

export type DispositivoDiscord = { deviceId: string; nombre: string; estado: EstadoDiscordRemoto }
export type EstadoControlDiscord = { dispositivos: DispositivoDiscord[]; conexion: 'conectando' | 'conectado' | 'desconectado'; pendiente: string | null; error: string | null }
export type ConexionControlDiscord = {
  userId: string | null; deviceId: string | null; sesion: string | null; conexion: EstadoControlDiscord['conexion']
  presentes: { deviceId: string; nombre: string; controlDiscord?: PresenciaControlDiscord }[]
}
export type CambioDiscordLocal = { terminado: Promise<boolean>; confirmar?: () => void; cancelar: () => void }
export type AdaptadorDiscordLocal = {
  leer: () => { cargado: boolean; guardando: boolean; estado: EstadoDiscordRemoto }
  cambiar: (enabled: boolean) => CambioDiscordLocal
}
type Dependencias = {
  userId: string
  permitido: () => boolean
  conexion: () => ConexionControlDiscord
  enviar: (mensaje: MensajeControlDiscord) => Promise<void>
  anunciar: (estado: EstadoDiscordRemoto | null) => void
  notificar: (estado: EstadoControlDiscord) => void
  local?: AdaptadorDiscordLocal
}
type Pedido = { mensaje: MensajeControlDiscord; resolver: () => void; timer: ReturnType<typeof setTimeout>; fase: 'oferta' | 'resultado' | 'confirmando' }
type Recepcion = { mensaje: MensajeControlDiscord; timer: ReturnType<typeof setTimeout>; fase: 'aplicar' | 'configurando' | 'confirmar'; cambio?: CambioDiscordLocal; configurado: boolean }
const PLAZO_MS = 35_000
const OFERTA_MS = 8_000
const ERRORES = { ocupado: 'Discord está cambiando en esa computadora. Volvé a intentar.', fallo: 'No se pudo conectar. Abrí Discord en esa computadora y volvé a intentar.', cancelado: 'El pedido fue cancelado.' }

/**
 * Solicitar/ofrecer no activa nada. Aplicar requiere una oferta vigente y el
 * resultado espera al READY real del IPC. Hasta confirmar, la PC mantiene una
 * operación cancelable y vence por sí sola si el teléfono desaparece. No hay
 * reintentos de comandos ni comparación de relojes entre dispositivos.
 */
export function crearControlDiscordRemoto(d: Dependencias) {
  let cerrado = false, identidad = '', salida: Pedido | null = null, entrada: Recepcion | null = null
  let error: string | null = null, anuncio = '', firmaEstado = ''
  const vistos = new Set<string>()
  const confirmados = new Map<string, { origen: string; origenSesion: string; cancelar: () => void; timer: ReturnType<typeof setTimeout> }>()
  const vigente = () => !cerrado && d.permitido() && d.conexion().userId === d.userId
  const conectado = () => vigente() && d.conexion().conexion === 'conectado' && !!d.conexion().deviceId && !!d.conexion().sesion
  const peer = (id: string) => d.conexion().presentes.find(p => p.deviceId === id)
  const contraparteVigente = (m: MensajeControlDiscord) => peer(m.origen)?.controlDiscord?.sesion === m.origenSesion
  const enviar = (m: MensajeControlDiscord) => d.enviar(m)
  const responder = (m: MensajeControlDiscord, tipo: MensajeControlDiscord['tipo'], extras: Partial<MensajeControlDiscord> = {}): MensajeControlDiscord => ({
    version: 1, tipo, requestId: m.requestId, origen: m.destino, origenSesion: m.destinoSesion,
    destino: m.origen, destinoSesion: m.origenSesion, ...extras,
  })
  function publicar() {
    const c = d.conexion()
    const dispositivos = conectado() ? c.presentes.flatMap(p => p.deviceId !== c.deviceId && p.controlDiscord?.discord
      ? [{ deviceId: p.deviceId, nombre: p.nombre, estado: p.controlDiscord.discord }] : []) : []
    const estado = { dispositivos, conexion: vigente() ? c.conexion : 'desconectado' as const, pendiente: salida?.mensaje.destino ?? null, error }
    const firma = JSON.stringify(estado)
    if (firma !== firmaEstado) { firmaEstado = firma; d.notificar(estado) }
  }
  function cancelarSalida(mensaje: string | null, notificar = true) {
    const op = salida
    if (!op) return
    salida = null; clearTimeout(op.timer)
    // Después del resultado real, una partición puede perder el ACK final.
    // No inventamos un estado desactivado ni reintentamos el alta.
    error = op.fase === 'confirmando' ? 'No pudimos confirmar el cambio final. Revisá el estado cuando esa computadora vuelva a conectarse.' : mensaje
    // El cancel viaja una vez. Si no llega, la oferta/operación de la PC vence.
    void enviar({ ...op.mensaje, tipo: 'cancelar' }).catch(() => {})
    op.resolver()
    if (notificar) publicar()
  }
  function cerrarEntrada(op: Recepcion, cancelar: boolean) {
    if (entrada === op) entrada = null
    clearTimeout(op.timer)
    if (cancelar) op.cambio?.cancelar()
  }
  function fallarEntrada(op: Recepcion, causa: 'ocupado' | 'fallo' | 'cancelado') {
    cerrarEntrada(op, true)
    if (conectado()) void enviar(responder(op.mensaje, 'resultado', { error: causa })).catch(() => {})
  }
  function confirmarEntrada(op: Recepcion) {
    cerrarEntrada(op, false)
    if (!op.cambio) return
    op.cambio.confirmar?.()
    // Un cancel enviado justo antes del ACK final aún revoca esta intención.
    // El adaptador no revoca una elección local posterior de la persona.
    const requestId = op.mensaje.requestId
    const timer = setTimeout(() => confirmados.delete(requestId), PLAZO_MS)
    confirmados.set(requestId, { origen: op.mensaje.origen, origenSesion: op.mensaje.origenSesion, cancelar: op.cambio.cancelar, timer })
  }
  function comprobarEntrada() {
    const op = entrada
    if (!op || op.fase === 'aplicar' || !op.configurado || !d.local) return
    const local = d.local.leer()
    if (local.guardando) return
    const estado = estadoDiscordRemoto(local.estado)
    const listo = estado && (op.mensaje.enabled ? estado.enabled && ['ready', 'published'].includes(estado.status) : !estado.enabled && estado.status === 'disabled')
    if (listo && op.fase === 'configurando') {
      op.fase = 'confirmar'
      void enviar(responder(op.mensaje, 'resultado', { estado })).catch(() => { if (entrada === op) fallarEntrada(op, 'fallo') })
    } else if (!listo && estado?.status !== 'connecting') fallarEntrada(op, 'fallo')
  }
  function actualizar() {
    if (cerrado) return
    const c = d.conexion()
    const siguiente = conectado() ? `${c.userId}:${c.deviceId}:${c.sesion}` : ''
    if (siguiente !== identidad) {
      cancelarSalida('La conexión cambió. Volvé a elegir la computadora.', false)
      if (entrada) cerrarEntrada(entrada, true)
      vistos.clear()
      for (const terminado of confirmados.values()) clearTimeout(terminado.timer)
      confirmados.clear()
      identidad = siguiente
    }
    if (salida && peer(salida.mensaje.destino)?.controlDiscord?.sesion !== salida.mensaje.destinoSesion) cancelarSalida('Esa computadora dejó de estar disponible.', false)
    if (entrada && !contraparteVigente(entrada.mensaje)) cerrarEntrada(entrada, true)
    const local = d.local?.leer()
    const estado = conectado() && local?.cargado ? estadoDiscordRemoto(local.estado) : null
    const firma = JSON.stringify(estado)
    if (firma !== anuncio) { anuncio = firma; d.anunciar(estado) }
    comprobarEntrada()
    publicar()
  }
  function recibir(valor: unknown) {
    if (!conectado()) return
    const m = mensajeControlDiscord(valor), c = d.conexion()
    if (!m || m.destino !== c.deviceId || m.destinoSesion !== c.sesion || m.origen === c.deviceId || !contraparteVigente(m)) return
    const pedido = salida
    if (pedido && m.requestId === pedido.mensaje.requestId && m.origen === pedido.mensaje.destino && m.origenSesion === pedido.mensaje.destinoSesion) {
      if (m.tipo === 'oferta' && pedido.fase === 'oferta') {
        pedido.fase = 'resultado'
        void enviar({ ...pedido.mensaje, tipo: 'aplicar' }).catch(() => { if (salida === pedido) cancelarSalida('No se pudo confirmar el pedido en esa computadora.') })
      } else if (m.tipo === 'resultado') {
        if (m.error) { cancelarSalida(ERRORES[m.error]); return }
        const estado = m.estado
        const coincide = pedido.mensaje.enabled ? estado?.enabled && ['ready', 'published'].includes(estado.status) : estado && !estado.enabled && estado.status === 'disabled'
        if (pedido.fase !== 'resultado' || !coincide) return
        pedido.fase = 'confirmando'
        void enviar({ ...pedido.mensaje, tipo: 'confirmar' }).then(() => {
          if (salida !== pedido || !conectado()) return
          salida = null; clearTimeout(pedido.timer); error = null; pedido.resolver(); publicar()
        }).catch(() => { if (salida === pedido) cancelarSalida('La confirmación final no llegó. Volvé a intentar.') })
      }
      return
    }
    if (!d.local) return
    const previo = confirmados.get(m.requestId)
    if (m.tipo === 'cancelar') {
      if (vistos.size < 256) vistos.add(m.requestId)
      if (entrada?.mensaje.requestId === m.requestId && entrada.mensaje.origen === m.origen && entrada.mensaje.origenSesion === m.origenSesion) cerrarEntrada(entrada, true)
      if (previo && previo.origen === m.origen && previo.origenSesion === m.origenSesion) { previo.cancelar(); clearTimeout(previo.timer); confirmados.delete(m.requestId) }
      return
    }
    if (m.tipo === 'solicitud') {
      if (vistos.has(m.requestId)) return
      // Acotado por sesión; al saturarse nunca se olvidan IDs para aceptar replays.
      if (vistos.size >= 256) return
      vistos.add(m.requestId)
      const local = d.local.leer()
      if (!local.cargado || local.guardando || entrada) { void enviar(responder(m, 'resultado', { error: 'ocupado' })).catch(() => {}); return }
      const op: Recepcion = { mensaje: m, configurado: false, fase: 'aplicar', timer: setTimeout(() => { if (entrada === op) cerrarEntrada(op, true) }, OFERTA_MS) }
      entrada = op
      void enviar(responder(m, 'oferta')).catch(() => { if (entrada === op) cerrarEntrada(op, true) })
      return
    }
    const op = entrada
    if (!op || op.mensaje.requestId !== m.requestId || op.mensaje.origen !== m.origen || op.mensaje.origenSesion !== m.origenSesion) return
    if (m.tipo === 'aplicar' && op.fase === 'aplicar') {
      const local = d.local.leer()
      if (!local.cargado || local.guardando) { fallarEntrada(op, 'ocupado'); return }
      clearTimeout(op.timer)
      op.timer = setTimeout(() => { if (entrada === op) fallarEntrada(op, 'fallo') }, PLAZO_MS)
      op.fase = 'configurando'
      op.cambio = d.local.cambiar(op.mensaje.enabled === true)
      void op.cambio.terminado.then(exito => {
        if (entrada !== op) return
        if (!exito) { fallarEntrada(op, 'fallo'); return }
        op.configurado = true; comprobarEntrada()
      }).catch(() => { if (entrada === op) fallarEntrada(op, 'fallo') })
    } else if (m.tipo === 'confirmar' && op.fase === 'confirmar') confirmarEntrada(op)
  }
  function configurar(deviceId: string, enabled: boolean): Promise<void> {
    if (salida) return Promise.resolve()
    actualizar()
    const c = d.conexion(), destino = peer(deviceId)
    if (!conectado() || !destino?.controlDiscord?.discord || deviceId === c.deviceId) {
      error = 'Esa computadora no está disponible para Discord.'; publicar(); return Promise.resolve()
    }
    error = null
    const mensaje: MensajeControlDiscord = { version: 1, tipo: 'solicitud', requestId: identidadControlDiscord(), origen: c.deviceId!, origenSesion: c.sesion!, destino: deviceId, destinoSesion: destino.controlDiscord.sesion, enabled }
    return new Promise(resolve => {
      const op: Pedido = { mensaje, resolver: resolve, fase: 'oferta', timer: setTimeout(() => { if (salida === op) cancelarSalida('No recibimos confirmación de esa computadora. Abrí Discord allí y volvé a intentar.') }, PLAZO_MS) }
      salida = op; publicar()
      void enviar(mensaje).catch(() => { if (salida === op) cancelarSalida('No se pudo enviar el pedido a esa computadora.') })
    })
  }
  return {
    actualizar, recibir, configurar,
    cancelar: () => cancelarSalida(null),
    cerrar: () => {
      cancelarSalida(null, false)
      if (entrada) cerrarEntrada(entrada, true)
      for (const terminado of confirmados.values()) clearTimeout(terminado.timer)
      confirmados.clear(); vistos.clear(); cerrado = true
      d.anunciar(null)
      d.notificar({ dispositivos: [], conexion: 'desconectado', pendiente: null, error: null })
    },
  }
}
