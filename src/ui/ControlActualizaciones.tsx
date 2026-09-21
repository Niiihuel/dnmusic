import { Dialogo } from './Dialogo'
import { useDentroModalPC } from './ModalContext'
import { EncabezadoHoja, BotonHoja } from './EncabezadoHoja'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ActivityIndicator, BackHandler, Linking, Platform, ScrollView, Text, View } from 'react-native'
import { ListaAjustes, GrupoAjustes, FilaAccion, FilaDato } from './Ajustes'
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
    <Dialogo titulo="Nueva versión de DMusic" ancho={480} contenidoPC={<AvisoPolitica key={`${s.politica.platform}:${s.politica.revision}`} politica={s.politica} obligatoria={false} />} visible transparent={Platform.OS !== 'ios'} presentationStyle={Platform.OS === 'ios' ? 'formSheet' : undefined} animationType={Platform.OS === 'ios' ? 'slide' : 'fade'} onRequestClose={descartarPolitica}>
      <AvisoPolitica key={`${s.politica.platform}:${s.politica.revision}`} politica={s.politica} obligatoria={false} />
    </Dialogo>
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
  if (Platform.OS === 'ios') return <View className="flex-1 bg-background" style={{ paddingTop: 32 }}>
    <ListaAjustes titulo={obligatoria ? 'Actualizá para continuar' : 'Nueva versión de DMusic'} piso={48}>
      <GrupoAjustes pie={obligatoria ? 'Instalá la actualización y volvé a abrir la app.' : 'Podés actualizar ahora o hacerlo más adelante.'}>
        <FilaDato rotulo="Versión instalada" valor={s.instalacion?.version ?? 'Desconocida'} />
        <FilaDato rotulo="Última versión" valor={politica.latest_version} />
        {obligatoria ? <FilaDato rotulo="Mínima admitida" valor={politica.minimum_version} ultima /> : null}
      </GrupoAjustes>
      <GrupoAjustes error={error ?? (s.error ? 'No se pudo comprobar la política. Se conserva la última recibida.' : null)}>
        <FilaAccion rotulo="Abrir descarga" busy={abriendo} onPress={() => { void abrirDestino() }} />
        <FilaAccion rotulo="Volver a comprobar" busy={s.consultando} onPress={() => { void refrescarPolitica() }} ultima={obligatoria} />
        {!obligatoria ? <FilaAccion rotulo="Más adelante" onPress={descartarPolitica} ultima /> : null}
      </GrupoAjustes>
    </ListaAjustes>
  </View>
  return (
    <View className={`flex-1 justify-center ${obligatoria ? 'bg-background' : ''}`} style={modalPC ? { flexGrow: 0, flexShrink: 1 } : { paddingTop: 48, paddingBottom: 32, ...(!obligatoria ? { backgroundColor: 'rgba(0,0,0,0.55)' } : {}) }}>
      {modalPC ? <EncabezadoHoja titulo="Nueva versión de DMusic" izquierda={<BotonHoja onPress={descartarPolitica} />} /> : null}
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: modalPC ? 20 : 24, ...(modalPC ? { paddingTop: 0 } : {}) }}>
        <View className="w-full gap-4" style={{ maxWidth: 440, ...(!obligatoria && !modalPC ? { backgroundColor: '#202020', padding: 24, borderRadius: 24 } : {}) }} accessibilityViewIsModal>
          {!modalPC ? <Text accessibilityRole="header" className="text-foreground text-title2 font-bold">{obligatoria ? 'Actualizá para seguir usando DMusic' : 'Hay una nueva versión de DMusic'}</Text> : null}
          <Text className="text-muted-foreground text-callout">Tenés {s.instalacion?.version}. La última versión es {politica.latest_version}.{obligatoria ? ` La mínima admitida es ${politica.minimum_version}.` : ''}</Text>
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
