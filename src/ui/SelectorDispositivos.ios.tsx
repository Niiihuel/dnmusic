import { Modal } from 'react-native'
import { cerrarSelectorDispositivos, useSelectorDispositivos } from '../state/escucha'
import { usePanelDispositivos } from './Dispositivos.shared'
import { BotonHoja, EncabezadoHoja } from './EncabezadoHoja'
import { Hoja } from './Hoja'
import { ListaAgrupada } from './ListaAgrupada'
import type { FilaAgrupada } from './ListaAgrupada.types'

/** Hoja del sistema con List/Section de SwiftUI. Los destinos y su estado se
 * actualizan mientras está abierta; seleccionar no descarta la confirmación
 * ni los errores que llegan después desde el servidor. */
export function SelectorDispositivos() {
  const abierto = useSelectorDispositivos()
  const panel = usePanelDispositivos()

  if (!abierto) return null

  const filas: FilaAgrupada[] = panel.filas.map((fila) => ({
    tipo: 'accion',
    id: fila.id,
    rotulo: fila.nombre,
    detalle: fila.detalle,
    symbol: fila.estado === 'sonando' ? 'waveform'
      : fila.estado === 'pausado' ? 'pause.circle'
        : fila.estado === 'preparando' ? 'hourglass'
          : fila.estado === 'desconectado' ? 'wifi.slash'
            : fila.esEste ? 'iphone' : 'desktopcomputer',
    // Un valor, incluso vacío, conserva el rótulo y el detalle de la fila.
    // Seleccionado sólo indica destino; "sonando" lo determina la actividad.
    valor: fila.seleccionado ? 'Seleccionado' : '',
    disabled: fila.disabled,
    busy: fila.busy,
    onPress: () => { if (!fila.disabled && !fila.busy) panel.elegir(fila.id) },
  }))

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="formSheet"
      allowSwipeDismissal
      onRequestClose={cerrarSelectorDispositivos}
      accessibilityLabel="Escuchar en"
    >
      <Hoja titulo="Escuchar en" onCerrar={cerrarSelectorDispositivos}>
        <EncabezadoHoja
          titulo="Escuchar en"
          sobre={panel.resumen}
          izquierda={<BotonHoja tipo="cerrar" label="Cerrar el selector de dispositivos" onPress={cerrarSelectorDispositivos} />}
          velo={false}
        />
        <ListaAgrupada
          label="Dispositivos para escuchar"
          piso={32}
          secciones={[
            {
              id: 'dispositivos',
              titulo: 'Tus dispositivos',
              filas: filas.length ? filas : [{
                tipo: 'dato', id: 'sin-dispositivos', rotulo: 'Dispositivos', valor: 'Ninguno disponible',
              }],
              pie: panel.detalle,
            },
            ...(panel.mensaje ? [{
              id: 'transferencia',
              titulo: 'Cambio de dispositivo',
              filas: [{
                tipo: 'dato' as const, id: 'resultado', rotulo: 'Estado',
                valor: panel.error ? 'No se pudo cambiar' : panel.pendiente ? 'Conectando' : 'Confirmado',
              }],
              error: panel.error ? panel.mensaje : undefined,
              pie: panel.error ? undefined : panel.mensaje,
            }] : []),
          ]}
        />
      </Hoja>
    </Modal>
  )
}
