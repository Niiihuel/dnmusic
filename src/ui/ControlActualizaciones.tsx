import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ActivityIndicator, BackHandler, Linking, Modal, Platform, ScrollView, Text, View } from 'react-native'
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
    <Modal visible transparent animationType="fade" onRequestClose={descartarPolitica}>
      <AvisoPolitica key={`${s.politica.platform}:${s.politica.revision}`} politica={s.politica} obligatoria={false} />
    </Modal>
  ) : null}</>
}

/** Envuelve la píldora antigua en Chrome; evita dos avisos para la misma actualización. */
export function AvisoActualizacionSinPolitica({ children }: { children: ReactNode }) {
  const s = usePoliticaActualizacion()
  return politicaCubreAviso(s.politica, s.instalacion) ? null : <>{children}</>
}

function AvisoPolitica({ politica, obligatoria }: { politica: PoliticaActualizacion; obligatoria: boolean }) {
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
    <View className={`flex-1 justify-center ${obligatoria ? 'bg-background' : ''}`} style={{ paddingTop: 48, paddingBottom: 32, ...(!obligatoria ? { backgroundColor: 'rgba(0,0,0,0.55)' } : {}) }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <View className="w-full gap-4" style={{ maxWidth: 440, ...(!obligatoria ? { backgroundColor: '#202020', padding: 24, borderRadius: 24 } : {}) }} accessibilityViewIsModal>
          <Text accessibilityRole="header" className="text-foreground text-2xl font-bold">{obligatoria ? 'Actualizá para seguir usando DMusic' : 'Hay una nueva versión de DMusic'}</Text>
          <Text className="text-muted-foreground text-base">Tenés {s.instalacion?.version}. La última versión es {politica.latest_version}.{obligatoria ? ` La mínima admitida es ${politica.minimum_version}.` : ''}</Text>
          <Text className="text-muted-foreground">{obligatoria ? 'Instalá la actualización y volvé a abrir la app.' : 'Podés actualizar ahora o hacerlo más adelante.'}</Text>
          {esDesktop && escritorio.fase === 'bajando' ? <Text className="text-foreground">Descargando {escritorio.version}: {escritorio.porcentaje}%</Text> : null}
          {esDesktop && escritorio.fase === 'error' ? <Text accessibilityRole="alert" className="text-destructive">El actualizador falló. Podés abrir la descarga e instalarla manualmente.</Text> : null}
          {instalable ? <PrimaryButton label="Instalar y reiniciar" onPress={instalarActualizacion} /> : null}
          {descargable ? <PrimaryButton label="Descargar ahora" onPress={descargarActualizacion} /> : null}
          <PrimaryButton label={politica.platform === 'web' ? 'Abrir versión actualizada' : 'Abrir descarga'} busy={abriendo} onPress={() => void abrirDestino()} />
          {esDesktop ? <GhostButton label="Buscar en el actualizador" disabled={escritorio.fase === 'buscando' || escritorio.fase === 'bajando'} onPress={buscarActualizacion} /> : null}
          <GhostButton label="Volver a comprobar" disabled={s.consultando} onPress={() => void refrescarPolitica()} />
          {s.error || error ? <Text accessibilityRole="alert" className="text-destructive">{error ?? 'No se pudo comprobar la política. Se conserva la última recibida.'}</Text> : null}
          {!obligatoria ? <GhostButton label="Más adelante" onPress={descartarPolitica} /> : null}
        </View>
      </ScrollView>
    </View>
  )
}
