import { useEffect, useRef, useState } from 'react'
import { Platform, Pressable, ScrollView, Text, TextInput, View, type GestureResponderEvent } from 'react-native'
import Svg, { Circle, Line, Path } from 'react-native-svg'
import type { EnvelopePoint, MixEdgeInput } from '../services/mixes'
import { envelopeAt } from '../lib/mixEffectPresets'
import {
  curveAt, curveRange, deleteCurvePoint, insertCurvePoint, largestCurveGapMidpoint,
  moveCurvePoint, readMixCurve, unitToValue, valueToUnit, writeMixCurve,
  type MixCurveTarget,
} from '../lib/mixAutomationEdit'

const W = 320
const H = 72
const CRESCENDO_OUT = [{ t: 0, value: 1 }, { t: 0.5, value: 0.6 }, { t: 1, value: 0 }]
const CRESCENDO_IN = [{ t: 0, value: 0 }, { t: 0.5, value: 0.1 }, { t: 1, value: 1 }]
const COLORS = { low: '#FFD95A', mid: '#8EE59A', high: '#C88BFF', filter: '#C88BFF' }
export type MixCurveView = 'volume' | 'eq' | 'filter'

function level(points: { t: number; value: number }[] | null, t: number, fallback: number): number {
  if (!points?.length) return fallback
  if (t <= points[0].t) return points[0].value
  for (let i = 1; i < points.length; i++) {
    if (t > points[i].t) continue
    const before = points[i - 1]
    const after = points[i]
    const fraction = (t - before.t) / Math.max(0.0001, after.t - before.t)
    return before.value + (after.value - before.value) * fraction
  }
  return points[points.length - 1].value
}

function trace(value: (t: number) => number): string {
  return Array.from({ length: 33 }, (_, index) => {
    const t = index / 32
    const normalized = Math.max(0, Math.min(1, value(t)))
    return `${index === 0 ? 'M' : 'L'}${(t * W).toFixed(2)} ${(6 + (1 - normalized) * (H - 12)).toFixed(2)}`
  }).join(' ')
}

/** Curvas medidas del borrador, ubicadas dentro de la ventana exacta de cruce de Waveform. */
export function MixAutomationCurve({ draft, deck, view }: {
  draft: MixEdgeInput; deck: 'out' | 'in'; view: MixCurveView
}) {
  if (draft.preset === 'none') return null
  const paths: { path: string; color: string }[] = []
  if (view === 'volume') {
    const points = deck === 'out'
      ? draft.volumeOut ?? (draft.preset === 'crescendo' ? CRESCENDO_OUT : null)
      : draft.volumeIn ?? (draft.preset === 'crescendo' ? CRESCENDO_IN : null)
    paths.push({ color: '#79D6FF', path: trace(t => {
      const fallback = draft.volumeLaw === 'linear'
        ? deck === 'out' ? 1 - t : t
        : deck === 'out' ? Math.cos(t * Math.PI / 2) : Math.sin(t * Math.PI / 2)
      return level(points, t, fallback)
    }) })
  } else if (view === 'eq' && draft.eqSettings?.enabled) {
    for (const band of ['low', 'mid', 'high'] as const) {
      const points = draft.eqSettings[deck][band]
      paths.push({ color: COLORS[band], path: trace(t => (envelopeAt(points, t) + 24) / 48) })
    }
  } else if (view === 'filter' && draft.filterSettings?.enabled) {
    const part = draft.filterSettings[deck]
    if (part) paths.push({ color: COLORS.filter, path: trace(t =>
      Math.log(Math.max(20, Math.min(20_000, envelopeAt(part.cutoff, t))) / 20) / Math.log(1000),
    ) })
  }
  if (!paths.length) return null
  return <View pointerEvents="none" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}>
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      {paths.map(({ path, color }) => <Path key={color} d={path} fill="none" stroke={color} strokeWidth={2.5} />)}
    </Svg>
  </View>
}

const GRAPH_PAD_X = 19
const GRAPH_PAD_Y = 17
const BAND_LABELS = [
  { value: 'low', label: 'Graves' },
  { value: 'mid', label: 'Medios' },
  { value: 'high', label: 'Agudos' },
] as const

function graphX(t: number, width: number): number {
  return GRAPH_PAD_X + t * (width - GRAPH_PAD_X * 2)
}
function graphY(value: number, target: MixCurveTarget, height: number): number {
  return GRAPH_PAD_Y + (1 - valueToUnit(value, target)) * (height - GRAPH_PAD_Y * 2)
}
function pointFromGraph(x: number, y: number, width: number, height: number, target: MixCurveTarget) {
  const t = Math.max(0, Math.min(1, (x - GRAPH_PAD_X) / Math.max(1, width - GRAPH_PAD_X * 2)))
  const unit = 1 - (y - GRAPH_PAD_Y) / Math.max(1, height - GRAPH_PAD_Y * 2)
  return { t, value: unitToValue(unit, target) }
}
type WebPosition = { clientX?: number; clientY?: number; pageX?: number; pageY?: number }
type GraphBounds = { left: number; top: number; width: number; height: number }

/** Coordenadas del SVG respecto del gráfico, aunque el evento provenga de un círculo hijo. */
export function webGraphCoordinates(event: WebPosition, bounds: GraphBounds,
  width: number, height: number, scrollX = 0, scrollY = 0): { x: number; y: number } | null {
  const clientX = typeof event.clientX === 'number' && Number.isFinite(event.clientX)
    ? event.clientX : typeof event.pageX === 'number' ? event.pageX - scrollX : NaN
  const clientY = typeof event.clientY === 'number' && Number.isFinite(event.clientY)
    ? event.clientY : typeof event.pageY === 'number' ? event.pageY - scrollY : NaN
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY) ||
    !Number.isFinite(bounds.width) || bounds.width <= 0 ||
    !Number.isFinite(bounds.height) || bounds.height <= 0) return null
  return {
    x: (clientX - bounds.left) * width / bounds.width,
    y: (clientY - bounds.top) * height / bounds.height,
  }
}
function graphTrace(points: readonly EnvelopePoint[], target: MixCurveTarget, width: number, height: number): string {
  return points.map((point, index) =>
    `${index ? 'L' : 'M'}${graphX(point.t, width).toFixed(1)} ${graphY(point.value, target, height).toFixed(1)}`,
  ).join(' ')
}
function pointValueLabel(value: number, target: MixCurveTarget): string {
  if (target.kind === 'volume') return `${Math.round(value * 100)} %`
  if (target.kind === 'eq') return `${value >= 0 ? '+' : ''}${value.toFixed(1)} dB`
  return value < 1_000 ? `${Math.round(value)} Hz` : `${(value / 1_000).toFixed(1)} kHz`
}
function pointValueInput(value: number, target: MixCurveTarget): string {
  if (target.kind === 'volume') return String(Math.round(value * 100))
  if (target.kind === 'eq') return value.toFixed(1)
  return String(Math.round(value))
}

function PointNumericControls({ point, index, total, target, onMove, onAdjust }: {
  point: EnvelopePoint
  index: number
  total: number
  target: MixCurveTarget
  onMove: (index: number, t: number, value: number) => void
  onAdjust: (direction: -1 | 1) => void
}) {
  // null muestra el valor externo; mientras se escribe, el borrador local no
  // se reemplaza por renders del arrastre, la preescucha o el historial.
  const [timeDraft, setTimeDraft] = useState<string | null>(null)
  const [valueDraft, setValueDraft] = useState<string | null>(null)
  const timeText = timeDraft ?? (point.t * 100).toFixed(1)
  const valueText = valueDraft ?? pointValueInput(point.value, target)
  const timeInput = useRef<TextInput>(null)
  const valueInput = useRef<TextInput>(null)
  const commit = (field: 'time' | 'value') => {
    const raw = (field === 'time' ? timeText : valueText).trim().replace(',', '.')
    const numeric = raw ? Number(raw) : Number.NaN
    if (Number.isFinite(numeric)) {
      const t = field === 'time' ? numeric / 100 : point.t
      const value = field === 'value' && target.kind === 'volume' ? numeric / 100
        : field === 'value' ? numeric : point.value
      onMove(index, t, value)
    }
    if (field === 'time') setTimeDraft(null)
    else setValueDraft(null)
  }
  const internal = index > 0 && index < total - 1
  return <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
    <View style={{ gap: 5, minWidth: 100 }}>
      <Text style={{ color: '#B3B3B3', fontSize: 12 }}>Tiempo (%)</Text>
      <TextInput ref={timeInput} accessibilityLabel={`Tiempo del punto ${index + 1}, porcentaje del cruce`}
        value={timeText} onFocus={() => setTimeDraft(timeText)} onChangeText={setTimeDraft}
        onBlur={() => commit('time')} onSubmitEditing={() => timeInput.current?.blur()} editable={internal}
        keyboardType="decimal-pad" selectTextOnFocus
        style={{ minHeight: 42, color: '#FFFFFF', backgroundColor: '#292929', borderRadius: 8,
          paddingHorizontal: 10, opacity: internal ? 1 : 0.5 }} />
    </View>
    <View style={{ gap: 5, minWidth: 115 }}>
      <Text style={{ color: '#B3B3B3', fontSize: 12 }}>{target.kind === 'volume' ? 'Volumen (%)' : target.kind === 'eq' ? 'Ganancia (dB)' : 'Frecuencia (Hz)'}</Text>
      <TextInput ref={valueInput} accessibilityLabel={`Valor del punto ${index + 1}`}
        value={valueText} onFocus={() => setValueDraft(valueText)} onChangeText={setValueDraft}
        onBlur={() => commit('value')} onSubmitEditing={() => valueInput.current?.blur()}
        keyboardType={target.kind === 'eq' ? 'numbers-and-punctuation' : 'decimal-pad'} selectTextOnFocus
        style={{ minHeight: 42, color: '#FFFFFF', backgroundColor: '#292929', borderRadius: 8, paddingHorizontal: 10 }} />
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="Disminuir valor del punto"
      onPress={() => onAdjust(-1)} style={{ minWidth: 42, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#363636' }}>
      <Text style={{ color: '#FFFFFF', fontSize: 19 }}>−</Text>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Aumentar valor del punto"
      onPress={() => onAdjust(1)} style={{ minWidth: 42, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#363636' }}>
      <Text style={{ color: '#FFFFFF', fontSize: 19 }}>+</Text>
    </Pressable>
  </View>
}

/** Editor gestual de las mismas curvas que usan la preescucha y la reproducción. */
export function MixAutomationEditor({ draft, deck, view, onChange, canEdit,
  onGestureStart, onGestureEnd, height = 184 }: {
  draft: MixEdgeInput
  deck: 'out' | 'in'
  view: MixCurveView
  onChange: (next: MixEdgeInput) => void
  canEdit: boolean
  /** Una vez, antes de publicar el primer cambio de un arrastre real. */
  onGestureStart?: () => void
  /** Una vez al soltar, cancelar o desmontar un arrastre iniciado. */
  onGestureEnd?: () => void
  height?: number
}) {
  const [width, setWidth] = useState(320)
  const [band, setBand] = useState<'low' | 'mid' | 'high'>('low')
  const [selection, setSelection] = useState({ key: '', index: 0 })
  const target: MixCurveTarget = view === 'eq' ? { kind: 'eq', deck, band }
    : view === 'filter' ? { kind: 'filter', deck } : { kind: 'volume', deck }
  const targetKey = `${view}:${deck}:${band}`
  const points = readMixCurve(draft, target)
  const selectedIndex = points ? Math.max(0, Math.min(selection.key === targetKey ? selection.index : 0, points.length - 1)) : 0
  const selected = points?.[selectedIndex]
  const { min, max } = curveRange(target)
  const editable = canEdit && draft.preset !== 'none' && !!points
  const color = target.kind === 'eq' ? COLORS[band] : target.kind === 'filter' ? COLORS.filter : '#79D6FF'
  const draftRef = useRef(draft)
  const pointsRef = useRef(points)
  const graphRef = useRef<View>(null)
  const gestureEndRef = useRef(onGestureEnd)
  const dragRef = useRef<{ index: number; x: number; y: number; moved: boolean; started: boolean; key: string } | null>(null)

  useEffect(() => {
    draftRef.current = draft
    pointsRef.current = points
  }, [draft, points])
  useEffect(() => { gestureEndRef.current = onGestureEnd }, [onGestureEnd])
  useEffect(() => () => {
    const drag = dragRef.current
    dragRef.current = null
    if (drag?.started) gestureEndRef.current?.()
  }, [targetKey])
  useEffect(() => {
    if (editable) return
    const drag = dragRef.current
    dragRef.current = null
    if (drag?.started) gestureEndRef.current?.()
  }, [editable])
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return
    // RN Web usa el Responder System para mouse. Un mouseup fuera del gráfico
    // o perder foco no debe dejar abierto el grupo de undo.
    const finishOutside = () => {
      const drag = dragRef.current
      dragRef.current = null
      if (drag?.started) gestureEndRef.current?.()
    }
    window.addEventListener('mouseup', finishOutside)
    window.addEventListener('blur', finishOutside)
    return () => {
      window.removeEventListener('mouseup', finishOutside)
      window.removeEventListener('blur', finishOutside)
    }
  }, [])

  const publish = (nextPoints: EnvelopePoint[]) => {
    const next = writeMixCurve(draftRef.current, target, nextPoints)
    pointsRef.current = nextPoints
    draftRef.current = next
    onChange(next)
  }
  const move = (index: number, t: number, value: number, beforePublish?: () => void) => {
    const current = pointsRef.current
    if (!current) return
    const next = moveCurvePoint(current, index, t, value, min, max)
    if (next[index]?.t !== current[index]?.t || next[index]?.value !== current[index]?.value) {
      beforePublish?.()
      publish(next)
    }
  }
  const add = (t: number, value: number) => {
    const current = pointsRef.current
    if (!current) return
    const next = insertCurvePoint(current, t, value, min, max)
    if (next.length === current.length) return
    publish(next)
    setSelection({ key: targetKey, index: next.findIndex(point => point.t === Number(t.toFixed(3))) })
  }
  const nearest = (x: number, y: number): number => {
    const current = pointsRef.current
    if (!current) return -1
    let index = -1, distance = 26
    current.forEach((point, candidate) => {
      const delta = Math.hypot(graphX(point.t, width) - x, graphY(point.value, target, height) - y)
      if (delta < distance) { distance = delta; index = candidate }
    })
    return index
  }
  const touch = (event: GestureResponderEvent): { x: number; y: number } | null => {
    if (Platform.OS !== 'web') return {
      x: event.nativeEvent.locationX, y: event.nativeEvent.locationY,
    }
    const graph = graphRef.current as unknown as { getBoundingClientRect?: () => GraphBounds } | null
    const bounds = graph?.getBoundingClientRect?.()
    if (!bounds || typeof window === 'undefined') return null
    // RN Web puede expresar locationX/Y respecto del Circle que inició el
    // responder. pageX/Y son globales y se convierten respecto del View gráfico.
    return webGraphCoordinates(event.nativeEvent, bounds, width, height, window.scrollX, window.scrollY)
  }
  const onGrant = (event: GestureResponderEvent) => {
    if (Platform.OS === 'web') event.preventDefault()
    const position = touch(event)
    if (!position) return
    const { x, y } = position
    const index = nearest(x, y)
    dragRef.current = { index, x, y, moved: false, started: false, key: targetKey }
    if (index >= 0) setSelection({ key: targetKey, index })
  }
  const onMove = (event: GestureResponderEvent) => {
    const drag = dragRef.current
    if (!drag || drag.key !== targetKey) return
    const position = touch(event)
    if (!position) return
    const { x, y } = position
    if (Math.hypot(x - drag.x, y - drag.y) > 3) drag.moved = true
    if (drag.index < 0 || !drag.moved) return
    const point = pointFromGraph(x, y, width, height, target)
    move(drag.index, point.t, point.value, drag.started ? undefined : () => {
      drag.started = true
      onGestureStart?.()
    })
  }
  const onRelease = (event: GestureResponderEvent) => {
    const drag = dragRef.current
    if (!drag) return
    if (drag.index >= 0 && drag.key === targetKey) onMove(event)
    dragRef.current = null
    if (drag.started) gestureEndRef.current?.()
    if (drag.key !== targetKey || drag.index >= 0 || drag.moved) return
    const position = touch(event)
    if (!position) return
    const { x, y } = position
    const point = pointFromGraph(x, y, width, height, target)
    add(point.t, point.value)
  }
  const addAtGap = () => {
    const current = pointsRef.current
    const t = current && largestCurveGapMidpoint(current)
    if (t === null || t === undefined || !current) return
    add(t, curveAt(current, t))
  }
  const removeSelected = () => {
    const current = pointsRef.current
    if (!current) return
    const next = deleteCurvePoint(current, selectedIndex)
    if (next.length === current.length) return
    publish(next)
    setSelection({ key: targetKey, index: Math.min(selectedIndex, next.length - 1) })
  }
  const adjustValue = (direction: -1 | 1) => {
    const point = pointsRef.current?.[selectedIndex]
    if (!point) return
    const nextValue = target.kind === 'filter'
      ? unitToValue(valueToUnit(point.value, target) + direction * 0.025, target)
      : point.value + direction * (target.kind === 'volume' ? 0.01 : 0.5)
    move(selectedIndex, point.t, nextValue)
  }
  const otherEqPaths = view === 'eq' && draft.eqSettings?.enabled
    ? BAND_LABELS.filter(item => item.value !== band).map(item => ({
      key: item.value, color: COLORS[item.value],
      points: readMixCurve(draft, { kind: 'eq', deck, band: item.value }),
    })) : []
  const canAdd = editable && !!points && points.length < 16
  const canRemove = editable && !!points && selectedIndex > 0 && selectedIndex < points.length - 1
  const deckLabel = deck === 'out' ? 'salida' : 'entrada'
  const targetLabel = view === 'volume' ? 'volumen' : view === 'eq' ? `EQ de ${BAND_LABELS.find(item => item.value === band)?.label.toLowerCase()}` : 'filtro'

  return <View style={{ gap: 10, paddingHorizontal: 16, paddingVertical: 14 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700' }}>Curva de {targetLabel} · {deckLabel}</Text>
      {points ? <Text style={{ color: '#B3B3B3', fontSize: 12 }}>{points.length}/16 puntos</Text> : null}
    </View>
    {view === 'eq' && draft.eqSettings?.enabled ? <View style={{ flexDirection: 'row', gap: 6 }}>
      {BAND_LABELS.map(item => <Pressable key={item.value} accessibilityRole="button"
        accessibilityState={{ selected: band === item.value }}
        accessibilityLabel={`Editar ${item.label.toLowerCase()} de ${deckLabel}`}
        onPress={() => setBand(item.value)}
        style={{ paddingVertical: 8, paddingHorizontal: 10, minHeight: 40, borderRadius: 8,
          backgroundColor: band === item.value ? '#484848' : '#282828' }}>
        <Text style={{ color: band === item.value ? COLORS[item.value] : '#D0D0D0', fontSize: 12, fontWeight: '600' }}>{item.label}</Text>
      </Pressable>)}
    </View> : null}
    {!points ? <Text style={{ color: '#B3B3B3', fontSize: 13 }}>
      {view === 'filter' ? 'Elegí un filtro para esta canción y después editá su frecuencia.'
        : view === 'eq' ? 'Activá el ecualizador de la transición para editar las bandas.'
          : 'Activá una transición para editar el volumen.'}
    </Text> : <>
      <View ref={graphRef} onLayout={event => setWidth(Math.max(120, event.nativeEvent.layout.width))}
        onStartShouldSetResponder={() => editable}
        onMoveShouldSetResponder={() => editable}
        onResponderGrant={onGrant} onResponderMove={onMove}
        onResponderRelease={onRelease} onResponderTerminate={() => {
          const drag = dragRef.current
          dragRef.current = null
          if (drag?.started) gestureEndRef.current?.()
        }}
        onResponderTerminationRequest={() => false}
        accessible={editable} accessibilityRole="adjustable"
        accessibilityLabel={`Curva de ${targetLabel} de ${deckLabel}. Toca el gráfico para añadir un punto y arrastra para moverlo.`}
        accessibilityValue={selected ? { text: `Punto ${Math.min(selectedIndex, points.length - 1) + 1} de ${points.length}, ${Math.round(selected.t * 100)} por ciento del cruce, ${pointValueLabel(selected.value, target)}` } : undefined}
        accessibilityActions={editable ? [{ name: 'increment', label: 'Aumentar valor' }, { name: 'decrement', label: 'Disminuir valor' }] : undefined}
        onAccessibilityAction={event => {
          if (event.nativeEvent.actionName === 'increment') adjustValue(1)
          if (event.nativeEvent.actionName === 'decrement') adjustValue(-1)
        }}
        style={[{ height, backgroundColor: '#1D1D1F', borderRadius: 12, borderWidth: 1, borderColor: '#3B3B3B', overflow: 'hidden' },
          Platform.OS === 'web' ? ({ cursor: editable ? 'crosshair' : 'default', touchAction: 'none', userSelect: 'none' } as object) : null]}>
        <Svg pointerEvents="none" width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
          {[0, 0.5, 1].map(fraction => <Line key={`h${fraction}`} x1={GRAPH_PAD_X} x2={width - GRAPH_PAD_X}
            y1={GRAPH_PAD_Y + fraction * (height - GRAPH_PAD_Y * 2)} y2={GRAPH_PAD_Y + fraction * (height - GRAPH_PAD_Y * 2)}
            stroke={fraction === 0.5 ? '#4B4B4B' : '#323232'} strokeWidth={1} strokeDasharray={fraction === 0.5 ? '4 4' : undefined} />)}
          {[0, 0.5, 1].map(fraction => <Line key={`v${fraction}`} y1={GRAPH_PAD_Y} y2={height - GRAPH_PAD_Y}
            x1={graphX(fraction, width)} x2={graphX(fraction, width)} stroke="#323232" strokeWidth={1} />)}
          {otherEqPaths.map(item => item.points ? <Path key={item.key} d={graphTrace(item.points, { kind: 'eq', deck, band: item.key }, width, height)}
            fill="none" stroke={item.color} strokeWidth={2} opacity={0.38} /> : null)}
          <Path d={graphTrace(points, target, width, height)} fill="none" stroke={color} strokeWidth={3} />
          {points.map((point, index) => <Circle key={`${index}:${point.t}`} cx={graphX(point.t, width)} cy={graphY(point.value, target, height)}
            r={index === selectedIndex ? 7 : 5} fill={index === selectedIndex ? '#FFFFFF' : color}
            stroke={color} strokeWidth={index === selectedIndex ? 2 : 1} />)}
        </Svg>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: '#B3B3B3', fontSize: 11 }}>Inicio</Text>
        <Text style={{ color: '#B3B3B3', fontSize: 11 }}>Mitad</Text>
        <Text style={{ color: '#B3B3B3', fontSize: 11 }}>Final</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {points.map((point, index) => <Pressable key={`${index}:${point.t}`} accessibilityRole="button"
          accessibilityState={{ selected: index === selectedIndex }}
          accessibilityLabel={`Punto ${index + 1}, ${Math.round(point.t * 100)} por ciento del cruce, ${pointValueLabel(point.value, target)}`}
          onPress={() => setSelection({ key: targetKey, index })}
          style={{ minHeight: 38, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 8,
            backgroundColor: index === selectedIndex ? '#4A4A4A' : '#292929' }}>
          <Text style={{ color: index === selectedIndex ? '#FFFFFF' : '#C7C7C7', fontSize: 12, fontVariant: ['tabular-nums'] }}>
            {Math.round(point.t * 100)}% · {pointValueLabel(point.value, target)}
          </Text>
        </Pressable>)}
      </ScrollView>
      {editable ? <>
        <Text style={{ color: '#B3B3B3', fontSize: 12 }}>Tocá el gráfico para añadir un punto; arrastrá cualquier punto para moverlo.</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Añadir punto a la curva"
            accessibilityState={{ disabled: !canAdd }} disabled={!canAdd} onPress={addAtGap}
            style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 8,
              backgroundColor: '#363636', opacity: canAdd ? 1 : 0.45 }}>
            <Text style={{ color: '#FFFFFF', fontSize: 13 }}>+ Añadir punto</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Eliminar punto seleccionado"
            accessibilityState={{ disabled: !canRemove }} disabled={!canRemove} onPress={removeSelected}
            style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 8,
              backgroundColor: '#363636', opacity: canRemove ? 1 : 0.45 }}>
            <Text style={{ color: '#FFFFFF', fontSize: 13 }}>Eliminar punto</Text>
          </Pressable>
        </View>
        {selected ? <PointNumericControls key={`${targetKey}:${selectedIndex}`}
          point={selected} index={selectedIndex} total={points.length} target={target}
          onMove={move} onAdjust={adjustValue} /> : null}
      </> : <Text style={{ color: '#B3B3B3', fontSize: 12 }}>Esta curva es de solo lectura.</Text>}
    </>}
  </View>
}
