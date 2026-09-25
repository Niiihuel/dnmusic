import { useState } from 'react'
import { Text, View } from 'react-native'
import { FilaOpciones } from './Ajustes'
import { SeekBar } from './SeekBar'
import {
  envelopeAt, eqEffectPreset, filterEffectPreset, withEqControlPoint,
  type EqBand, type EqEffectPreset, type FilterEffectPreset,
} from '../lib/mixEffectPresets'
import type { EnvelopePoint, MixEdgeInput, TransitionFilter } from '../services/mixes'

const EQ_PRESETS: { value: EqEffectPreset; label: string }[] = [
  { value: 'none', label: 'Ninguno' },
  { value: 'bass_swap_center', label: 'Intercambio de graves central' },
  { value: 'bass_swap_late', label: 'Intercambio de graves final' },
  { value: 'bass_swap_early', label: 'Intercambio de graves inicial' },
  { value: 'three_band', label: 'Desvanecimiento de 3 bandas' },
  { value: 'bass_cut_fast', label: 'Corte de graves rápido' },
  { value: 'bass_cut_long', label: 'Corte de graves largo' },
  { value: 'bass_out', label: 'Fade out de graves' },
  { value: 'custom', label: 'Personalizar' },
]
const FILTER_PRESETS: { value: FilterEffectPreset; label: string }[] = [
  { value: 'none', label: 'Ninguno' },
  { value: 'lowpass_out', label: 'Paso bajo en salida' },
  { value: 'lowpass_in', label: 'Paso bajo en entrada' },
  { value: 'lowpass_in_out', label: 'Paso bajo en entrada y salida' },
  { value: 'lowpass_in_highpass_out', label: 'Paso bajo en entrada y paso alto en salida' },
  { value: 'highpass_out', label: 'Paso alto en salida' },
  { value: 'highpass_in', label: 'Paso alto en entrada' },
  { value: 'highpass_in_out', label: 'Paso alto en entrada y salida' },
  { value: 'highpass_in_lowpass_out', label: 'Paso alto en entrada y paso bajo en salida' },
  { value: 'custom', label: 'Personalizar' },
]
const BANDS: { value: EqBand; label: string }[] = [
  { value: 'low', label: 'Graves' }, { value: 'mid', label: 'Medios' }, { value: 'high', label: 'Agudos' },
]
const DECKS: { value: 'out' | 'in'; label: string }[] = [
  { value: 'out', label: 'Salida' }, { value: 'in', label: 'Entrada' },
]
const FILTER_KINDS: { value: 'none' | 'lowpass' | 'highpass'; label: string }[] = [
  { value: 'none', label: 'Ninguno' }, { value: 'lowpass', label: 'Paso bajo' },
  { value: 'highpass', label: 'Paso alto' },
]

function presetFor<T extends string>(
  settings: unknown,
  presets: readonly { value: T }[],
  make: (value: T) => unknown,
): T {
  const found = presets.find(({ value }) => value !== 'custom' && JSON.stringify(make(value)) === JSON.stringify(settings))
  return found?.value ?? 'custom' as T
}

function Control({ label, value, min, max, step, format, onChange, disabled }: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (value: number) => string
  onChange: (value: number) => void
  disabled: boolean
}) {
  return <View style={{ paddingHorizontal: 16, paddingVertical: 9, gap: 7, opacity: disabled ? 0.45 : 1 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
      <Text style={{ color: '#FFFFFF', fontSize: 14 }}>{label}</Text>
      <Text style={{ color: '#B3B3B3', fontSize: 13, fontVariant: ['tabular-nums'] }}>{format(value)}</Text>
    </View>
    {!disabled ? <SeekBar label={label} progress={(value - min) / (max - min)} elapsedMs={0} totalMs={1} compact
      onSeek={fraction => onChange(Math.max(min, Math.min(max, Math.round((min + fraction * (max - min)) / step) * step)))} /> : null}
  </View>
}

function cutoffFromPosition(position: number): number {
  return Math.max(20, Math.min(20_000, Math.round((20 * 1000 ** position) / 10) * 10))
}
function cutoffPosition(hz: number): number {
  return Math.max(0, Math.min(1, Math.log(Math.max(20, hz) / 20) / Math.log(1000)))
}

function withFilterKind(settings: TransitionFilter | null, deck: 'out' | 'in', kind: 'none' | 'lowpass' | 'highpass'): TransitionFilter {
  const original = settings ?? filterEffectPreset('custom')!
  return {
    ...original, enabled: true,
    [deck]: kind === 'none' ? null : { kind, cutoff: kind === 'lowpass'
      ? [{ t: 0, value: 20_000 }, { t: 1, value: 250 }]
      : [{ t: 0, value: 20 }, { t: 1, value: 5_000 }] },
  }
}

function withFilterCutoff(settings: TransitionFilter, deck: 'out' | 'in', t: 0 | 1, hz: number): TransitionFilter {
  const part = settings[deck]
  if (!part) return settings
  const cutoff: EnvelopePoint[] = part.cutoff.map(point => point.t === t ? { ...point, value: hz } : point)
  return { ...settings, [deck]: { ...part, cutoff } }
}

function customFilter(settings: TransitionFilter | null): TransitionFilter {
  const original = settings?.out || settings?.in ? settings : filterEffectPreset('lowpass_in_out')!
  const deck = original.out ? 'out' : 'in'
  const part = original[deck]!
  const t = ([0.5, 0.75, 0.125] as const).find(position => !part.cutoff.some(point => point.t === position))
  if (t === undefined || part.cutoff.length >= 16) return original
  return { ...original, [deck]: { ...part, cutoff: [
    ...part.cutoff, { t, value: envelopeAt(part.cutoff, t) },
  ].sort((a, b) => a.t - b.t) } }
}

function customEq(settings: NonNullable<MixEdgeInput['eqSettings']>): NonNullable<MixEdgeInput['eqSettings']> {
  const curve = settings.out.low
  const t = ([0.5, 0.75, 0.125] as const).find(position => !curve.some(point => point.t === position))
  if (t === undefined || curve.length >= 16) return settings
  return { ...settings, out: { ...settings.out, low: [
    ...curve, { t, value: envelopeAt(curve, t) },
  ].sort((a, b) => a.t - b.t) } }
}

/** Acceso inmediato a los efectos debajo de las ondas; los controles detallados siguen en Avanzados. */
export function MixEffectsQuickControls({ draft, onChange, canEdit }: {
  draft: MixEdgeInput
  onChange: (next: MixEdgeInput) => void
  canEdit: boolean
}) {
  const eq = draft.eqSettings ?? null
  const filter = draft.filterSettings ?? null
  const editable = canEdit && draft.preset !== 'none'
  return <View style={{ paddingVertical: 8 }}>
    <FilaOpciones<EqEffectPreset> rotulo="Ecualizador del cruce"
      valor={presetFor(eq, EQ_PRESETS, eqEffectPreset)} opciones={EQ_PRESETS}
      onElegir={value => onChange({ ...draft, eqSettings: value === 'custom' && eq
        ? customEq(eq) : eqEffectPreset(value) })} disabled={!editable} />
    <FilaOpciones<FilterEffectPreset> rotulo="Filtro del cruce"
      valor={presetFor(filter, FILTER_PRESETS, filterEffectPreset)} opciones={FILTER_PRESETS}
      onElegir={value => onChange({ ...draft, filterSettings: value === 'custom'
        ? customFilter(filter) : filterEffectPreset(value) })} disabled={!editable} />
  </View>
}

/** Automatización tonal por par, independiente del EQ musical global y del perfil de playlist. */
export function MixEffectsEditor({ draft, onChange, canEdit, supported }: {
  draft: MixEdgeInput
  onChange: (next: MixEdgeInput) => void
  canEdit: boolean
  supported: boolean
}) {
  const [eqDeck, setEqDeck] = useState<'out' | 'in'>('out')
  const [eqBand, setEqBand] = useState<EqBand>('low')
  const [filterDeck, setFilterDeck] = useState<'out' | 'in'>('out')
  const eq = draft.eqSettings ?? null
  const filter = draft.filterSettings ?? null
  const eqPreset = presetFor(eq, EQ_PRESETS, eqEffectPreset)
  const filterPreset = presetFor(filter, FILTER_PRESETS, filterEffectPreset)
  const editable = canEdit && supported && draft.preset !== 'none'
  const eqCurve = eq?.[eqDeck][eqBand]
  const filterPart = filter?.[filterDeck] ?? null

  return <View style={{ gap: 2 }}>
    <View style={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: 7 }}>
      <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Ecualizador de la transición</Text>
      <Text style={{ color: '#B3B3B3', fontSize: 13, marginTop: 3 }}>
        Automatiza graves, medios y agudos mientras se cruzan estas dos canciones.
      </Text>
      {!supported ? <Text style={{ color: '#B3B3B3', fontSize: 13, marginTop: 5 }}>
        Estos efectos requieren reproducción compatible. Podés editar la mezcla sin efectos en este dispositivo.
      </Text> : null}
    </View>
    <FilaOpciones<EqEffectPreset> rotulo="Ecualizador" valor={eqPreset} opciones={EQ_PRESETS}
      onElegir={value => onChange({ ...draft, eqSettings: value === 'custom' && eq
        ? customEq(eq)
        : eqEffectPreset(value) })}
      disabled={!editable} />
    {eq && eqPreset === 'custom' ? <>
      <FilaOpciones<'out' | 'in'> rotulo="Canción" valor={eqDeck} opciones={DECKS} onElegir={setEqDeck} />
      <FilaOpciones<EqBand> rotulo="Banda" valor={eqBand} opciones={BANDS} onElegir={setEqBand} />
      {([0, 0.5, 1] as const).map((position, index) => <Control key={position}
        label={`${['Inicio', 'Mitad', 'Final'][index]} · ${BANDS.find(item => item.value === eqBand)?.label.toLowerCase()}`}
        value={envelopeAt(eqCurve ?? [], position)} min={-24} max={24} step={0.5}
        format={value => `${value >= 0 ? '+' : ''}${value.toFixed(1)} dB`}
        onChange={value => onChange({ ...draft, eqSettings: withEqControlPoint(eq, eqDeck, eqBand, position, value) })}
        disabled={!editable} />)}
    </> : null}

    <View style={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 7 }}>
      <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Filtro de la transición</Text>
      <Text style={{ color: '#B3B3B3', fontSize: 13, marginTop: 3 }}>
        Paso bajo apaga progresivamente los agudos; paso alto recorta los graves.
      </Text>
    </View>
    <FilaOpciones<FilterEffectPreset> rotulo="Filtrar" valor={filterPreset} opciones={FILTER_PRESETS}
      onElegir={value => onChange({ ...draft, filterSettings: value === 'custom' ? customFilter(filter) : filterEffectPreset(value) })}
      disabled={!editable} />
    {filter && filterPreset === 'custom' ? <>
      <FilaOpciones<'out' | 'in'> rotulo="Canción" valor={filterDeck} opciones={DECKS} onElegir={setFilterDeck} />
      <FilaOpciones<'none' | 'lowpass' | 'highpass'> rotulo="Tipo" valor={filterPart?.kind ?? 'none'}
        opciones={FILTER_KINDS} onElegir={kind => onChange({ ...draft, filterSettings: withFilterKind(filter, filterDeck, kind) })}
        disabled={!editable} />
      {filterPart ? ([0, 1] as const).map(position => {
        const hz = envelopeAt(filterPart.cutoff, position)
        return <Control key={position} label={`Frecuencia al ${position === 0 ? 'inicio' : 'final'}`}
          value={cutoffPosition(hz)} min={0} max={1} step={0.001}
          format={() => hz < 1000 ? `${Math.round(hz)} Hz` : `${(hz / 1000).toFixed(1)} kHz`}
          onChange={value => onChange({ ...draft, filterSettings: withFilterCutoff(filter, filterDeck, position, cutoffFromPosition(value)) })}
          disabled={!editable} />
      }) : null}
    </> : null}
  </View>
}
