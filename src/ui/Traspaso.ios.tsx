import { Modal } from 'react-native'
import { BotonHoja, EncabezadoHoja } from './EncabezadoHoja'
import { Hoja } from './Hoja'
import { ListaAgrupada } from './ListaAgrupada'
import { useConfirmacionTraspaso } from './Traspaso.shared'

/** El resultado llega del servidor: la hoja sigue visible para esperar o reintentar. */
export function Traspaso() {
  const { pendiente, ocupado, error, confirmar, cancelar } = useConfirmacionTraspaso()
  if (!pendiente) return null
  return <Modal visible animationType="slide" presentationStyle="formSheet"
    allowSwipeDismissal={!ocupado} onRequestClose={cancelar} accessibilityLabel="Traer la música">
    <Hoja titulo="Traer la música" onCerrar={cancelar}>
      <EncabezadoHoja titulo="Traer la música" sobre={`La escucha está en ${pendiente.nombre}`}
        izquierda={<BotonHoja tipo="cerrar" label="Seguir allá" onPress={cancelar} disabled={ocupado} />} velo={false} />
      <ListaAgrupada label="Confirmar cambio de dispositivo" piso={32} secciones={[{
        id: 'decision',
        titulo: 'Dónde querés escuchar',
        filas: [
          { tipo: 'accion', id: 'traer', rotulo: ocupado ? 'Esperando confirmación…' : 'Traer acá', symbol: 'iphone', busy: ocupado,
            onPress: () => { void confirmar() } },
          { tipo: 'accion', id: 'seguir', rotulo: 'Seguir allá', symbol: 'arrow.uturn.backward', disabled: ocupado, onPress: cancelar },
        ],
        error: error ?? undefined,
        pie: ocupado ? 'Esperando que se confirme el cambio de dispositivo.' : 'Podés traer la música en el segundo por el que va, o dejarla donde está.',
      }]} />
    </Hoja>
  </Modal>
}
