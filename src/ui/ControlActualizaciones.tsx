import { DialogoVersion } from './DialogoVersion'
import { TarjetaVersion } from './TarjetaVersion'
import { useDentroModalPC } from './ModalContext'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ActivityIndicator, BackHandler, Linking, Platform, ScrollView, Text, View } from 'react-native'
import { PrimaryButton, GhostButton } from './Button'
import { usePreferencia } from '../state/ajustes'
import { buscarActualizacion, descargarActualizacion, instalarActualizacion, PUEDE_DESCARGAR_ACTUALIZACION, useActualizacion } from '../state/actualizacion'
import { descartarPolitica, iniciarPoliticaActualizacion, refrescarPolitica, usePoliticaActualizacion } from '../state/politicaActualizacion'
import { compararVersiones, esVersionEstable, evaluarPolitica, politicaCubreAviso, type PoliticaActualizacion } from '../services/politicaActualizacion'

/** Debe envolver TODO el contenido interactivo raíz, incluidas rutas y overlays. */
export function ControlActualizaciones({ children }: { children: ReactNode }) {
  const s = usePoliticaActualizacion()
  const avisos = usePreferencia('avisosActualizacion')
  const tipo = evaluarPolitica(s.politica, s.instalacion, s.descartada)
  useEffect(iniciarPoliticaActualizacion, [])
  useEffect(() => {
    if (tipo !== 'obligatoria') return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true)
    return () => sub.remove()
  }, [tipo])
  if (!s.iniciada && tipo !== 'obligatoria') {
    return <View className="flex-1 items-center justify-center gap-4 bg-background"><ActivityIndicator color="#fff" /><Text className="text-foreground">Comprobando versión…</Text></View>
  }
  if (tipo === 'obligatoria' && s.politica) {
    // No se montan las rutas: atrás, Escape, enlaces profundos y otros modales no dan acceso a ellas.
    return <AvisoPolitica key={`${s.politica.platform}:${s.politica.revision}`} politica={s.politica} obligatoria />
  }
  return <>{children}{tipo === 'opcional' && avisos && s.politica ? (
    <DialogoVersion titulo="Nueva versión de dnmusic" visible onCerrar={descartarPolitica}>
      <AvisoPolitica key={`${s.politica.platform}:${s.politica.revision}`} politica={s.politica} obligatoria={false} />
    </DialogoVersion>
  ) : null}</>
}

/** Envuelve la píldora antigua en Chrome; evita dos avisos para la misma actualización. */
export function AvisoActualizacionSinPolitica({ children }: { children: ReactNode }) {
  const s = usePoliticaActualizacion()
  return politicaCubreAviso(s.politica, s.instalacion) ? null : <>{children}</>
}

function AvisoPolitica({ politica, obligatoria }: { politica: PoliticaActualizacion; obligatoria: boolean }) {
  const modalPC = useDentroModalPC()
  const s = usePoliticaActualizacion()
  const escritorio = useActualizacion()
  const [error, setError] = useState<string | null>(null)
  const [abriendo, setAbriendo] = useState(false)
  const enCurso = useRef(false)
  const esDesktop = ['windows', 'linux', 'macos'].includes(politica.platform)
  const util = 'version' in escritorio && esVersionEstable(escritorio.version) && compararVersiones(escritorio.version, politica.latest_version) >= 0
  const instalable = esDesktop && util && escritorio.fase === 'lista'
  const descargable = esDesktop && util && escritorio.fase === 'esperando-silencio' && PUEDE_DESCARGAR_ACTUALIZACION

  async function abrirDestino() {
    if (enCurso.current) return
    enCurso.current = true; setAbriendo(true); setError(null)
    try {
      if (politica.platform === 'web' && Platform.OS === 'web') globalThis.location.assign(politica.update_url)
      else await Linking.openURL(politica.update_url)
    } catch { setError('No se pudo abrir la descarga. Revisá la conexión y volvé a intentar.') }
    finally { enCurso.current = false; setAbriendo(false) }
  }
  return (
    <View style={{ ...(obligatoria ? { flex: 1, backgroundColor: '#121212', paddingTop: 48, paddingBottom: 32 } : {}) }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: obligatoria ? 24 : 0 }}>
        <View style={{ width: '100%', maxWidth: 560 }} accessibilityViewIsModal>
          <TarjetaVersion version={politica.latest_version}
            etiqueta={obligatoria ? 'Actualización necesaria' : 'Nueva versión disponible'}
            titulo={obligatoria ? 'Actualizá para seguir escuchando.' : 'Hay algo nuevo para vos.'}
            detalle={`Tenés la versión ${s.instalacion?.version ?? 'anterior'}. ${obligatoria ? 'Instalá la actualización para continuar.' : 'Actualizá ahora o seguí escuchando y hacelo después.'}`}
            onCerrar={!obligatoria && !modalPC ? descartarPolitica : undefined}>
            {esDesktop && escritorio.fase === 'bajando' ? <Text accessibilityLiveRegion="polite" className="text-foreground">Descargando {escritorio.version}: {Math.round(escritorio.porcentaje)}%</Text> : null}
            {esDesktop && escritorio.fase === 'error' ? <Text accessibilityRole="alert" className="text-destructive">No se pudo descargar. Podés reintentar o abrir el instalador.</Text> : null}
            {instalable ? <PrimaryButton label="Instalar y reiniciar" onPress={instalarActualizacion} /> : descargable ? <PrimaryButton label="Descargar ahora" onPress={descargarActualizacion} /> :
              <PrimaryButton label={politica.platform === 'web' ? 'Abrir versión actualizada' : politica.platform === 'ios' ? (politica.update_url.startsWith('https://testflight.apple.com/') ? 'Abrir TestFlight' : 'Abrir App Store') : 'Abrir descarga'} busy={abriendo} onPress={() => void abrirDestino()} />}
            {esDesktop && !instalable && !descargable ? <GhostButton label="Buscar en el actualizador" disabled={escritorio.fase === 'buscando' || escritorio.fase === 'bajando'} onPress={buscarActualizacion} /> : null}
            {obligatoria || s.error || error ? <GhostButton label="Volver a comprobar" disabled={s.consultando} onPress={() => void refrescarPolitica()} /> : null}
            {s.error || error ? <Text accessibilityRole="alert" className="text-destructive">{error ?? 'No se pudo comprobar la versión. Se conserva la última recibida.'}</Text> : null}
            {!obligatoria ? <GhostButton label="Seguir escuchando" onPress={descartarPolitica} /> : null}
          </TarjetaVersion>
        </View>
      </ScrollView>
    </View>
  )
}
