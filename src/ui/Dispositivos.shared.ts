import { nombreDispositivo } from '../lib/dispositivo'
import { usePlaybackTrack } from '../state/playback'
import { useJamActivo } from '../state/jam'
import {
  mandarEscuchaA, traerEscuchaAca, useActividadEscucha, useConexionEscucha,
  useDispositivos, useDispositivoSeleccionado, useEsteDispositivo, useTransferenciaEscucha,
} from '../state/escucha'

type EstadoActividad = 'sonando' | 'pausado' | 'preparando' | 'desconectado' | 'inactivo'
type Actividad = { deviceId: string | null; nombre: string | null; estado: EstadoActividad }
type Conexion = 'conectando' | 'conectado' | 'desconectado'
type Transferencia = null | { destino: string; estado: 'pendiente' | 'confirmada' | 'error'; error: string | null }
export type FilaDispositivo = {
  id: string; nombre: string; detalle: string; estado: Exclude<EstadoActividad, 'inactivo'> | 'disponible'
  esEste: boolean; seleccionado: boolean; disabled: boolean; busy: boolean
}

/** Estado de presentación compartido: conectado, seleccionado y sonando son datos distintos. */
export function crearPanelDispositivos({ actividad, conexion, transferencia, dispositivos, esteId, seleccionadoId, hayCancion, enJam, nombreLocal }: {
  actividad: Actividad; conexion: Conexion; transferencia: Transferencia
  dispositivos: { deviceId: string; nombre: string }[]; esteId: string | null; seleccionadoId: string | null
  hayCancion: boolean; enJam: boolean; nombreLocal: string
}) {
  const remoto = !!actividad.deviceId && actividad.deviceId !== esteId
  const donde = remoto ? actividad.nombre || 'otro dispositivo' : 'este dispositivo'
  const pendiente = transferencia?.estado === 'pendiente'
  const resumen = actividad.estado === 'sonando' ? `Sonando en ${donde}`
    : actividad.estado === 'pausado' ? `En pausa en ${donde}`
    : actividad.estado === 'preparando' ? `Preparando audio en ${donde}`
    : actividad.estado === 'desconectado' ? `Última reproducción en ${donde}`
    : conexion === 'conectando' ? 'Comprobando dispositivos' : 'Sin reproducción activa'
  const detalle = enJam ? 'Estás en un Jam. Cambiá dónde escuchás desde las opciones del Jam.'
    : conexion === 'desconectado' ? 'Sin conexión con tus dispositivos. La lista se actualizará al reconectar.'
    : conexion === 'conectando' ? 'Esperando el estado de tu cuenta.'
    : !hayCancion ? 'Elegí una canción para poder mover la reproducción.'
    : 'Elegí un destino. Conservamos la canción, la posición y la pausa.'
  const destinos = new Map(dispositivos.map(d => [d.deviceId, d]))
  if (esteId && !destinos.has(esteId)) destinos.set(esteId, { deviceId: esteId, nombre: nombreLocal })
  if (actividad.deviceId && !destinos.has(actividad.deviceId)) destinos.set(actividad.deviceId, {
    deviceId: actividad.deviceId, nombre: actividad.nombre || 'Otro dispositivo',
  })
  const presentes = new Set(dispositivos.map(d => d.deviceId))
  const filas: FilaDispositivo[] = [...destinos.values()].map<FilaDispositivo>(d => {
    const esEste = d.deviceId === esteId
    const seleccionado = d.deviceId === (actividad.deviceId ?? seleccionadoId)
    const conectado = conexion === 'conectado' && (esEste || presentes.has(d.deviceId))
    const estado = seleccionado && actividad.estado !== 'inactivo' ? actividad.estado : conectado ? 'disponible' : 'desconectado'
    const busy = pendiente && transferencia?.destino === d.deviceId
    const situacion = busy ? 'Cambiando de dispositivo…' : estado === 'sonando' ? 'Sonando ahora'
      : estado === 'pausado' ? 'En pausa' : estado === 'preparando' ? 'Preparando audio'
      : estado === 'desconectado' ? 'No disponible ahora' : 'Disponible'
    return { id: d.deviceId, nombre: d.nombre, esEste, seleccionado, estado, busy,
      detalle: esEste ? `Este dispositivo · ${situacion}` : situacion,
      disabled: pendiente || !conectado || !hayCancion || enJam || seleccionado,
    }
  }).sort((a, b) => Number(b.seleccionado) - Number(a.seleccionado) || Number(b.esEste) - Number(a.esEste) || a.nombre.localeCompare(b.nombre))
  const destino = filas.find(f => f.id === transferencia?.destino)?.nombre || 'el dispositivo'
  const mensaje = pendiente ? `Esperando confirmación de ${destino}…`
    : transferencia?.estado === 'error' ? transferencia.error || 'No se pudo cambiar de dispositivo. Intentá nuevamente.'
    : transferencia?.estado === 'confirmada' ? `Cambio a ${destino} confirmado.` : null
  return { resumen, detalle, estado: actividad.estado, remoto, pendiente, mensaje, error: transferencia?.estado === 'error', filas }
}

export function usePanelDispositivos() {
  const actividad = useActividadEscucha()
  const conexion = useConexionEscucha()
  const transferencia = useTransferenciaEscucha()
  const dispositivos = useDispositivos()
  const esteId = useEsteDispositivo()
  const seleccionadoId = useDispositivoSeleccionado()
  const track = usePlaybackTrack()
  const enJam = useJamActivo()
  const panel = crearPanelDispositivos({ actividad, conexion, transferencia, dispositivos, esteId, seleccionadoId,
    hayCancion: !!track, enJam, nombreLocal: nombreDispositivo() })
  return { ...panel, elegir(id: string) {
    if (!panel.filas.some(f => f.id === id && !f.disabled)) return
    if (id === esteId) void traerEscuchaAca()
    else void mandarEscuchaA(id)
  } }
}

/** Resumen liviano para los controles persistentes; no se suscribe al progreso. */
export function useDestinoEscucha() {
  const actividad = useActividadEscucha()
  const conexion = useConexionEscucha()
  const esteId = useEsteDispositivo()
  const enJam = useJamActivo()
  const remoto = !enJam && !!actividad.deviceId && actividad.deviceId !== esteId
  const donde = remoto ? actividad.nombre || 'otro dispositivo' : 'este dispositivo'
  const resumen = enJam ? 'Escuchando en un Jam'
    : actividad.estado === 'sonando' ? `Sonando en ${donde}`
    : actividad.estado === 'pausado' ? `En pausa en ${donde}`
    : actividad.estado === 'preparando' ? `Preparando audio en ${donde}`
    : actividad.estado === 'desconectado' ? `Última reproducción en ${donde}`
    : conexion === 'conectando' ? 'Comprobando dispositivos'
    : conexion === 'desconectado' ? 'Dispositivos sin conexión' : 'Sin reproducción activa'
  return { resumen, remoto, estado: actividad.estado }
}
