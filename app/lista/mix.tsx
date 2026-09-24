import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useNavigation, usePreventRemove, type NavigationAction } from 'expo-router/react-navigation'
import { useSharedValue } from 'react-native-reanimated'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BotonSuperficie } from '../../src/ui/BotonSuperficie'
import { EncabezadoHoja, BotonHoja } from '../../src/ui/EncabezadoHoja'
import { GhostButton, PrimaryButton } from '../../src/ui/Button'
import { BotonVidrio, Glass } from '../../src/ui/Glass'
import { Dialogo } from '../../src/ui/Dialogo'
import { ICON_COLOR, IconClose, IconCollapseLeft, IconChevronDown, IconMusic } from '../../src/ui/icons'
import { estadoControlWeb } from '../../src/ui/estadoControl'
import { artworkSource } from '../../src/lib/artwork'
import { mixWaveformDetailRange, type MixWaveformDetail } from '../../src/lib/mixWaveformZoom'
import { FilaAccion, FilaInterruptor, FilaOpciones, GrupoAjustes } from '../../src/ui/Ajustes'
import { Waveform } from '../../src/ui/Waveform'
import { MixAutomationCurve, MixAutomationEditor, type MixCurveView } from '../../src/ui/MixAutomationCurve'
import { MixCurveTabs, MixDeckTabs } from '../../src/ui/MixCurveTabs'
import { SeekBar } from '../../src/ui/SeekBar'
import { MixPairPreview } from '../../src/ui/MixPairPreview'
import { MixEffectsEditor, MixEffectsQuickControls } from '../../src/ui/MixEffectsEditor'
import { ResizableRegion } from '../../src/ui/ResizableRegion'
import { CollapsedSidebar } from '../../src/ui/SidebarMotion'
import { CabeceraLateral, BotonLateral } from '../../src/ui/CabeceraLateral'
import { pedirAnalisisMusical, pedirOndaDeMix, type AnalisisMusical, type OndaDeMix } from '../../src/services/analisisMusical'
import { listTracks, reorderPlaylistTracks, PlaylistOrderConflictError, type PlaylistTrack } from '../../src/services/playlists'
import {
  createPlaylistMix,
  deleteMixEdge,
  deletePlaylistMix,
  duplicatePlaylistMix,
  getPlaylistMixPermissions,
  getPlaylistMixChoice,
  getMixEdge,
  getPlaylistSoundProfile,
  listMixEdges,
  listPlaylistMixes,
  publishPlaylistMix,
  publishPlaylistSoundProfile,
  renamePlaylistMix,
  saveMixEdge,
  savePlaylistSoundProfile,
  setPlaylistMixChoice,
  updatePlaylistMix,
  type MixEdge,
  type MixEdgeInput,
  type MixPreset,
  type PlaylistMix,
  type PlaylistMixChoice,
  type PlaylistMixPermissions,
  type PlaylistSoundProfile,
} from '../../src/services/mixes'
import { avisarMixPlaylistCambiado } from '../../src/state/mixPlayback'
import { avisarContenidoPlaylistCambiado } from '../../src/state/playlistContent'
import { setPlaylistSoundPreference, usePlaylistSoundPreference } from '../../src/state/playlistSoundPreference'
import { PRESETS_EQ, useEcualizador } from '../../src/state/ecualizador'
import { fetchAudioWaveform, fetchWaveform } from '../../src/services/music'
import { useUser } from '../../src/state/session'
import { suggestAutoMix, suggestBarMix } from '../../src/lib/autoMix'
import { suggestRhythmOrder, type RhythmOrderSuggestion } from '../../src/lib/smartReorder'
import { mensajeError } from '../../src/lib/mensajeError'
import { volver } from '../../src/lib/volver'

const PRESETS: { value: MixPreset; label: string; detail: string }[] = [
  { value: 'auto', label: 'Auto', detail: 'Fundido general; cada par admite una sugerencia medida' },
  { value: 'fade', label: 'Fade', detail: 'Salida y entrada lineales' },
  { value: 'crescendo', label: 'Crescendo', detail: 'La siguiente canción entra progresivamente' },
  { value: 'fusion', label: 'Fusión', detail: 'Solapamiento de potencia constante' },
  { value: 'none', label: 'Sin mezcla', detail: 'Las canciones se reproducen una tras otra' },
  { value: 'custom', label: 'Personalizada', detail: 'Usa los puntos y curvas elegidos para este par' },
]

const labelPreset = (preset: MixPreset) => PRESETS.find(item => item.value === preset)?.label ?? preset
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`
const FLAT_BANDS = Array(10).fill(0) as number[]
const copyName = (name: string) => `${name.slice(0, 52).trimEnd()} (copia)`
type ApproximateTempo = { kind: 'approximate'; bpm: number; minBpm: number; maxBpm: number;
  confidence: number; varying: boolean; alternateBpm: number | null }
type MeasuredTempo = { kind: 'beatgrid'; bpm: number; confidence: number } | ApproximateTempo | null

function measuredTempo(analysis: AnalisisMusical | null): MeasuredTempo {
  const rhythm = analysis?.rhythm
  if (rhythm && Number.isFinite(rhythm.bpm) && rhythm.bpm > 0 &&
    Number.isFinite(rhythm.confidence) && rhythm.confidence >= 0 && rhythm.confidence <= 1
  ) return { kind: 'beatgrid', bpm: rhythm.bpm, confidence: rhythm.confidence }
  const tempo = analysis?.tempo
  return tempo && Number.isFinite(tempo.bpm) && tempo.bpm > 0
    ? { ...tempo, kind: 'approximate' } : null
}

function approximateRange(tempo: ApproximateTempo, compact: boolean): string {
  const min = Math.round(tempo.minBpm), max = Math.round(tempo.maxBpm)
  return min === max ? '' : compact ? ` · ${min}–${max}` : ` · rango ${min}–${max}`
}

function tempoLabel(tempo: MeasuredTempo, loading = false): string {
  if (!tempo) return loading ? '— BPM · analizando…' : '— BPM · sin analizar'
  if (tempo.kind === 'beatgrid') return `${Math.round(tempo.bpm)} BPM · ${Math.round(tempo.confidence * 100)} % confianza`
  return `≈ ${Math.round(tempo.bpm)} BPM${approximateRange(tempo, false)} · estimado`
}

function tempoCompact(tempo: MeasuredTempo, loading = false): string {
  if (!tempo) return loading ? '— BPM · analizando…' : '— BPM · sin analizar'
  if (tempo.kind === 'beatgrid') return `${Math.round(tempo.bpm)} BPM · ${Math.round(tempo.confidence * 100)} %`
  return `≈ ${Math.round(tempo.bpm)} BPM${approximateRange(tempo, true)}`
}

function mixDetailSource(track: PlaylistTrack | null): { kind: 'video' | 'audio'; id: string } | null {
  if (!track) return null
  if (track.videoId && !track.videoId.startsWith('propia:')) return { kind: 'video', id: track.videoId }
  return track.audioPath ? { kind: 'audio', id: track.audioPath } : null
}

function volumeAt(points: { t: number; value: number }[] | null, t: number, fallback: number): number {
  if (!points?.length) return fallback
  for (let i = 1; i < points.length; i++) {
    if (points[i].t < t) continue
    const previous = points[i - 1], next = points[i]
    return previous.value + (next.value - previous.value) * (t - previous.t) / (next.t - previous.t)
  }
  return fallback
}

function midpointCurve(outgoing: boolean, midpoint: number) {
  return [
    { t: 0, value: outgoing ? 1 : 0 },
    { t: 0.5, value: Math.max(0, Math.min(1, midpoint)) },
    { t: 1, value: outgoing ? 0 : 1 },
  ]
}

function withVolumePoint(points: { t: number; value: number }[] | null, outgoing: boolean,
  t: 0.25 | 0.5 | 0.75, value: number) {
  const original = points ?? midpointCurve(outgoing, Math.SQRT1_2)
  return [...original.filter(point => point.t !== t), {
    t, value: Math.max(0, Math.min(1, value)),
  }].sort((a, b) => a.t - b.t)
}

type PairAnalysis = {
  key: string
  loading: boolean
  from: OndaDeMix | null
  to: OndaDeMix | null
  fromError: string | null
  toError: string | null
}

type DraftHistory = {
  baseline: MixEdgeInput
  current: MixEdgeInput
  past: MixEdgeInput[]
  future: MixEdgeInput[]
}

function sameDraft(a: MixEdgeInput, b: MixEdgeInput): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function TrackCover({ track, size }: { track: PlaylistTrack; size: number }) {
  const uri = artworkSource(track.artworkPath, track.artworkUrl, size * 2)
  return <View style={{ width: size, height: size, borderRadius: 7, overflow: 'hidden', backgroundColor: '#303030', alignItems: 'center', justifyContent: 'center' }}>
    {uri ? <Image source={{ uri }} accessibilityLabel={`Portada de ${track.title}`} style={{ width: size, height: size }} />
      : <IconMusic size={Math.round(size * 0.45)} color={ICON_COLOR.muted} />}
  </View>
}

function ConfirmarSalidaMix({ visible, canSave, onContinue, onSave, onDiscard }: {
  visible: boolean
  canSave: boolean
  onContinue: () => void
  onSave: () => void
  onDiscard: () => void
}) {
  const action = (label: string, onPress: () => void, primary = false) =>
    <Pressable key={label} {...estadoControlWeb(primary ? 'inverse' : 'normal')}
      accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={{ minHeight: 50, borderRadius: 25, backgroundColor: primary ? '#FFFFFF' : '#303030', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 }}>
      <Text style={{ color: primary ? '#121212' : '#FFFFFF', fontSize: 16, fontWeight: '600', textAlign: 'center' }}>{label}</Text>
    </Pressable>
  const content = <View style={{ padding: 22, gap: 12 }}>
    <Text accessibilityRole="header" style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '700' }}>¿Salir de Mixear?</Text>
    <Text style={{ color: '#B3B3B3', fontSize: 14, lineHeight: 21, marginBottom: 6 }}>
      Hay cambios sin guardar en este mix o en el sonido de la playlist.
    </Text>
    {action('Continuar editando', onContinue, true)}
    {canSave ? action('Guardar este par', onSave) : null}
    {action('Descartar y salir', onDiscard)}
  </View>
  return <Dialogo visible={visible} transparent animationType="fade" titulo="¿Salir de Mixear?" ancho={440}
    onRequestClose={onContinue} contenidoPC={content}>
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
      <Pressable {...estadoControlWeb('none')} accessibilityRole="button" accessibilityLabel="Continuar editando"
        onPress={onContinue} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.55)' }} />
      <Glass radius={22} style={{ width: '100%', maxWidth: 400 }}>{content}</Glass>
    </View>
  </Dialogo>
}

function AnalysisSummary({ title, analysis, error }: { title: string; analysis: AnalisisMusical | null; error: string | null }) {
  const tempo = measuredTempo(analysis)
  return <View style={{ gap: 3 }}>
    <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>{title}</Text>
    {analysis ? <>
      <Text style={{ color: '#B3B3B3', fontSize: 13 }}>
        {tempo?.kind === 'beatgrid' ? `${tempo.bpm.toFixed(1)} BPM · confianza ${Math.round(tempo.confidence * 100)} %${analysis.rhythm?.meter === 4 ? ' · compás 4/4 detectado' : ''}`
          : tempo?.kind === 'approximate' ? `${tempoLabel(tempo)} · sin marcas de pulso fiables${tempo.alternateBpm ? ` · posible mitad/doble tiempo: ≈ ${Math.round(tempo.alternateBpm)} BPM` : ''}${tempo.varying ? ' · variación o incertidumbre entre tramos' : ''}`
            : 'BPM o compás no fiables'}
      </Text>
      <Text style={{ color: '#B3B3B3', fontSize: 13 }}>
        Silencio inicial {seconds(analysis.silence.introEndMs)} · cola {seconds(Math.max(0, analysis.durationMs - analysis.silence.outroStartMs))}
      </Text>
      {analysis.loudness ? <Text style={{ color: '#B3B3B3', fontSize: 13 }}>
        Volumen integrado {analysis.loudness.integratedLufs.toFixed(1)} LUFS · pico real {analysis.loudness.truePeakDbtp.toFixed(1)} dBTP
      </Text> : null}
    </> : <Text style={{ color: '#B3B3B3', fontSize: 13 }}>{error ?? 'Sin análisis'}</Text>}
  </View>
}

function initialEdge(mix: PlaylistMix, from: PlaylistTrack, to: PlaylistTrack, edge?: MixEdge): MixEdgeInput {
  const durationMs = Math.min(edge?.durationMs ?? mix.defaultDurationMs, from.durationMs, to.durationMs, 30_000)
  if (edge) return {
    preset: edge.preset, durationMs,
    fromCueMs: edge.fromCueMs === null ? null : Math.min(edge.fromCueMs, Math.max(0, from.durationMs - durationMs)),
    toCueMs: edge.toCueMs === null ? null : Math.min(edge.toCueMs, Math.max(0, to.durationMs - durationMs)),
    volumeLaw: edge.volumeLaw,
    volumeOut: edge.volumeOut, volumeIn: edge.volumeIn,
    eqSettings: edge.eqSettings, filterSettings: edge.filterSettings,
  }
  return {
    preset: mix.defaultPreset,
    durationMs,
    fromCueMs: Math.max(0, from.durationMs - durationMs),
    toCueMs: 0,
    volumeLaw: mix.defaultPreset === 'fade' ? 'linear' : 'equal_power',
    volumeOut: null, volumeIn: null,
  }
}

function NumberControl({ label, value, max, onChange, format = seconds, disabled = false, step = 100 }: {
  label: string; value: number; max: number; onChange: (ms: number) => void
  format?: (value: number) => string; disabled?: boolean; step?: number
}) {
  return <View style={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={{ color: '#FFFFFF', fontSize: 15 }}>{label}</Text>
      <Text style={{ color: '#B3B3B3', fontVariant: ['tabular-nums'] }}>{format(value)}</Text>
    </View>
    {!disabled ? <SeekBar label={label} progress={max > 0 ? value / max : 0} elapsedMs={0} totalMs={1} compact
      onSeek={fraction => onChange(Math.min(max, Math.max(0, Math.round(fraction * max / step) * step)))} /> : null}
  </View>
}

/** Variantes de Mix y editor de la transición entre dos filas reales. */
export default function PlaylistMixScreen() {
  const { id, nombre, fromTrackId } = useLocalSearchParams<{ id?: string; nombre?: string; fromTrackId?: string }>()
  const router = useRouter()
  const navigation = useNavigation()
  const { width: viewportWidth } = useWindowDimensions()
  const desktop = Platform.OS === 'web' && viewportWidth >= 780
  const piso = 24
  const [sidebarWidth, setSidebarWidth] = useState(284)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobilePickerOpen, setMobilePickerOpen] = useState(false)
  const user = useUser()
  const soundPreference = usePlaylistSoundPreference(id ?? null)
  const personalEq = useEcualizador()
  const [tracks, setTracks] = useState<PlaylistTrack[] | null>(null)
  const [mixes, setMixes] = useState<PlaylistMix[]>([])
  const [choice, setChoice] = useState<PlaylistMixChoice>({ mode: 'default', mixId: null })
  const [profile, setProfile] = useState<PlaylistSoundProfile | null>(null)
  const [permissions, setPermissions] = useState<PlaylistMixPermissions | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loadedEdges, setLoadedEdges] = useState<{ mixId: string; items: MixEdge[] } | null>(null)
  const [pairIndex, setPairIndex] = useState(0)
  const [draftHistories, setDraftHistories] = useState<Record<string, DraftHistory>>({})
  const curveGesture = useRef<{ key: string; historyRecorded: boolean } | null>(null)
  const [newMixName, setNewMixName] = useState('')
  const [renameName, setRenameName] = useState('')
  const [generalDurationDraft, setGeneralDurationDraft] = useState<{ key: string; value: number } | null>(null)
  const [soundDraft, setSoundDraft] = useState<{ key: string; bands: number[]; preamp: number } | null>(null)
  const [pairAnalysis, setPairAnalysis] = useState<PairAnalysis | null>(null)
  const [analysisRetry, setAnalysisRetry] = useState(0)
  const [tempoByPath, setTempoByPath] = useState<Record<string, MeasuredTempo>>({})
  const [failedTempoPaths, setFailedTempoPaths] = useState<string[]>([])
  const [tempoRetry, setTempoRetry] = useState(0)
  const analysisCache = useRef(new Map<string, AnalisisMusical>())
  const attemptedTempoPaths = useRef(new Set<string>())
  const [detailCache, setDetailCache] = useState<Map<string, MixWaveformDetail>>(() => new Map())
  const detailCacheRef = useRef(new Map<string, MixWaveformDetail>())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [edgeConflictKey, setEdgeConflictKey] = useState<string | null>(null)
  const orderAbort = useRef<AbortController | null>(null)
  const exitDispatched = useRef(false)
  const editorScroll = useRef<ScrollView | null>(null)
  const createInFlight = useRef(false)
  const [orderProgress, setOrderProgress] = useState<{ done: number; total: number } | null>(null)
  const [orderProposal, setOrderProposal] = useState<RhythmOrderSuggestion | null>(null)
  const [originalComparison, setOriginalComparison] = useState<{ key: string; enabled: boolean } | null>(null)
  const [volumeDeck, setVolumeDeck] = useState<'out' | 'in'>('out')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showCurveEditor, setShowCurveEditor] = useState(desktop)
  const [curveView, setCurveView] = useState<MixCurveView>('volume')
  const [curveDeck, setCurveDeck] = useState<'out' | 'in'>('out')
  const [confirmExit, setConfirmExit] = useState(false)
  const [allowExit, setAllowExit] = useState(false)
  const [blockedAction, setBlockedAction] = useState<NavigationAction | null>(null)
  const outgoingPosition = useSharedValue(-1)
  const incomingPosition = useSharedValue(-1)
  const updatePreviewPositions = useCallback((outgoingMs: number | null, incomingMs: number | null) => {
    outgoingPosition.set(outgoingMs ?? -1)
    incomingPosition.set(incomingMs ?? -1)
  }, [outgoingPosition, incomingPosition])
  const unsavedPairs = Object.values(draftHistories).filter(history => !sameDraft(history.current, history.baseline)).length
  const soundChanged = !!soundDraft && soundDraft.key === `${id}:${profile?.revision ?? 0}` &&
    (JSON.stringify(soundDraft.bands) !== JSON.stringify(profile?.bandsDb ?? FLAT_BANDS)
      || soundDraft.preamp !== (profile?.preampDb ?? 0))
  const selectedMix = mixes.find(item => item.id === editingId)
  const durationChanged = !!generalDurationDraft && !!selectedMix &&
    generalDurationDraft.key === `${selectedMix.id}:${selectedMix.revision}` &&
    generalDurationDraft.value !== selectedMix.defaultDurationMs
  const hasUnsaved = unsavedPairs > 0 || soundChanged || durationChanged
  usePreventRemove(hasUnsaved && !allowExit, ({ data }) => {
    setBlockedAction(data.action)
    setConfirmExit(true)
  })
  useEffect(() => {
    if (!allowExit || exitDispatched.current) return
    exitDispatched.current = true
    orderAbort.current?.abort()
    if (blockedAction) navigation.dispatch(blockedAction)
    else volver(router, '/')
  }, [allowExit, blockedAction, navigation, router])
  const leave = () => { setConfirmExit(false); setAllowExit(true) }
  const close = () => {
    if (!hasUnsaved) { leave(); return }
    setConfirmExit(true)
  }
  useEffect(() => () => { orderAbort.current?.abort() }, [])

  const editing = mixes.find(item => item.id === editingId) ?? null
  const edges = loadedEdges?.mixId === editingId ? loadedEdges.items : []
  const from = tracks?.[pairIndex] ?? null
  const to = tracks?.[pairIndex + 1] ?? null
  const edge = editing && from && to
    ? edges.find(item => item.fromPlaylistTrackId === from.id && item.toPlaylistTrackId === to.id)
    : undefined
  const canEditPlaylist = permissions?.canEdit === true
  const canPublish = permissions?.canPublish === true
  const canEditMix = !!editing && (canPublish
    || (canEditPlaylist && editing.creatorId === user?.id && !editing.published))
  const publishedMix = mixes.find(item => item.published) ?? null
  const choiceValue = choice.mode === 'selected' ? choice.mixId : choice.mode
  const draftKey = editing && from && to ? `${editing.id}:${from.id}:${to.id}:${edge?.revision ?? 0}` : null
  const defaultDraft = useMemo(() => editing && from && to ? initialEdge(editing, from, to, edge) : null,
    [editing, from, to, edge])
  const draftHistory = draftKey ? draftHistories[draftKey] : undefined
  const draft = draftHistory?.current ?? defaultDraft
  const activeCurveView = curveView
  const dirty = !!draftHistory && !sameDraft(draftHistory.current, draftHistory.baseline)
  const compareOriginal = !!draftKey && originalComparison?.key === draftKey && originalComparison.enabled
  const previewDraft = useMemo(() => draft && compareOriginal ? {
    ...draft, preset: 'none' as const, volumeOut: null, volumeIn: null,
    eqSettings: null, filterSettings: null,
  } : draft, [draft, compareOriginal])
  const generalDurationKey = editing ? `${editing.id}:${editing.revision}` : null
  const generalDuration = generalDurationDraft?.key === generalDurationKey
    ? generalDurationDraft.value : editing?.defaultDurationMs ?? 4000
  const soundKey = id ? `${id}:${profile?.revision ?? 0}` : null
  const soundBands = soundDraft?.key === soundKey ? soundDraft.bands : profile?.bandsDb ?? FLAT_BANDS
  const soundPreamp = soundDraft?.key === soundKey ? soundDraft.preamp : profile?.preampDb ?? 0
  const previewProfile = useMemo(() => !soundPreference.loaded || !soundPreference.enabled
    ? null : canPublish ? { bandsDb: soundBands, preampDb: soundPreamp } : profile,
  [soundPreference.loaded, soundPreference.enabled, canPublish, soundBands, soundPreamp, profile])
  const trackNames = useMemo(() => new Map((tracks ?? []).map(track => [track.id, track.title])), [tracks])
  const setSoundBands = (update: (bands: number[]) => number[]) => {
    if (!soundKey) return
    setSoundDraft(previous => ({
      key: soundKey,
      bands: update(previous?.key === soundKey ? previous.bands : profile?.bandsDb ?? FLAT_BANDS),
      preamp: previous?.key === soundKey ? previous.preamp : profile?.preampDb ?? 0,
    }))
  }
  const setSoundPreamp = (value: number) => {
    if (!soundKey) return
    setSoundDraft(previous => ({
      key: soundKey,
      bands: previous?.key === soundKey ? previous.bands : profile?.bandsDb ?? FLAT_BANDS,
      preamp: value,
    }))
  }
  const setDraft = (update: (previous: MixEdgeInput | null) => MixEdgeInput | null) => {
    if (!draftKey || !defaultDraft) return
    // Un gesto puede publicar decenas de cuadros; Deshacer debe revertir el gesto completo.
    const grouped = curveGesture.current?.key === draftKey
    const recordHistory = !grouped || !curveGesture.current?.historyRecorded
    if (grouped && curveGesture.current) curveGesture.current.historyRecorded = true
    setDraftHistories(previous => {
      const history = previous[draftKey]
      const before = history?.current ?? defaultDraft
      const next = update(before)
      if (!next || sameDraft(next, before)) return previous
      return { ...previous, [draftKey]: {
        baseline: history?.baseline ?? defaultDraft,
        current: next,
        past: recordHistory ? [...(history?.past ?? []), before].slice(-30) : history?.past ?? [],
        future: [],
      } }
    })
  }
  const beginCurveGesture = () => { if (draftKey) curveGesture.current = { key: draftKey, historyRecorded: false } }
  const endCurveGesture = () => { curveGesture.current = null }
  const undoDraft = () => {
    if (!draftKey) return
    setDraftHistories(previous => {
      const history = previous[draftKey]
      if (!history?.past.length) return previous
      return { ...previous, [draftKey]: {
        ...history,
        current: history.past[history.past.length - 1],
        past: history.past.slice(0, -1), future: [history.current, ...history.future],
      } }
    })
  }
  const redoDraft = () => {
    if (!draftKey) return
    setDraftHistories(previous => {
      const history = previous[draftKey]
      if (!history?.future.length) return previous
      return { ...previous, [draftKey]: {
        ...history,
        current: history.future[0], past: [...history.past, history.current].slice(-30),
        future: history.future.slice(1),
      } }
    })
  }
  const pairKey = from && to ? `${from.id}:${from.audioPath}:${to.id}:${to.audioPath}` : null
  const currentAnalysis = pairAnalysis?.key === pairKey ? pairAnalysis : null
  const analyzedPairKey = currentAnalysis?.key
  const fromAnalysis = currentAnalysis?.from?.analysis ?? null
  const toAnalysis = currentAnalysis?.to?.analysis ?? null
  const fromTempo = measuredTempo(fromAnalysis) ?? (from?.audioPath ? tempoByPath[from.audioPath] ?? null : null)
  const toTempo = measuredTempo(toAnalysis) ?? (to?.audioPath ? tempoByPath[to.audioPath] ?? null : null)
  const tempoDifference = fromTempo && toTempo ? Math.round(Math.abs(fromTempo.bpm - toTempo.bpm)) : null
  const approximateComparison = fromTempo?.kind === 'approximate' || toTempo?.kind === 'approximate'
  const possibleHalfTime = (fromTempo?.kind === 'approximate' && fromTempo.alternateBpm !== null) ||
    (toTempo?.kind === 'approximate' && toTempo.alternateBpm !== null)
  const outPeaks = currentAnalysis?.from?.peaks ?? []
  const inPeaks = currentAnalysis?.to?.peaks ?? []
  const outBands = currentAnalysis?.from?.bands ?? null
  const inBands = currentAnalysis?.to?.bands ?? null
  const fromDuration = currentAnalysis?.from?.durationMs ?? from?.durationMs ?? 0
  const toDuration = currentAnalysis?.to?.durationMs ?? to?.durationMs ?? 0
  const fromCue = draft && from ? draft.fromCueMs ?? Math.max(0, from.durationMs - draft.durationMs) : 0
  const toCue = draft?.toCueMs ?? 0
  const fromDetailSource = mixDetailSource(from)
  const toDetailSource = mixDetailSource(to)
  const fromDetailRange = draft ? mixWaveformDetailRange(fromDuration, draft.durationMs, fromCue,
    fromDetailSource?.kind === 'audio' ? 30_000 : Number.POSITIVE_INFINITY) : null
  const toDetailRange = draft ? mixWaveformDetailRange(toDuration, draft.durationMs, toCue,
    toDetailSource?.kind === 'audio' ? 30_000 : Number.POSITIVE_INFINITY) : null
  const fromDetailKey = fromDetailSource && fromDetailRange && outPeaks.length
    ? JSON.stringify([fromDetailSource.kind, fromDetailSource.id, fromDetailRange.startMs, fromDetailRange.durationMs]) : null
  const toDetailKey = toDetailSource && toDetailRange && inPeaks.length
    ? JSON.stringify([toDetailSource.kind, toDetailSource.id, toDetailRange.startMs, toDetailRange.durationMs]) : null
  const detailKeys = useMemo(() => [...new Set([fromDetailKey, toDetailKey].filter((key): key is string => !!key))],
    [fromDetailKey, toDetailKey])
  const fromDetailPeaks = fromDetailKey ? detailCache.get(fromDetailKey) ?? null : null
  const toDetailPeaks = toDetailKey ? detailCache.get(toDetailKey) ?? null : null
  const autoSuggestion = from && to && fromAnalysis && toAnalysis
    ? suggestAutoMix(fromAnalysis, toAnalysis, from.durationMs, to.durationMs, draft?.durationMs)
    : null
  const barSuggestions = useMemo(() => {
    if (!from || !to || !fromAnalysis || !toAnalysis) return []
    return ([1, 2, 4, 8, 16] as const).flatMap(bars => {
      const suggested = suggestBarMix(fromAnalysis, toAnalysis, from.durationMs, to.durationMs, bars)
      return suggested ? [suggested] : []
    })
  }, [from, to, fromAnalysis, toAnalysis])

  const reload = useCallback(async () => {
    if (!id) return
    const [nextTracks, nextMixes, nextChoice, nextProfile, nextPermissions] = await Promise.all([
      listTracks(id), listPlaylistMixes(id), getPlaylistMixChoice(id), getPlaylistSoundProfile(id),
      getPlaylistMixPermissions(id, user?.id ?? null),
    ])
    setTracks(nextTracks)
    setMixes(nextMixes)
    setChoice(nextChoice)
    setProfile(nextProfile)
    setPermissions(nextPermissions)
    setEditingId(previous => previous && nextMixes.some(item => item.id === previous)
      ? previous : nextMixes.find(item => item.id === nextChoice.mixId)?.id ?? nextMixes.find(item => item.published)?.id ?? nextMixes[0]?.id ?? null)
  }, [id, user?.id])

  useEffect(() => {
    let alive = true
    if (!id) return
    Promise.all([
      listTracks(id), listPlaylistMixes(id), getPlaylistMixChoice(id), getPlaylistSoundProfile(id),
      getPlaylistMixPermissions(id, user?.id ?? null),
    ]).then(([nextTracks, nextMixes, nextChoice, nextProfile, nextPermissions]) => {
        if (!alive) return
        setTracks(nextTracks); setMixes(nextMixes); setChoice(nextChoice); setProfile(nextProfile)
        setPermissions(nextPermissions)
        const requestedPair = nextTracks.findIndex((track, index) => index < nextTracks.length - 1 && track.id === fromTrackId)
        setPairIndex(requestedPair >= 0 ? requestedPair : 0)
        setEditingId(nextMixes.find(item => item.id === nextChoice.mixId)?.id ?? nextMixes.find(item => item.published)?.id ?? nextMixes[0]?.id ?? null)
      }).catch(cause => { if (alive) setError(mensajeError(cause)) })
    return () => { alive = false }
  }, [id, user?.id, fromTrackId])

  const editingMixId = editing?.id
  useEffect(() => {
    let alive = true
    if (!editingMixId) return
    listMixEdges(editingMixId).then(items => { if (alive) setLoadedEdges({ mixId: editingMixId, items }) })
      .catch(cause => { if (alive) setError(mensajeError(cause)) })
    return () => { alive = false }
  }, [editingMixId])

  const fromAudioPath = from?.audioPath
  const toAudioPath = to?.audioPath
  const fromVideoId = from?.videoId
  const toVideoId = to?.videoId
  useEffect(() => {
    if (!pairKey) return
    const controller = new AbortController()
    const request = (audioPath: string | null | undefined, videoId: string | null | undefined) => {
      const cached = audioPath ? analysisCache.current.get(audioPath) : null
      if (cached) return Promise.resolve<OndaDeMix>({
        peaks: cached.waveform.rms, bands: cached.waveform.bands ?? null, durationMs: cached.durationMs,
        source: 'analysis', analysis: cached, analysisError: null,
      })
      return pedirOndaDeMix({ audioPath, videoId }, controller.signal)
    }
    void Promise.allSettled([
      request(fromAudioPath, fromVideoId),
      request(toAudioPath, toVideoId),
    ]).then(([saliente, entrante]) => {
      if (controller.signal.aborted) return
      const measured: Record<string, MeasuredTempo> = {}
      for (const [path, result] of [[fromAudioPath, saliente], [toAudioPath, entrante]] as const) {
        if (!path || result.status !== 'fulfilled' || !result.value.analysis) continue
        analysisCache.current.set(path, result.value.analysis)
        attemptedTempoPaths.current.add(path)
        measured[path] = measuredTempo(result.value.analysis)
      }
      if (Object.keys(measured).length) {
        setTempoByPath(previous => ({ ...previous, ...measured }))
        setFailedTempoPaths(previous => previous.filter(path => !(path in measured)))
      }
      setPairAnalysis({
        key: pairKey, loading: false,
        from: saliente.status === 'fulfilled' ? saliente.value : null,
        to: entrante.status === 'fulfilled' ? entrante.value : null,
        fromError: saliente.status === 'rejected' ? mensajeError(saliente.reason) : saliente.value.analysisError,
        toError: entrante.status === 'rejected' ? mensajeError(entrante.reason) : entrante.value.analysisError,
      })
    })
    return () => controller.abort()
  }, [pairKey, fromAudioPath, toAudioPath, fromVideoId, toVideoId, analysisRetry])

  useEffect(() => {
    // El par visible tiene prioridad. Sólo después se mide el BPM del resto;
    // dos workers como máximo evitan saturar el servicio de análisis.
    if (!editingMixId || !analyzedPairKey || !tracks) return
    const attempted = attemptedTempoPaths.current
    const paths = [...new Set(tracks.map(track => track.audioPath).filter((path): path is string => !!path))]
      .filter(path => !analysisCache.current.has(path) && !attempted.has(path))
    if (!paths.length) return
    const controller = new AbortController()
    const running = new Set<string>()
    let next = 0
    const worker = async () => {
      while (next < paths.length && !controller.signal.aborted) {
        const path = paths[next++]
        attempted.add(path)
        running.add(path)
        try {
          const analysis = await pedirAnalisisMusical(path, controller.signal)
          if (controller.signal.aborted) return
          analysisCache.current.set(path, analysis)
          setTempoByPath(previous => ({ ...previous, [path]: measuredTempo(analysis) }))
          setFailedTempoPaths(previous => previous.filter(item => item !== path))
          if (path === fromAudioPath || path === toAudioPath) {
            const wave: OndaDeMix = {
              peaks: analysis.waveform.rms, bands: analysis.waveform.bands ?? null, durationMs: analysis.durationMs,
              source: 'analysis', analysis, analysisError: null,
            }
            setPairAnalysis(previous => previous?.key === analyzedPairKey ? {
              ...previous,
              from: path === fromAudioPath ? wave : previous.from,
              to: path === toAudioPath ? wave : previous.to,
              fromError: path === fromAudioPath ? null : previous.fromError,
              toError: path === toAudioPath ? null : previous.toError,
            } : previous)
          }
        } catch {
          if (controller.signal.aborted) { attempted.delete(path); return }
          setTempoByPath(previous => ({ ...previous, [path]: null }))
          setFailedTempoPaths(previous => previous.includes(path) ? previous : [...previous, path])
        } finally {
          running.delete(path)
        }
      }
    }
    void Promise.all(Array.from({ length: Math.min(2, paths.length) }, worker))
    return () => {
      controller.abort()
      for (const path of running) attempted.delete(path)
    }
  }, [editingMixId, analyzedPairKey, tracks, tempoRetry, fromAudioPath, toAudioPath])

  useEffect(() => {
    const missing = detailKeys.filter(key => !detailCacheRef.current.has(key))
    if (!missing.length) return
    const controller = new AbortController()
    // El rango cambia mientras se arrastra el cue. Esperar el final del gesto
    // evita una solicitud por cada pixel; la API y la caché usan tramos redondeados.
    const timer = setTimeout(() => {
      void Promise.all(missing.map(async key => {
        const [kind, sourceId, startMs, durationMs] = JSON.parse(key) as ['video' | 'audio', string, number, number]
        try {
          const tramo = { desdeMs: startMs, durMs: durationMs }
          const result = kind === 'audio'
            ? await fetchAudioWaveform(sourceId, 600, controller.signal, tramo)
            : await fetchWaveform(sourceId, 600, controller.signal, tramo)
          const detail = result.peaks.length && result.durationMs > 0
            ? { peaks: result.peaks, bands: result.bands ?? null, startMs, durationMs: result.durationMs } : null
          return [key, detail] as const
        } catch { return [key, null] as const }
      })).then(entries => {
        if (controller.signal.aborted) return
        const next = new Map(detailCacheRef.current)
        let changed = false
        for (const [key, detail] of entries) {
          if (!detail) continue
          next.set(key, detail)
          changed = true
        }
        if (!changed) return
        while (next.size > 64) next.delete(next.keys().next().value!)
        detailCacheRef.current = next
        setDetailCache(next)
      })
    }, 240)
    return () => { clearTimeout(timer); controller.abort() }
  }, [detailKeys, analysisRetry])

  const run = useCallback(async (task: () => Promise<unknown>) => {
    if (busy || !id) return
    setBusy(true); setError(null)
    try { await task(); await reload(); avisarMixPlaylistCambiado(id) }
    catch (cause) { setError(mensajeError(cause)) }
    finally { setBusy(false) }
  }, [busy, id, reload])

  const create = () => {
    if (createInFlight.current || busy || !id) return
    createInFlight.current = true
    void run(async () => {
      // Si la respuesta de una creación anterior se perdió, reusar su mix evita duplicarlo al reintentar.
      const existing = !editing ? await listPlaylistMixes(id) : []
      const next = existing[0] ?? await createPlaylistMix(id,
        newMixName.trim() || (mixes.length ? `Mix ${mixes.length + 1}` : 'Mix automático'))
      setEditingId(next.id); setNewMixName(''); setPairIndex(0)
      await setPlaylistMixChoice(id, { mode: 'selected', mixId: next.id })
    }).finally(() => { createInFlight.current = false })
  }
  const duplicate = () => { if (editing) void run(async () => {
    const next = await duplicatePlaylistMix(editing.id, copyName(editing.name))
    setEditingId(next.id)
  }) }
  const saveEdge = () => { if (editing && from && to && draft) void run(async () => {
    let saved: MixEdge
    try { saved = await saveMixEdge(editing.id, from.id, to.id, draft, edge?.revision ?? null) }
    catch (cause) {
      if (String((cause as { message?: unknown })?.message ?? cause).includes('mix_edge_revision_conflict')) {
        setEdgeConflictKey(draftKey)
        throw new Error('Otra persona guardó este par antes. Podés conservar tus cambios en una nueva copia del mix.')
      }
      throw cause
    }
    setEdgeConflictKey(null)
    if (draftKey) setDraftHistories(previous => {
      const next = { ...previous }; delete next[draftKey]; return next
    })
    setLoadedEdges(previous => previous?.mixId === editing.id
      ? { mixId: editing.id, items: [...previous.items.filter(item => item.id !== saved.id), saved] }
      : previous)
  }) }
  const saveConflictedCopy = () => { if (id && editing && from && to && draft && edgeConflictKey === draftKey) void run(async () => {
    const copy = await duplicatePlaylistMix(editing.id, copyName(editing.name))
    try {
      const copyEdge = await getMixEdge(copy.id, from.id, to.id)
      await saveMixEdge(copy.id, from.id, to.id, draft, copyEdge?.revision ?? null)
    } catch (cause) {
      await deletePlaylistMix(copy.id).catch(() => false)
      throw cause
    }
    await setPlaylistMixChoice(id, { mode: 'selected', mixId: copy.id })
    setEditingId(copy.id)
    setEdgeConflictKey(null)
    setDraftHistories(previous => {
      const next = { ...previous }; if (draftKey) delete next[draftKey]; return next
    })
  }) }
  const resetEdge = () => { if (edge) void run(async () => {
    await deleteMixEdge(edge)
    if (draftKey) setDraftHistories(previous => {
      const next = { ...previous }; delete next[draftKey]; return next
    })
    setLoadedEdges(previous => previous?.mixId === edge.mixId
      ? { mixId: edge.mixId, items: previous.items.filter(item => item.id !== edge.id) }
      : previous)
  }) }
  const suggestOrder = async () => {
    if (!tracks || tracks.length < 3 || orderProgress || !canEditPlaylist) return
    const controller = new AbortController()
    orderAbort.current = controller
    const snapshot = [...tracks]
    const analyses: (AnalisisMusical | null)[] = Array(snapshot.length).fill(null)
    let nextIndex = 0, completed = 0
    setOrderProposal(null)
    setOrderProgress({ done: 0, total: snapshot.length })
    setError(null)
    const worker = async () => {
      while (nextIndex < snapshot.length && !controller.signal.aborted) {
        const index = nextIndex++
        try {
          if (snapshot[index].audioPath) analyses[index] = await pedirAnalisisMusical(snapshot[index].audioPath, controller.signal)
        } catch { /* Sin análisis fiable, esta fila conserva su posición. */ }
        if (controller.signal.aborted) return
        completed++
        setOrderProgress({ done: completed, total: snapshot.length })
      }
    }
    try {
      await Promise.all(Array.from({ length: Math.min(2, snapshot.length) }, worker))
      if (controller.signal.aborted) return
      setOrderProposal(suggestRhythmOrder(snapshot.map((track, index) => ({
        trackId: track.id, audioPath: track.audioPath, durationMs: track.durationMs,
        analysis: analyses[index],
      }))))
    } catch (cause) {
      if (!controller.signal.aborted) setError(mensajeError(cause))
    } finally {
      if (orderAbort.current === controller) orderAbort.current = null
      setOrderProgress(null)
    }
  }
  const applyOrder = () => {
    if (!id || !orderProposal?.changed || !tracks || busy) return
    const ids = tracks.map(track => track.id)
    if (ids.some((item, index) => item !== orderProposal.expectedOrder[index])) {
      setError('La playlist cambió. Volvé a pedir una sugerencia de orden.'); setOrderProposal(null); return
    }
    void run(async () => {
      try { await reorderPlaylistTracks(id, orderProposal.expectedOrder, orderProposal.suggestedOrder) }
      catch (cause) {
        if (cause instanceof PlaylistOrderConflictError) { setOrderProposal(null); await reload() }
        throw cause
      }
      setOrderProposal(null)
      avisarContenidoPlaylistCambiado(id)
      setPairIndex(0)
    })
  }
  const saveSound = () => { if (id) void run(() => savePlaylistSoundProfile(id, {
    bandsDb: soundBands, preampDb: soundPreamp,
  }, profile?.revision ?? null)) }

  const options = useMemo(() => [
    { value: 'default', label: 'Mix publicado', sfSymbol: 'music.note' as const },
    ...mixes.map(item => ({ value: item.id, label: item.name, sfSymbol: 'slider.horizontal.3' as const })),
    { value: 'off', label: 'Sin mix de playlist', sfSymbol: 'minus.circle' as const },
  ], [mixes])

  const versionCards = mixes.map(item => {
    const pending = Object.entries(draftHistories).some(([key, history]) =>
      key.startsWith(`${item.id}:`) && !sameDraft(history.current, history.baseline))
    return <Pressable key={item.id} accessibilityRole="button"
      accessibilityState={{ selected: editingId === item.id }}
      accessibilityLabel={`Editar ${item.name}${pending ? ', cambios sin guardar' : ''}`}
      onPress={() => { setEditingId(item.id); setPairIndex(0); setConfirmDelete(false); setMobilePickerOpen(false); editorScroll.current?.scrollTo({ y: 0, animated: true }) }}
      style={{ minWidth: desktop ? 0 : 132, maxWidth: desktop ? undefined : 210,
        borderRadius: 14, borderWidth: 1, borderColor: editingId === item.id ? '#FFFFFF' : '#444444',
        backgroundColor: '#242424', padding: 14, gap: 6 }}>
      <Text style={{ color: '#FFFFFF', fontWeight: '600' }} numberOfLines={1}>{item.name}</Text>
      <Text style={{ color: pending ? '#FFFFFF' : '#B3B3B3', fontSize: 12 }}>
        {pending ? '● Sin guardar' : `${item.published ? 'Publicado · ' : ''}${labelPreset(item.defaultPreset)}`}
      </Text>
    </Pressable>
  })
  const versionPicker = <View style={{ gap: 10 }}>
    <Text style={{ color: '#B3B3B3', fontSize: 13, paddingHorizontal: 4 }}>VERSIONES DEL MIX</Text>
    {!editing ? <Text style={{ color: '#FFFFFF', fontSize: 14, paddingHorizontal: 4 }}>
      {canEditPlaylist ? 'Creá un mix para ver las ondas y editar las transiciones entre canciones.'
        : 'Esta playlist todavía no tiene un mix disponible.'}
    </Text> : null}
    {desktop ? <View style={{ gap: 8 }}>{versionCards}</View>
      : <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{versionCards}</ScrollView>}
    {canEditPlaylist && !editing ? <PrimaryButton label="Crear mix automático" onPress={create} busy={busy} /> : null}
  </View>

  const pairCards = editing && tracks ? tracks.slice(0, -1).map((track, index) => {
    const next = tracks[index + 1]
    const trackTempo = track.audioPath ? tempoByPath[track.audioPath] ?? null : null
    const nextTempo = next.audioPath ? tempoByPath[next.audioPath] ?? null : null
    const trackTempoLoading = !!track.audioPath && !(track.audioPath in tempoByPath)
    const nextTempoLoading = !!next.audioPath && !(next.audioPath in tempoByPath)
    const custom = edges.some(item => item.fromPlaylistTrackId === track.id && item.toPlaylistTrackId === next.id)
    const pending = Object.entries(draftHistories).some(([key, history]) =>
      key.startsWith(`${editing.id}:${track.id}:${next.id}:`) && !sameDraft(history.current, history.baseline))
    return <Pressable key={`${track.id}:${next.id}`} accessibilityRole="button"
      accessibilityState={{ selected: pairIndex === index }}
      accessibilityLabel={`Transición ${index + 1}: ${track.title}, ${tempoLabel(trackTempo, trackTempoLoading)}, a ${next.title}, ${tempoLabel(nextTempo, nextTempoLoading)}${pending ? ', cambios sin guardar' : ''}`}
      onPress={() => { setPairIndex(index); setMobilePickerOpen(false); editorScroll.current?.scrollTo({ y: 0, animated: true }) }}
      style={{ minWidth: desktop ? 0 : 170, maxWidth: desktop ? undefined : 210,
        borderRadius: 12, borderWidth: 1, borderColor: pairIndex === index ? '#FFFFFF' : '#444444',
        backgroundColor: '#242424', padding: 12, gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TrackCover track={track} size={desktop ? 40 : 36} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 14 }} numberOfLines={1}>{track.title}</Text>
          <Text style={{ color: '#B3B3B3', fontSize: 11, fontVariant: ['tabular-nums'] }} numberOfLines={1}>{tempoCompact(trackTempo, trackTempoLoading)}</Text>
          <Text style={{ color: '#FFFFFF', fontSize: 13, marginTop: 3 }} numberOfLines={1}>→ {next.title}</Text>
          <Text style={{ color: '#B3B3B3', fontSize: 11, fontVariant: ['tabular-nums'] }} numberOfLines={1}>{tempoCompact(nextTempo, nextTempoLoading)}</Text>
        </View>
        {desktop ? <TrackCover track={next} size={40} /> : null}
      </View>
      <Text style={{ color: pending ? '#FFFFFF' : '#B3B3B3', fontSize: 11, paddingTop: 4 }}>
        {pending ? '● Sin guardar' : custom ? 'Personalizada' : 'Preset general'}
      </Text>
    </Pressable>
  }) : []
  const pairPicker = pairCards.length ? <View style={{ gap: 12 }}>
    <View style={{ gap: 3, paddingHorizontal: 4 }}>
      <Text accessibilityRole="header" style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '700' }}>Transiciones entre canciones</Text>
      <Text style={{ color: '#B3B3B3', fontSize: 13 }}>Elegí un par para ver sus ondas, escucharlo y ajustar el cruce.</Text>
    </View>
    {desktop ? <View style={{ gap: 8 }}>{pairCards}</View>
      : <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{pairCards}</ScrollView>}
    {failedTempoPaths.length ? <GhostButton label={`Reintentar BPM de ${failedTempoPaths.length} ${failedTempoPaths.length === 1 ? 'canción' : 'canciones'}`}
      onPress={() => {
        for (const path of failedTempoPaths) attemptedTempoPaths.current.delete(path)
        setFailedTempoPaths([])
        setTempoRetry(value => value + 1)
      }} /> : null}
  </View> : null

  return <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: '#121212' }}>
    <View style={{ flex: 1, width: '100%', maxWidth: 1600, alignSelf: 'center' }}>
      {desktop ? <View style={{ minHeight: 84, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 28, gap: 16 }}>
        <View style={{ minWidth: 0, gap: 3 }}>
          <Text accessibilityRole="header" style={{ color: '#FFFFFF', fontSize: 26, fontWeight: '700' }}>Mixear</Text>
          <Text style={{ color: '#B3B3B3', fontSize: 14 }} numberOfLines={1}>{nombre ?? 'Playlist'}</Text>
        </View>
        <BotonVidrio label="Cerrar editor de mixes" onPress={close} radius={22} style={{ width: 44, height: 44 }}>
          <IconClose size={18} color={ICON_COLOR.foreground} />
        </BotonVidrio>
      </View> : <EncabezadoHoja titulo="Mixear" sobre={nombre ?? 'Playlist'} izquierda={<BotonHoja tipo="cerrar" onPress={close} />} />}
      <View style={{ flex: 1, minHeight: 0, flexDirection: desktop ? 'row' : 'column' }}>
        {desktop ? <ResizableRegion width={sidebarWidth} collapsed={sidebarCollapsed}
          minWidth={220} maxWidth={360} resizeEdge="right" onWidthChange={setSidebarWidth}>
          {({ hovered }) => sidebarCollapsed ? <CollapsedSidebar side="left" hovered={hovered}
            label="Mostrar versiones y transiciones" onExpand={() => setSidebarCollapsed(false)}
            resting={<View style={{ alignItems: 'center', gap: 9, paddingTop: 4 }}>
              {from ? <TrackCover track={from} size={38} /> : <IconMusic size={20} color={ICON_COLOR.muted} />}
              {to ? <TrackCover track={to} size={38} /> : null}
            </View>} /> : <View style={{ flex: 1, minHeight: 0, backgroundColor: '#181818' }}>
            <CabeceraLateral titulo="Mix">
              <BotonLateral label="Contraer versiones y transiciones" onPress={() => setSidebarCollapsed(true)}
                icono={<IconCollapseLeft size={16} color={ICON_COLOR.muted} />} />
            </CabeceraLateral>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32, gap: 28 }}>
              {versionPicker}
              {pairPicker}
            </ScrollView>
          </View>}
        </ResizableRegion> : null}
        <ScrollView ref={editorScroll} style={{ flex: 1, minWidth: 0 }} contentContainerStyle={{ paddingHorizontal: desktop ? 28 : 16, paddingTop: desktop ? 20 : 0, paddingBottom: piso + 24, gap: 22 }} keyboardShouldPersistTaps="handled">
        {error ? <Text accessibilityRole="alert" style={{ color: '#FF7474', paddingHorizontal: 4 }}>{error}</Text> : null}
        {!tracks ? <ActivityIndicator color="#FFFFFF" /> : null}
        {!desktop && !editing ? versionPicker : null}
        {!desktop && editing ? <View style={{ gap: 10 }}>
          <BotonSuperficie accessibilityRole="button" accessibilityState={{ expanded: mobilePickerOpen }}
            accessibilityLabel={`${mobilePickerOpen ? 'Ocultar' : 'Elegir'} versión y transición`}
            onPress={() => setMobilePickerOpen(open => !open)}
            style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: 22, backgroundColor: '#242424',
              flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ flex: 1, minWidth: 0, color: '#FFFFFF', fontSize: 13, fontWeight: '600' }} numberOfLines={1}>
              {editing.name} · {Math.min(pairIndex + 1, Math.max(1, (tracks?.length ?? 1) - 1))} de {Math.max(1, (tracks?.length ?? 1) - 1)}
            </Text>
            <IconChevronDown size={16} color={ICON_COLOR.muted} />
          </BotonSuperficie>
          {mobilePickerOpen ? <View style={{ gap: 18 }}>{versionPicker}{pairPicker}</View> : null}
        </View> : null}
        {desktop && !editing && tracks ? <View style={{ flex: 1, minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '700', textAlign: 'center' }}>Tus transiciones, en una sola vista</Text>
          <Text style={{ color: '#B3B3B3', fontSize: 15, textAlign: 'center', maxWidth: 420 }}>Elegí una versión o creá un mix automático en el panel izquierdo para empezar.</Text>
        </View> : null}

        {editing ? <>
          {(tracks?.length ?? 0) >= 2 ? <View style={{ gap: 12 }}>
            {from && to && draft ? <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 }}>
              <TrackCover track={from} size={48} />
              <Text style={{ color: '#B3B3B3', fontSize: 18 }}>→</Text>
              <TrackCover track={to} size={48} />
              <View style={{ flex: 1, minWidth: 0, marginLeft: 4 }}>
                <Text style={{ color: '#B3B3B3', fontSize: 12 }}>TRANSICIÓN SELECCIONADA</Text>
                <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '700' }} numberOfLines={1}>{from.title} → {to.title}</Text>
                <Text style={{ color: '#B3B3B3', fontSize: 12, fontVariant: ['tabular-nums'] }} numberOfLines={2}>
                  {tempoLabel(fromTempo, !!from.audioPath && !(from.audioPath in tempoByPath))} → {tempoLabel(toTempo, !!to.audioPath && !(to.audioPath in tempoByPath))}
                </Text>
                {tempoDifference !== null ? <Text style={{ color: '#B3B3B3', fontSize: 12, fontVariant: ['tabular-nums'] }}>
                  Δ {approximateComparison ? '≈ ' : ''}{tempoDifference} BPM{approximateComparison
                    ? possibleHalfTime ? ' · estimado; mitad/doble tiempo posible' : ' · orientativo; no indica sincronía de pulsos'
                    : tempoDifference >= 12 ? ' · escuchá el cruce' : ''}
                </Text> : null}
              </View>
            </View>
            <Text style={{ color: '#B3B3B3', fontSize: 13, paddingHorizontal: 4, lineHeight: 19 }}>
              {desktop ? 'Arrastrá cada onda bajo el recuadro fijo para elegir el cruce. La línea blanca sigue la preescucha.'
                : 'Arrastrá las ondas para elegir el cruce.'}
            </Text>
            <GrupoAjustes pie="En Controles avanzados podés ajustar los puntos con deslizadores.">
              {dirty ? <Text style={{ color: '#B3B3B3', fontSize: 13, paddingHorizontal: 16, paddingTop: 10 }}>
                Cambios sin guardar en este par
              </Text> : null}
              {desktop ? <MixPairPreview key={`${editing.id}:${pairKey}:${from.durationMs}:${to.durationMs}`}
                from={from} to={to} draft={previewDraft ?? draft}
                profile={previewProfile} onPosition={updatePreviewPositions} /> : null}
              <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
                <MixCurveTabs available={['volume', 'eq', 'filter']} active={activeCurveView} onChange={setCurveView} />
              </View>
              <View style={{ paddingHorizontal: 16, gap: 7 }}>
                <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>Salida · {from.title}</Text>
                {outPeaks.length ? <Waveform peaks={outPeaks} bands={outBands} durationMs={fromDuration} windowMs={Math.min(draft.durationMs, fromDuration)}
                    beatMs={fromAnalysis?.rhythm?.beatMs} barMs={fromAnalysis?.rhythm?.barMs}
                    startMs={fromCue} positionMs={outgoingPosition} height={desktop ? 132 : 76} zoomed compact={!desktop}
                    detailPeaks={fromDetailPeaks} editable={canEditMix} label={`Salida, ${from.title}`}
                    overlay={<MixAutomationCurve draft={previewDraft ?? draft} deck="out" view={activeCurveView} />}
                    onChangeStart={value => { if (canEditMix) setDraft(previous => previous ? { ...previous, fromCueMs: value } : previous) }} />
                  : <View style={{ height: desktop ? 132 : 88, borderRadius: 10, backgroundColor: '#242424', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }}>
                    {!currentAnalysis ? <ActivityIndicator color="#B3B3B3" />
                      : <Text style={{ color: '#B3B3B3', fontSize: 13, textAlign: 'center' }}>{currentAnalysis.fromError ?? 'Onda no disponible para esta canción.'}</Text>}
                  </View>}
              </View>
              <View style={{ paddingHorizontal: 16, gap: 7 }}>
                <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>Entrada · {to.title}</Text>
                {inPeaks.length ? <Waveform peaks={inPeaks} bands={inBands} durationMs={toDuration} windowMs={Math.min(draft.durationMs, toDuration)}
                    beatMs={toAnalysis?.rhythm?.beatMs} barMs={toAnalysis?.rhythm?.barMs}
                    startMs={toCue} positionMs={incomingPosition} height={desktop ? 132 : 76} zoomed compact={!desktop}
                    detailPeaks={toDetailPeaks} editable={canEditMix} label={`Entrada, ${to.title}`}
                    overlay={<MixAutomationCurve draft={previewDraft ?? draft} deck="in" view={activeCurveView} />}
                    onChangeStart={value => { if (canEditMix) setDraft(previous => previous ? { ...previous, toCueMs: value } : previous) }} />
                  : <View style={{ height: desktop ? 132 : 88, borderRadius: 10, backgroundColor: '#242424', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }}>
                    {!currentAnalysis ? <ActivityIndicator color="#B3B3B3" />
                      : <Text style={{ color: '#B3B3B3', fontSize: 13, textAlign: 'center' }}>{currentAnalysis.toError ?? 'Onda no disponible para esta canción.'}</Text>}
                  </View>}
              </View>
              {!desktop ? <MixPairPreview key={`${editing.id}:${pairKey}:${from.durationMs}:${to.durationMs}`}
                from={from} to={to} draft={previewDraft ?? draft}
                profile={previewProfile} onPosition={updatePreviewPositions} /> : null}
              <MixEffectsQuickControls draft={draft} onChange={next => setDraft(() => next)}
                canEdit={canEditMix && !busy} />
              {draft.preset !== 'none' ? <View style={{ gap: 4, paddingHorizontal: 16 }}>
                <BotonSuperficie accessibilityRole="button" accessibilityState={{ expanded: showCurveEditor }}
                  accessibilityLabel={`${showCurveEditor ? 'Ocultar' : 'Mostrar'} editor de trazas personalizadas`}
                  onPress={() => setShowCurveEditor(open => !open)}
                  style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: 12, backgroundColor: '#303030',
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '600' }}>Personalizar trazas</Text>
                  <IconChevronDown size={16} color={ICON_COLOR.muted} />
                </BotonSuperficie>
                {showCurveEditor ? desktop ? <View style={{ flexDirection: 'row', gap: 12 }}>
                  {(['out', 'in'] as const).map(deck => <View key={deck}
                    style={{ flex: 1, minWidth: 0, borderRadius: 12, backgroundColor: '#242424' }}>
                    <MixAutomationEditor draft={draft} deck={deck} view={activeCurveView}
                      onChange={next => setDraft(() => next)} canEdit={canEditMix && !busy}
                      onGestureStart={beginCurveGesture} onGestureEnd={endCurveGesture} />
                  </View>)}
                </View> : <View style={{ gap: 8 }}>
                  <MixDeckTabs active={curveDeck} onChange={setCurveDeck} />
                  <View style={{ borderRadius: 12, backgroundColor: '#242424' }}>
                    <MixAutomationEditor draft={draft} deck={curveDeck} view={activeCurveView}
                      onChange={next => setDraft(() => next)} canEdit={canEditMix && !busy}
                      onGestureStart={beginCurveGesture} onGestureEnd={endCurveGesture} />
                  </View>
                </View> : null}
              </View> : null}
              {currentAnalysis && (!outPeaks.length || !inPeaks.length) ? <View style={{ paddingHorizontal: 16, paddingTop: 4, maxWidth: 280 }}>
                <GhostButton label="Reintentar ondas" onPress={() => { setPairAnalysis(null); setAnalysisRetry(value => value + 1) }} />
              </View> : null}
              {outPeaks.length && inPeaks.length && draft.preset !== 'none' ? <Text style={{ color: '#B3B3B3', fontSize: 12, paddingHorizontal: 16 }}>
                {compareOriginal ? 'Comparación activa: escuchás las canciones sin cruce ni efectos de transición.'
                  : activeCurveView === 'volume' ? 'Celeste: ganancia relativa de salida y entrada durante el cruce.'
                    : activeCurveView === 'eq' ? draft.eqSettings?.enabled
                      ? 'Amarillo: graves · verde: medios · violeta: agudos. 0 dB queda al centro.'
                      : 'Elegí un preset de ecualizador del cruce para ver sus curvas.'
                      : draft.filterSettings?.enabled
                        ? 'Violeta: frecuencia de corte del filtro. Abajo 20 Hz; arriba 20 kHz.'
                        : 'Elegí un filtro del cruce para ver su curva.'}
              </Text> : null}
              <View style={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}>
                <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>Preajustes de transición</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {PRESETS.map(item => <Pressable key={item.value} accessibilityRole="button"
                    accessibilityState={{ selected: draft.preset === item.value, disabled: !canEditMix || busy }}
                    accessibilityLabel={`Transición ${item.label}`}
                    disabled={!canEditMix || busy}
                    onPress={() => setDraft(previous => previous ? { ...previous, preset: item.value,
                      volumeLaw: item.value === 'fade' ? 'linear' : 'equal_power',
                      volumeOut: item.value === 'custom' ? previous.volumeOut ?? midpointCurve(true, Math.SQRT1_2) : null,
                      volumeIn: item.value === 'custom' ? previous.volumeIn ?? midpointCurve(false, Math.SQRT1_2) : null,
                    } : previous)}
                    style={{ minHeight: 44, paddingHorizontal: 15, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: draft.preset === item.value ? '#FFFFFF' : '#303030', opacity: canEditMix && !busy ? 1 : 0.55 }}>
                    <Text style={{ color: draft.preset === item.value ? '#121212' : '#FFFFFF', fontWeight: '600' }}>{item.label}</Text>
                  </Pressable>)}
                </ScrollView>
                <Text style={{ color: '#B3B3B3', fontSize: 13 }}>{PRESETS.find(item => item.value === draft.preset)?.detail}</Text>
              </View>
              {draft.preset !== 'none' ? <NumberControl label="Duración del cruce" value={draft.durationMs}
                max={Math.min(30_000, from.durationMs, to.durationMs)} disabled={!canEditMix}
                onChange={value => setDraft(previous => {
                  if (!previous) return previous
                  const durationMs = Math.min(Math.max(250, value), from.durationMs, to.durationMs)
                  return {
                    ...previous, durationMs,
                    fromCueMs: previous.fromCueMs === null ? null
                      : Math.min(previous.fromCueMs, Math.max(0, from.durationMs - durationMs)),
                    toCueMs: previous.toCueMs === null ? null
                      : Math.min(previous.toCueMs, Math.max(0, to.durationMs - durationMs)),
                  }
                })} /> : null}
              {barSuggestions.length && draft.preset !== 'none' ? <View style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}>
                <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>Duración por compases</Text>
                <Text style={{ color: '#B3B3B3', fontSize: 13 }}>Usa marcas 4/4 medidas en ambas canciones. Si un valor no aparece, no hay una unión fiable de esa longitud.</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {barSuggestions.map(suggested => {
                    const selected = Math.abs(draft.durationMs - suggested.durationMs) <= 50 &&
                      draft.fromCueMs === suggested.fromCueMs && draft.toCueMs === suggested.toCueMs
                    return <BotonSuperficie key={suggested.bars} accessibilityRole="button"
                      accessibilityLabel={`${suggested.bars} ${suggested.bars === 1 ? 'compás' : 'compases'}, ${seconds(suggested.durationMs)}`}
                      disabled={!canEditMix || busy}
                      onPress={() => setDraft(previous => previous ? {
                        ...previous, durationMs: suggested.durationMs,
                        fromCueMs: suggested.fromCueMs, toCueMs: suggested.toCueMs,
                      } : previous)}
                      style={{ minHeight: 44, minWidth: 75, alignItems: 'center', justifyContent: 'center',
                        paddingHorizontal: 12, borderRadius: 10, backgroundColor: selected ? '#FFFFFF' : '#303030' }}>
                      <Text style={{ color: selected ? '#121212' : '#FFFFFF', fontWeight: '600' }}>
                        {suggested.bars} {suggested.bars === 1 ? 'barra' : 'barras'}
                      </Text>
                    </BotonSuperficie>
                  })}
                </View>
              </View> : null}
              {autoSuggestion && canEditMix ? <FilaAccion rotulo="Aplicar sugerencia Auto" onPress={() => setDraft(previous => previous ? {
                ...previous, preset: 'auto', durationMs: autoSuggestion.durationMs,
                fromCueMs: autoSuggestion.fromCueMs, toCueMs: autoSuggestion.toCueMs,
                volumeLaw: 'equal_power', volumeOut: null, volumeIn: null,
              } : previous)} disabled={busy} /> : null}
              <FilaInterruptor rotulo="Comparar sin transición" detalle="Escuchá el final y el comienzo originales, conservando tu EQ musical"
                activo={compareOriginal} onCambiar={enabled => { if (draftKey) setOriginalComparison({ key: draftKey, enabled }) }}
                disabled={draft.preset === 'none'} />
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: showAdvanced }}
                accessibilityLabel={`${showAdvanced ? 'Ocultar' : 'Mostrar'} controles avanzados de esta transición`}
                onPress={() => setShowAdvanced(value => !value)}
                style={{ minHeight: 48, marginHorizontal: 16, marginTop: 8, paddingHorizontal: 14,
                  borderRadius: 10, backgroundColor: '#303030', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>Controles avanzados</Text>
                <Text style={{ color: '#B3B3B3', fontSize: 19 }}>{showAdvanced ? '⌃' : '⌄'}</Text>
              </Pressable>
              {showAdvanced ? <View style={{ gap: 2 }}>
              {canEditMix ? <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}>
                <BotonSuperficie accessibilityRole="button" accessibilityLabel="Deshacer cambio de transición" onPress={undoDraft}
                  disabled={!draftHistory?.past.length || busy}
                  style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10,
                    backgroundColor: '#303030', opacity: draftHistory?.past.length ? 1 : 0.45 }}>
                  <Text style={{ color: '#FFFFFF' }}>Deshacer</Text>
                </BotonSuperficie>
                <BotonSuperficie accessibilityRole="button" accessibilityLabel="Rehacer cambio de transición" onPress={redoDraft}
                  disabled={!draftHistory?.future.length || busy}
                  style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10,
                    backgroundColor: '#303030', opacity: draftHistory?.future.length ? 1 : 0.45 }}>
                  <Text style={{ color: '#FFFFFF' }}>Rehacer</Text>
                </BotonSuperficie>
              </View> : null}
              <View style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 10 }}>
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Análisis de las canciones</Text>
                {!currentAnalysis || currentAnalysis.loading ? <ActivityIndicator color="#B3B3B3" /> : <>
                  <AnalysisSummary title={`Salida · ${from.title}`} analysis={fromAnalysis} error={currentAnalysis.fromError} />
                  <AnalysisSummary title={`Entrada · ${to.title}`} analysis={toAnalysis} error={currentAnalysis.toError} />
                  {autoSuggestion ? <Text style={{ color: '#B3B3B3', fontSize: 13 }}>
                    Auto sugerido: {autoSuggestion.beats} pulsos · {seconds(autoSuggestion.durationMs)} · salida {seconds(autoSuggestion.fromCueMs)} · entrada {seconds(autoSuggestion.toCueMs)}
                    {autoSuggestion.alignment === 'bars' ? ' · compases alineados' : ' · beats alineados'}
                  </Text> : <Text style={{ color: '#B3B3B3', fontSize: 13 }}>
                    Sin sugerencia a compás fiable para este par. Ajustá los puntos manualmente.
                  </Text>}
                </>}
              </View>
              <NumberControl label="Salida desde" value={draft.fromCueMs ?? Math.max(0, from.durationMs - draft.durationMs)}
                max={Math.max(0, from.durationMs - draft.durationMs)} disabled={!canEditMix}
                onChange={value => setDraft(previous => previous ? { ...previous, fromCueMs: value } : previous)} />
              <NumberControl label="Entrada desde" value={draft.toCueMs ?? 0} max={Math.max(0, to.durationMs - draft.durationMs)} disabled={!canEditMix}
                onChange={value => setDraft(previous => previous ? { ...previous, toCueMs: value } : previous)} />
              <FilaOpciones<'linear' | 'equal_power'> rotulo="Curva de volumen" valor={draft.volumeLaw}
                opciones={[{ value: 'linear', label: 'Lineal' }, { value: 'equal_power', label: 'Potencia constante' }]}
                onElegir={volumeLaw => setDraft(previous => previous ? { ...previous, volumeLaw } : previous)}
                disabled={!canEditMix || busy || draft.preset === 'custom'} />
              {draft.preset === 'custom' ? <View style={{ gap: 4 }}>
                <Text style={{ color: '#B3B3B3', fontSize: 13, paddingHorizontal: 16 }}>
                  Dibujá la curva de cada canción en tres puntos del cruce. La salida va de 100 % a 0 % y la entrada de 0 % a 100 %.
                </Text>
                <FilaOpciones<'out' | 'in'> rotulo="Canción" valor={volumeDeck}
                  opciones={[{ value: 'out', label: 'Salida' }, { value: 'in', label: 'Entrada' }]}
                  onElegir={setVolumeDeck} />
                {([0.25, 0.5, 0.75] as const).map(position => {
                  const outgoing = volumeDeck === 'out'
                  const key = outgoing ? 'volumeOut' : 'volumeIn'
                  const fallback = outgoing ? Math.cos(position * Math.PI / 2) : Math.sin(position * Math.PI / 2)
                  return <NumberControl key={`${volumeDeck}:${position}`}
                    label={`${Math.round(position * 100)} % del cruce`}
                    value={Math.round(volumeAt(draft[key], position, fallback) * 1000)}
                    max={1000} step={10} format={value => `${Math.round(value / 10)} %`} disabled={!canEditMix}
                    onChange={value => setDraft(previous => previous ? {
                      ...previous, [key]: withVolumePoint(previous[key], outgoing, position, value / 1000),
                    } : previous)} />
                })}
              </View> : null}
              <MixEffectsEditor draft={draft}
                onChange={next => setDraft(() => next)} canEdit={canEditMix && !busy}
                supported={Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web'} />
              {canEditMix && edge ? <FilaAccion rotulo="Usar preset general en este par" onPress={resetEdge} disabled={busy} ultima /> : null}
              </View> : null}
            </GrupoAjustes></> : null}
          </View> : <Text style={{ color: '#B3B3B3' }}>Agregá al menos dos canciones para crear transiciones.</Text>}
          <GrupoAjustes titulo={`EDITANDO «${editing.name.toUpperCase()}»`} pie={canEditMix ? 'Cada cambio se guarda para esta versión. El mix publicado solo lo cambia quien creó la playlist.' : 'Podés escuchar esta versión o duplicarla para editarla.'}>
            <FilaOpciones<MixPreset> rotulo="Preset general" valor={editing.defaultPreset}
              opciones={PRESETS.map(item => ({ value: item.value, label: item.label, sfSymbol: 'slider.horizontal.3' as const }))}
              onElegir={value => { if (canEditMix) void run(() => updatePlaylistMix(editing, { defaultPreset: value })) }} disabled={!canEditMix || busy} />
            {editing.creatorId === user?.id ? <FilaOpciones<'private' | 'shared'> rotulo="Visibilidad de la versión"
              valor={editing.visibility}
              opciones={[{ value: 'private', label: 'Solo yo' }, { value: 'shared', label: 'Colaboradores' }]}
              onElegir={visibility => void run(() => updatePlaylistMix(editing, { visibility }))}
              disabled={!canEditMix || busy} /> : null}
            {canEditMix ? <NumberControl label="Duración general" value={generalDuration} max={30_000}
              onChange={value => setGeneralDurationDraft({ key: generalDurationKey!, value: Math.max(500, value) })} /> : null}
            {canEditMix ? <FilaAccion rotulo="Guardar duración general"
              onPress={() => void run(() => updatePlaylistMix(editing, { defaultDurationMs: generalDuration }))}
              disabled={busy || generalDuration === editing.defaultDurationMs} /> : null}
            {canEditMix ? <View style={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}>
              <Text style={{ color: '#B3B3B3', fontSize: 13 }}>Cambiar nombre de esta versión</Text>
              <TextInput accessibilityLabel="Nuevo nombre de esta versión" placeholder={editing.name} placeholderTextColor="#777"
                value={renameName} onChangeText={setRenameName} maxLength={60}
                style={{ borderRadius: 10, backgroundColor: '#242424', color: '#FFFFFF', paddingHorizontal: 14, minHeight: 44 }} />
              <BotonSuperficie accessibilityRole="button" accessibilityLabel="Guardar nombre de esta versión"
                onPress={() => { const name = renameName.trim(); if (name) void run(async () => { await renamePlaylistMix(editing, name); setRenameName('') }) }}
                disabled={!renameName.trim() || busy}
                style={{ minHeight: 44, borderRadius: 10, backgroundColor: '#303030', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>Guardar nombre</Text>
              </BotonSuperficie>
            </View> : null}
            {canEditPlaylist ? <FilaAccion rotulo="Duplicar versión" onPress={duplicate} disabled={busy} /> : null}
            {canPublish ? <FilaInterruptor rotulo="Publicar esta versión" activo={editing.published}
              onCambiar={value => void run(() => publishPlaylistMix(id!, value ? editing.id : null, value))} disabled={busy} /> : null}
            {canPublish && publishedMix ? <FilaInterruptor rotulo="Mix activo en la playlist" activo={publishedMix.enabled}
              onCambiar={value => void run(() => publishPlaylistMix(id!, publishedMix.id, value))} disabled={busy} /> : null}
            {canEditMix ? <FilaAccion rotulo={confirmDelete ? 'Confirmar eliminación' : 'Eliminar esta versión'} onPress={() => {
              if (!confirmDelete) setConfirmDelete(true)
              else void run(async () => { await deletePlaylistMix(editing.id); setConfirmDelete(false) })
            }} disabled={busy} ultima /> : null}
          </GrupoAjustes>
          {canEditPlaylist ? <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput accessibilityLabel="Nombre del nuevo mix" placeholder="Nueva versión del mix" placeholderTextColor="#777"
              value={newMixName} onChangeText={setNewMixName} maxLength={60}
              style={{ flex: 1, borderRadius: 12, backgroundColor: '#242424', color: '#FFFFFF', paddingHorizontal: 14, minHeight: 46 }} />
            <BotonSuperficie accessibilityRole="button" accessibilityLabel="Crear nuevo mix" onPress={create} disabled={busy}
              style={{ borderRadius: 12, backgroundColor: '#FFFFFF', paddingHorizontal: 16, justifyContent: 'center' }}>
              <Text style={{ color: '#121212', fontWeight: '700' }}>Crear</Text>
            </BotonSuperficie>
          </View> : null}

        </> : null}

        <GrupoAjustes titulo="AL ESCUCHAR ESTA PLAYLIST" pie="Tu elección es personal. El mix publicado queda como opción predeterminada para las demás personas.">
          <FilaOpciones<string> rotulo="Usar mix" valor={choiceValue} opciones={options} onElegir={value => void run(() => setPlaylistMixChoice(id!, value === 'off'
            ? { mode: 'off', mixId: null } : value === 'default'
              ? { mode: 'default', mixId: null } : { mode: 'selected', mixId: value }))} ultima />
        </GrupoAjustes>

        {canEditPlaylist && (tracks?.length ?? 0) >= 3 ? <GrupoAjustes titulo="SUGERIR ORDEN POR RITMO"
          pie="Compara BPM y energía medidos. Conserva el primer tema y la posición de los que no tienen análisis fiable. La tonalidad todavía no se calcula.">
          <FilaAccion rotulo={orderProgress ? `Analizando ${orderProgress.done} de ${orderProgress.total}…` : 'Analizar y sugerir orden'}
            onPress={() => void suggestOrder()} disabled={busy || !!orderProgress} />
          {orderProgress ? <FilaAccion rotulo="Cancelar análisis" onPress={() => orderAbort.current?.abort()} /> : null}
          {orderProposal ? <View style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 10 }}>
            <Text style={{ color: '#B3B3B3', fontSize: 13 }}>
              {orderProposal.usableCount} de {orderProposal.expectedOrder.length} canciones con ritmo fiable.
              {orderProposal.changed ? ' Revisá la propuesta antes de aplicarla.' : ' No hay una mejora fiable para este orden.'}
            </Text>
            {orderProposal.changed ? <>
              <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Actual → Sugerido</Text>
              {orderProposal.expectedOrder.map((trackId, index) => {
                const proposedId = orderProposal.suggestedOrder[index]
                if (trackId === proposedId) return null
                return <View key={trackId} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ color: '#B3B3B3', width: 23, fontSize: 12 }}>{index + 1}.</Text>
                  <Text style={{ color: '#B3B3B3', flex: 1, fontSize: 12 }} numberOfLines={1}>{trackNames.get(trackId) ?? 'Canción'}</Text>
                  <Text style={{ color: '#B3B3B3' }}>→</Text>
                  <Text style={{ color: '#FFFFFF', flex: 1, fontSize: 12 }} numberOfLines={1}>{trackNames.get(proposedId) ?? 'Canción'}</Text>
                </View>
              })}
            </> : null}
          </View> : null}
          {orderProposal?.changed ? <FilaAccion rotulo="Aplicar orden sugerido" onPress={applyOrder} disabled={busy} ultima /> : null}
        </GrupoAjustes> : null}

        <GrupoAjustes titulo="SONIDO DE ESTA PLAYLIST" pie="La curva tonal publicada se suma al ecualizador personal de quien escucha. Solo modifica música reproducida desde esta playlist.">
          <FilaInterruptor rotulo="Aplicar sonido de esta playlist" detalle="Tu elección en este dispositivo"
            activo={soundPreference.enabled} onCambiar={value => { if (id) setPlaylistSoundPreference(id, value) }}
            disabled={!soundPreference.loaded} />
          {canPublish ? <FilaOpciones<string> rotulo="Preajuste tonal"
            valor={(Object.keys(PRESETS_EQ) as (keyof typeof PRESETS_EQ)[]).find(name =>
              PRESETS_EQ[name].every((gain, index) => gain === soundBands[index])) ??
              personalEq.presetsPersonales.find(item => item.ganancias.every((gain, index) => gain === soundBands[index]))?.id ?? 'custom'}
            opciones={[
              ...Object.keys(PRESETS_EQ).map(value => ({ value, label: value })),
              ...personalEq.presetsPersonales.map(item => ({ value: item.id, label: item.nombre })),
              { value: 'custom', label: 'Personalizado' },
            ]}
            onElegir={value => {
              if (value === 'custom') return
              const gains = PRESETS_EQ[value as keyof typeof PRESETS_EQ]
                ?? personalEq.presetsPersonales.find(item => item.id === value)?.ganancias
              if (gains) setSoundBands(() => [...gains])
            }} disabled={busy} /> : null}
          {canPublish && personalEq.cargado ? <FilaAccion rotulo="Copiar mi EQ personal"
            onPress={() => setSoundBands(() => [...personalEq.ganancias])} disabled={busy} /> : null}
          {soundBands.map((gain, index) => <NumberControl key={index} label={`${[31,62,125,250,500,1000,2000,4000,8000,16000][index]} Hz`}
            value={Math.round((gain + 12) * 1000)} max={24_000} disabled={!canPublish}
            format={value => `${value / 1000 - 12 >= 0 ? '+' : ''}${(value / 1000 - 12).toFixed(1)} dB`}
            onChange={value => setSoundBands(previous => previous.map((item, i) => i === index ? Math.round((value / 1000 - 12) * 10) / 10 : item))} />)}
          <NumberControl label="Preamp"
            value={Math.round((soundPreamp + 24) * 1000)} max={30_000} disabled={!canPublish}
            format={value => `${value / 1000 - 24 >= 0 ? '+' : ''}${(value / 1000 - 24).toFixed(1)} dB`}
            onChange={value => setSoundPreamp(Math.round((value / 1000 - 24) * 10) / 10)} />
          {canPublish ? <FilaAccion rotulo="Guardar curva tonal" onPress={saveSound} disabled={busy} /> : null}
          {canPublish && profile ? <FilaInterruptor rotulo="Publicar curva tonal" activo={profile.published}
            onCambiar={value => void run(() => publishPlaylistSoundProfile(id!, value))} disabled={busy} ultima /> : null}
        </GrupoAjustes>
      </ScrollView>
      </View>
      {editing && from && to && draft && canEditMix ? <View style={{
        backgroundColor: '#181818',
        paddingHorizontal: desktop ? 28 : 16, paddingTop: 12, paddingBottom: 12,
        flexDirection: 'row', alignItems: 'center', gap: 12,
      }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 13 }} numberOfLines={1}>
            {from.title} → {to.title}
          </Text>
          <Text accessibilityLiveRegion="polite" style={{ color: dirty ? '#FFFFFF' : '#B3B3B3', fontSize: 12 }} numberOfLines={1}>
            {edgeConflictKey === draftKey ? 'Otra persona editó este par' : dirty ? 'Cambios sin guardar'
              : unsavedPairs > 0 ? `${unsavedPairs} ${unsavedPairs === 1 ? 'par pendiente' : 'pares pendientes'}` : 'Sin cambios en este par'}
          </Text>
        </View>
        <View style={{ minWidth: desktop ? 230 : 170 }}>
          <PrimaryButton
            label={edgeConflictKey === draftKey ? 'Guardar en copia' : 'Guardar transición'}
            onPress={edgeConflictKey === draftKey ? saveConflictedCopy : saveEdge}
            disabled={!dirty || (draft.preset !== 'none' && draft.durationMs < 250)} busy={busy} />
        </View>
      </View> : null}
      <ConfirmarSalidaMix visible={confirmExit} canSave={dirty && canEditMix && !busy}
        onContinue={() => { setConfirmExit(false); setBlockedAction(null) }}
        onSave={() => { setConfirmExit(false); setBlockedAction(null); saveEdge() }}
        onDiscard={leave} />
    </View>
  </SafeAreaView>
}
