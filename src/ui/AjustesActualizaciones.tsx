import { useEffect, useState } from 'react'
import { Linking, Platform } from 'react-native'
import { nativeBuildVersion } from 'expo-application'
import { obtenerInstalacion } from '../services/instalacionActual'
import { esDestinoActualizacion, type Instalacion } from '../services/politicaActualizacion'
import { usePoliticaActualizacion } from '../state/politicaActualizacion'
import { HAY_ACTUALIZADOR, useActualizacion } from '../state/actualizacion'
import { setPreferencia, useAjustes } from '../state/ajustes'
import { FilaAccion, FilaDato, FilaInterruptor, GrupoAjustes } from './Ajustes'
import { Actualizador } from './Actualizador'

const DESCARGAS_PC = 'https://github.com/Niiihuel/dnmusic-releases/releases/latest'

/** Un enlace configurado no prueba de qué tienda vino esta instalación. */
export function orientacionActualizacion(platform: string, destino?: string | null) {
  const valido = destino && ['ios', 'android', 'web', 'windows', 'linux', 'macos'].includes(platform)
    && esDestinoActualizacion(platform as Instalacion['platform'], destino) ? destino : null
  if (platform === 'ios') return {
    detalle: 'Si instalaste DMusic con TestFlight, abrí TestFlight y tocá Actualizar junto a DMusic. Si la instalaste desde App Store, actualizala desde tu cuenta en esa tienda. La disponibilidad la confirma Apple.',
    destino: valido,
    accion: valido?.startsWith('https://testflight.apple.com/') ? 'Abrir enlace de TestFlight' : 'Ver DMusic en App Store',
  }
  if (platform === 'android') return { detalle: 'Actualizá DMusic desde la misma tienda o el instalador con que la instalaste.', destino: valido, accion: 'Abrir actualización' }
  if (platform === 'web') return { detalle: 'Esta es la versión cargada en el navegador. Volvé a abrir DMusic para cargar los cambios publicados.', destino: null, accion: '' }
  return { detalle: 'En esta instalación las actualizaciones se descargan desde las versiones publicadas de DMusic.', destino: valido ?? DESCARGAS_PC, accion: 'Ver descargas de DMusic' }
}

export function AjustesActualizaciones() {
  const { instalacion: conocida, politica } = usePoliticaActualizacion()
  const [detectada, setInstalacion] = useState<Instalacion | null>(conocida)
  const [cargando, setCargando] = useState(!conocida)
  const [error, setError] = useState<string | null>(null)
  const [errorLectura, setErrorLectura] = useState(false)
  const [abriendo, setAbriendo] = useState(false)
  const ajustes = useAjustes()
  const estado = useActualizacion()
  useEffect(() => {
    if (conocida) return
    let vigente = true
    void obtenerInstalacion().then(actual => { if (vigente) setInstalacion(actual) })
      .catch(() => { if (vigente) setErrorLectura(true) })
      .finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [conocida])
  const instalacion = conocida ?? detectada
  const consultando = !instalacion && cargando
  const platform = instalacion?.platform ?? (HAY_ACTUALIZADOR ? 'desktop' : Platform.OS)
  const destino = politica?.enabled && politica.platform === platform ? politica.update_url : null
  const guia = orientacionActualizacion(platform, destino)
  const manual = !HAY_ACTUALIZADOR || estado.fase === 'apagado'
  async function abrir() {
    if (!guia.destino || abriendo) return
    setAbriendo(true); setError(null)
    try { await Linking.openURL(guia.destino) }
    catch { setError('No se pudo abrir la actualización. Volvé a intentar.') }
    finally { setAbriendo(false) }
  }
  return <>
    <GrupoAjustes titulo="DMusic" error={error || (!instalacion && errorLectura ? 'No se pudo leer la versión instalada.' : null)}>
      <FilaDato rotulo={platform === 'web' ? 'Versión cargada' : 'Versión instalada'} valor={consultando ? 'Consultando…' : instalacion?.version ?? 'No disponible'} ultima={Platform.OS === 'web' || !nativeBuildVersion} />
      {Platform.OS !== 'web' && nativeBuildVersion ? <FilaDato rotulo="Compilación" valor={nativeBuildVersion} ultima /> : null}
    </GrupoAjustes>
    {HAY_ACTUALIZADOR ? <Actualizador /> : null}
    {manual ? <GrupoAjustes titulo="Cómo actualizar" pie={guia.detalle}>
      <FilaDato rotulo="Actualización" valor={platform === 'ios' ? 'App Store o TestFlight' : platform === 'web' ? 'Desde el navegador' : 'Desde el instalador'} ultima={!guia.destino} />
      {guia.destino ? <FilaAccion rotulo={guia.accion} onPress={() => void abrir()} busy={abriendo} ultima /> : null}
    </GrupoAjustes> : null}
    {HAY_ACTUALIZADOR ? <GrupoAjustes pie="DMusic te avisa cuando termina de descargar una actualización. Podés instalarla cuando quieras.">
      <FilaInterruptor rotulo="Avisar cuando haya una versión nueva" activo={ajustes.avisosActualizacion} onCambiar={v => setPreferencia('avisosActualizacion', v)} ultima />
    </GrupoAjustes> : null}
  </>
}
