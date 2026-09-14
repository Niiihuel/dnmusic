import { useEffect, useRef } from 'react'
import { View } from 'react-native'
import { Snackbar, SnackbarHost, type SnackbarHostRef } from '@expo/ui/jetpack-compose'
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers'
import { useAppActiva } from '../lib/appActiva'
import { limpiarAviso, useAviso } from '../state/aviso'
import { useHayAvisoActualizacion } from '../state/actualizacion'
import { usePiso } from '../state/shell'
import { AndroidHost, ANDROID_COLORS as color } from './AndroidHost'

const SOBRE_ACTUALIZACION = 64

/** Los avisos globales pertenecen al SnackbarHost de Material en Android. */
export function Aviso() {
  const activa = useAppActiva()
  const { texto, turno, malo } = useAviso()
  const hayActualizacion = useHayAvisoActualizacion()
  const piso = usePiso(12) + (hayActualizacion ? SOBRE_ACTUALIZACION : 0)
  const host = useRef<SnackbarHostRef>(null)

  useEffect(() => {
    if (!texto || !activa) return
    let vigente = true
    void host.current?.showSnackbar({
      message: texto,
      duration: malo ? 'long' : 'short',
    }).finally(() => {
      if (vigente) limpiarAviso(turno)
    })
    return () => { vigente = false }
  }, [activa, malo, texto, turno])

  return <View pointerEvents="box-none" style={{ position: 'absolute', left: 12, right: 12, bottom: piso, minHeight: 64 }}>
    <AndroidHost style={{ width: '100%', height: 64 }}>
      <SnackbarHost ref={host} modifiers={[fillMaxWidth()]}>
        <Snackbar containerColor={color.raised} contentColor={color.text} />
      </SnackbarHost>
    </AndroidHost>
  </View>
}
