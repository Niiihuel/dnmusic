import { useCallback, useEffect, useRef, useState } from 'react'
import { Linking } from 'react-native'
import { FilaAccion, FilaDato, FilaInterruptor, FilaOpciones, FilaTexto, GrupoAjustes } from './Ajustes'
import { Confirmar } from './Confirmar'
import { useAuthUser, useIsAccessAdmin } from '../state/session'
import { listarPoliticas, guardarPolitica } from '../services/actualizacionesRemotas'
import { PLATAFORMAS, esDestinoActualizacion, leerPolitica, type PlataformaActualizacion, type PoliticaActualizacion } from '../services/politicaActualizacion'
import { refrescarPolitica } from '../state/politicaActualizacion'

const NOMBRES: Record<PlataformaActualizacion, string> = { windows: 'Windows', linux: 'Linux', macos: 'macOS', ios: 'iOS', android: 'Android', web: 'Web / PWA' }

/** Edición administrativa de compatibilidad, separada del actualizador de usuario. */
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
  /* Qué hay publicado hoy para la plataforma elegida. Mientras carga no dice
     «sin publicar»: todavía no lo sabe, y afirmarlo invita a publicar de más. */
  const estado = cargando || !politicas
    ? 'Consultando…'
    : actual
      ? `Revisión ${actual.revision} · ${actual.enabled ? 'activa' : 'desactivada'}`
      : 'Sin publicar'
  return <>
    <GrupoAjustes
      titulo="Compatibilidad por plataforma"
      pie="Vos decidís desde qué versión es obligatorio actualizar. Publicar una política no crea ni distribuye una versión."
      error={error}
    >
      <FilaOpciones
        rotulo="Plataforma"
        valor={plataforma}
        opciones={PLATAFORMAS.map(p => ({ value: p, label: NOMBRES[p] }))}
        onElegir={setPlataforma}
      />
      <FilaDato rotulo="Publicado" valor={estado} />
      <FilaAccion rotulo="Recargar políticas" busy={cargando} onPress={() => void cargar()} ultima />
    </GrupoAjustes>
    {politicas && !cargando ? (
      <EditorPolitica
        key={`${plataforma}:${actual?.revision ?? 0}`}
        plataforma={plataforma}
        actual={actual}
        onGuardada={p => setPoliticas(prev => [...(prev ?? []).filter(row => row.platform !== p.platform), p])}
      />
    ) : null}
  </>
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
  const marcadorURL = plataforma === 'web'
    ? 'https://dnmusic-app.vercel.app/'
    : plataforma === 'ios'
      ? 'https://testflight.apple.com/join/…'
      : 'https://github.com/Niiihuel/dnmusic-releases/releases/latest'
  return <>
    <GrupoAjustes titulo="Versiones" pie="Con la mínima en 0.0.0 todas las versiones pueden continuar y el aviso queda opcional.">
      <FilaTexto rotulo="Última disponible" valor={ultima} onCambiar={setUltima} marcador="1.12.0" editable={editable} />
      <FilaTexto rotulo="Mínima soportada" valor={minima} onCambiar={setMinima} marcador="0.0.0" editable={editable} />
      <FilaAccion rotulo="Igualar la mínima a la última" disabled={!editable || !ultima} onPress={() => setMinima(ultima)} ultima />
    </GrupoAjustes>

    <GrupoAjustes
      titulo="Destino"
      pie={`Abrí el destino y verificá que entregue la versión elegida para ${NOMBRES[plataforma]} antes de activarla. Se admiten las tiendas y los releases oficiales de DMusic.`}
    >
      <FilaTexto rotulo="Dirección" valor={url} onCambiar={setUrl} marcador={marcadorURL} editable={editable} />
      <FilaAccion
        rotulo="Abrir para verificar"
        disabled={!esDestinoActualizacion(plataforma, url.trim())}
        onPress={() => { void Linking.openURL(url.trim()).catch(() => { if (viva.current) setError('No se pudo abrir el destino.') }) }}
        ultima
      />
    </GrupoAjustes>

    <GrupoAjustes
      pie={activa
        ? 'Activa, la política empieza a avisar y a bloquear apenas se guarda.'
        : 'Desactivada, sus avisos y bloqueos se retiran al volver a consultar.'}
      error={error}
    >
      <FilaInterruptor rotulo="Política activa" activo={activa} onCambiar={setActiva} />
      <FilaAccion rotulo="Revisar y guardar" destacada busy={guardando} disabled={!editable} onPress={preparar} ultima />
    </GrupoAjustes>

    <Confirmar
      visible={!!confirmacion}
      titulo={`Guardar política de ${NOMBRES[plataforma]}`}
      mensaje={confirmacion ? `${confirmacion.enabled ? `Las versiones menores a ${confirmacion.minimum_version} quedarán bloqueadas. Las demás anteriores a ${confirmacion.latest_version} tendrán un aviso opcional.` : 'La política quedará desactivada; sus avisos y bloqueos se retirarán al volver a consultar.'}\nDestino: ${confirmacion.update_url}`: ''}
      rotulo="Guardar política"
      onCancelar={() => setConfirmacion(null)}
      onConfirmar={() => void guardar()}
    />
  </>
}
