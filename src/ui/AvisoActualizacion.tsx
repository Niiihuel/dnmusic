import { descartarAviso, descargarActualizacion, instalarActualizacion, PUEDE_DESCARGAR_ACTUALIZACION, useAvisoDeActualizacion } from '../state/actualizacion'
import { Text, View } from 'react-native'
import { useAjustesCargados } from '../state/ajustes'
import { useUser } from '../state/session'
import { useSegments } from 'expo-router'
import { DialogoVersion } from './DialogoVersion'
import { TarjetaVersion } from './TarjetaVersion'
import { PrimaryButton, GhostButton } from './Button'

/** Aparece al detectar una versión; instalar sólo está disponible con la descarga verificada. */
export function AvisoActualizacion() {
  const aviso = useAvisoDeActualizacion()
  const usuario = useUser()
  const cargados = useAjustesCargados()
  const segmentos = useSegments() as string[]
  const visible = !!aviso && !!usuario && cargados && segmentos[0] !== 'onboarding' && segmentos[0] !== 'vincular-google'
  const cerrar = () => { if (aviso) descartarAviso(aviso.version) }
  const lista = aviso?.fase === 'lista'
  const porcentaje = aviso?.fase === 'bajando' && Number.isFinite(aviso.porcentaje) ? Math.max(0, Math.min(100, Math.round(aviso.porcentaje))) : 0
  return <DialogoVersion visible={visible} titulo="Nueva versión de dnmusic" onCerrar={cerrar}>
    {visible && aviso ? <TarjetaVersion key={aviso.version} version={aviso.version} etiqueta={lista ? 'Lista para instalar' : 'Nueva versión disponible'} titulo={aviso.notas?.titulo || 'Tu música, cada vez mejor.'}
      detalle={lista ? 'La actualización está descargada. Reiniciá cuando quieras; también se instala al cerrar.' : aviso.fase === 'bajando' ? 'Estamos descargando la actualización. Tu música sigue.' : 'La descarga empieza cuando pauses la música. Podés seguir escuchando.'}
      cambios={aviso.notas?.cambios} pasos={aviso.notas?.pasos} onCerrar={cerrar}>
      {aviso.fase === 'bajando' ? <View style={{ gap: 8 }} accessibilityRole="progressbar" accessibilityLabel="Descarga de actualización" accessibilityValue={{ min: 0, max: 100, now: porcentaje }}>
        <View style={{ height: 3, borderRadius: 2, backgroundColor: '#404040' }}><View style={{ height: 3, width: `${porcentaje}%`, borderRadius: 2, backgroundColor: '#fff' }} /></View>
        <Text style={{ color: '#b3b3b3', fontSize: 12 }}>{porcentaje}% descargado</Text>
      </View> : null}
      {lista ? <PrimaryButton label="Reiniciar e instalar" onPress={instalarActualizacion} /> : aviso.fase === 'esperando-silencio' && PUEDE_DESCARGAR_ACTUALIZACION ? <PrimaryButton label="Descargar ahora" onPress={descargarActualizacion} /> : null}
      <GhostButton label="Seguir escuchando" onPress={cerrar} />
    </TarjetaVersion> : null}
  </DialogoVersion>
}
