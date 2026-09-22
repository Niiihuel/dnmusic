import { useRouter, useSegments } from 'expo-router'
import { marcarNovedadesVistas, useNovedadesPendientes } from '../state/novedadesVistas'
import { useAjustesCargados, usePreferencia } from '../state/ajustes'
import { useUser } from '../state/session'
import { useHayAvisoActualizacion } from '../state/actualizacion'
import { usePoliticaActualizacion } from '../state/politicaActualizacion'
import { evaluarPolitica } from '../services/politicaActualizacion'
import { TarjetaVersion } from './TarjetaVersion'
import { DialogoVersion } from './DialogoVersion'
import { PrimaryButton, GhostButton } from './Button'

/** Una vez por versión instalada; el aviso de una actualización disponible tiene prioridad. */
export function NovedadesAlAbrir() {
  const pendientes = useNovedadesPendientes()
  const usuario = useUser()
  const segmentos = useSegments() as string[]
  const router = useRouter()
  const mostrar = usePreferencia('novedadesAlAbrir')
  const avisos = usePreferencia('avisosActualizacion')
  const cargados = useAjustesCargados()
  const actualizacionLista = useHayAvisoActualizacion()
  const politica = usePoliticaActualizacion()
  const tipo = evaluarPolitica(politica.politica, politica.instalacion, politica.descartada)
  const primera = pendientes?.[0]
  const visible = !!primera && !!usuario && segmentos[0] !== 'onboarding' && segmentos[0] !== 'vincular-google' && mostrar && cargados
    && !actualizacionLista && !(avisos && tipo !== 'ninguna')
  return <DialogoVersion visible={visible} titulo="Novedades de dnmusic" onCerrar={marcarNovedadesVistas}>
    {visible && primera ? <TarjetaVersion key={primera.version} version={primera.version} etiqueta="Ya está en tu app" titulo={primera.titulo}
      cambios={primera.cambios} pasos={primera.pasos} onCerrar={marcarNovedadesVistas}>
      <PrimaryButton label="Seguir escuchando" onPress={marcarNovedadesVistas} />
      <GhostButton label="Ver historial de versiones" onPress={() => { marcarNovedadesVistas(); router.push('/ajustes/novedades') }} />
    </TarjetaVersion> : null}
  </DialogoVersion>
}
