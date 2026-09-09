import { useCallback, useEffect, useRef, useState } from 'react'
import { Linking, Pressable, Switch, Text, View } from 'react-native'
import { Field } from './Field'
import { PrimaryButton, GhostButton } from './Button'
import { Confirmar } from './Confirmar'
import { useAuthUser, useIsAccessAdmin } from '../state/session'
import { listarPoliticas, guardarPolitica } from '../services/actualizacionesRemotas'
import { PLATAFORMAS, esDestinoActualizacion, leerPolitica, type PlataformaActualizacion, type PoliticaActualizacion } from '../services/politicaActualizacion'
import { refrescarPolitica } from '../state/politicaActualizacion'

const NOMBRES: Record<PlataformaActualizacion, string> = { windows: 'Windows', linux: 'Linux', macos: 'macOS', ios: 'iOS', android: 'Android', web: 'Web / PWA' }
export function AdministrarActualizaciones() {
  const admin = useIsAccessAdmin()
  const user = useAuthUser()
  return admin && user ? <PanelPoliticas key={user.id} /> : null
}
function PanelPoliticas() {
  const [politicas, setPoliticas] = useState<PoliticaActualizacion[] | null>(null)
  const [plataforma, setPlataforma] = useState<PlataformaActualizacion>('windows')
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const viva = useRef(false), enCurso = useRef(false)
  const cargar = useCallback(async () => {
    if (enCurso.current) return
    enCurso.current = true; setCargando(true); setError(null)
    try {
      const rows = await listarPoliticas()
      if (viva.current) setPoliticas(rows)
    } catch (e) { if (viva.current) setError(e instanceof Error ? e.message : 'No se pudieron cargar las políticas.') }
    finally { enCurso.current = false; if (viva.current) setCargando(false) }
  }, [])
  useEffect(() => {
    viva.current = true
    enCurso.current = true
    let vigente = true
    void listarPoliticas().then(rows => {
      if (vigente) setPoliticas(rows)
    }).catch(e => {
      if (vigente) setError(e instanceof Error ? e.message : 'No se pudieron cargar las políticas.')
    }).finally(() => {
      if (vigente) { enCurso.current = false; setCargando(false) }
    })
    return () => { vigente = false; viva.current = false }
  }, [])
  const actual = politicas?.find(p => p.platform === plataforma)
  return <View className="gap-4">
    <Text className="text-foreground text-lg font-bold">Actualizaciones por plataforma</Text>
    <Text className="text-muted-foreground">Vos decidís desde qué versión es obligatorio actualizar. Publicar una política no crea ni distribuye una versión.</Text>
    <View className="flex-row flex-wrap gap-2">{PLATAFORMAS.map(p => <Pressable key={p} accessibilityRole="button" accessibilityState={{ selected: p === plataforma }} onPress={() => setPlataforma(p)} className={`rounded-full px-4 py-2 ${p === plataforma ? 'bg-foreground' : 'bg-muted'}`}><Text className={p === plataforma ? 'text-background' : 'text-foreground'}>{NOMBRES[p]}</Text></Pressable>)}</View>
    {error ? <Text accessibilityRole="alert" className="text-destructive">{error}</Text> : null}
    <GhostButton label="Recargar políticas" disabled={cargando} onPress={() => void cargar()} />
    {politicas && !cargando ? <EditorPolitica key={`${plataforma}:${actual?.revision ?? 0}`} plataforma={plataforma} actual={actual} onGuardada={p => setPoliticas(prev => [...(prev ?? []).filter(row => row.platform !== p.platform), p])} /> : null}
  </View>
}
function EditorPolitica({ plataforma, actual, onGuardada }: { plataforma: PlataformaActualizacion; actual?: PoliticaActualizacion; onGuardada: (p: PoliticaActualizacion) => void }) {
  const [ultima, setUltima] = useState(actual?.latest_version ?? '')
  const [minima, setMinima] = useState(actual?.minimum_version ?? '0.0.0')
  const [url, setUrl] = useState(actual?.update_url ?? '')
  const [activa, setActiva] = useState(actual?.enabled ?? false)
  const [confirmacion, setConfirmacion] = useState<PoliticaActualizacion | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const viva = useRef(true), enCurso = useRef(false)
  useEffect(() => { viva.current = true; return () => { viva.current = false } }, [])
  function preparar() {
    try {
      setError(null)
      setConfirmacion(leerPolitica({ platform: plataforma, latest_version: ultima.trim(), minimum_version: minima.trim(), update_url: url.trim(), enabled: activa, revision: (actual?.revision ?? 0) + 1 }))
    } catch (e) { setError(e instanceof Error ? e.message : 'Revisá los campos.') }
  }
  async function guardar() {
    if (!confirmacion || enCurso.current) return
    enCurso.current = true; setGuardando(true); setConfirmacion(null)
    try {
      const p = await guardarPolitica(confirmacion, actual?.revision ?? 0)
      void refrescarPolitica()
      if (viva.current) onGuardada(p)
    } catch (e) { if (viva.current) setError(`${e instanceof Error ? e.message : 'No se pudo guardar.'} Recargá las políticas si otro dispositivo las cambió.`) }
    finally { enCurso.current = false; if (viva.current) setGuardando(false) }
  }
  const editable = !guardando && !confirmacion
  return <View className="gap-3">
    <Text className="text-muted-foreground">{actual ? `Guardada · revisión ${actual.revision} · ${actual.enabled ? 'activa' : 'desactivada'}` : 'Sin política publicada para esta plataforma.'}</Text>
    <Field label="Última versión disponible" placeholder="1.12.0" value={ultima} onChangeText={setUltima} editable={editable} autoCapitalize="none" />
    <Field label="Mínima soportada" hint="0.0.0: todas las versiones pueden continuar; el aviso es opcional." value={minima} onChangeText={setMinima} editable={editable} autoCapitalize="none" />
    <GhostButton label="Hacer obligatoria la última" disabled={!editable || !ultima} onPress={() => setMinima(ultima)} />
    <Field label="URL de actualización" placeholder={plataforma === 'web' ? 'https://dnmusic-app.vercel.app/' : plataforma === 'ios' ? 'https://testflight.apple.com/join/…' : 'https://github.com/Niiihuel/dnmusic-releases/releases/latest'} value={url} onChangeText={setUrl} editable={editable} autoCapitalize="none" autoCorrect={false} />
    <Text className="text-muted-foreground">Abrí el destino y verificá que entregue la versión elegida para {NOMBRES[plataforma]} antes de activarla. Se admiten las tiendas y los releases oficiales de DMusic.</Text>
    <GhostButton label="Abrir destino para verificar" disabled={!esDestinoActualizacion(plataforma, url.trim())} onPress={() => { void Linking.openURL(url.trim()).catch(() => { if (viva.current) setError('No se pudo abrir el destino.') }) }} />
    <View className="flex-row items-center justify-between">
      <Text className="text-foreground">Política activa</Text>
      {/* Tokens muted, primary, primary-foreground y border; iguales al interruptor de Ajustes. */}
      <Switch
        accessibilityLabel="Política activa"
        value={activa}
        onValueChange={setActiva}
        disabled={!editable}
        trackColor={{ false: '#1F1F1F', true: '#FFFFFF' }}
        thumbColor={activa ? '#121212' : '#4D4D4D'}
        ios_backgroundColor="#1F1F1F"
      />
    </View>
    {error ? <Text accessibilityRole="alert" className="text-destructive">{error}</Text> : null}
    <PrimaryButton label="Revisar y guardar" busy={guardando} disabled={!editable} onPress={preparar} />
    <Confirmar visible={!!confirmacion} titulo={`Guardar política de ${NOMBRES[plataforma]}`} mensaje={confirmacion ? `${confirmacion.enabled ? `Las versiones menores a ${confirmacion.minimum_version} quedarán bloqueadas. Las demás anteriores a ${confirmacion.latest_version} tendrán un aviso opcional.` : 'La política quedará desactivada; sus avisos y bloqueos se retirarán al volver a consultar.'}\nDestino: ${confirmacion.update_url}` : ''} rotulo="Guardar política" onCancelar={() => setConfirmacion(null)} onConfirmar={() => void guardar()} />
  </View>
}
