import { useState } from 'react'
import type { CSSProperties } from 'react'
import type { AudioParameterProps } from './AudioParameter.types'
import { parameterEntry, parameterFromPosition, parameterPosition } from './audioParameterValue'
import { useAudioParameter } from './useAudioParameter'

const numericStyle: CSSProperties = { width: 78, minHeight: 38, padding: '4px 8px', border: 0,
  borderRadius: 8, background: '#303030', color: '#FFFFFF', font: 'inherit', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
const buttonStyle: CSSProperties = { minHeight: 38, padding: '4px 12px', border: 0, borderRadius: 20,
  background: '#303030', color: '#B3B3B3', font: 'inherit', cursor: 'pointer' }

export function AudioParameter(props: AudioParameterProps) {
  const control = useAudioParameter(props)
  const [entry, setEntry] = useState<{ text: string; value: number } | null>(null)
  const logarithmic = props.scale === 'log'
  const inputScale = props.inputScale ?? 1
  const saveEntry = () => {
    if (entry === null) return
    // A remote volume update or a new cue must not receive an old draft.
    if (entry.value !== props.value) { setEntry(null); return }
    const value = parameterEntry(entry.text, inputScale)
    if (value !== null) control.commit(value)
    setEntry(null)
  }
  return <div className="dn-audio-parameter" role="group" aria-label={props.label}
    style={{ display: 'flex', flexDirection: 'column', gap: 6, opacity: control.disabled ? 0.45 : 1 }}>
    <style>{`.dn-audio-parameter input:focus-visible,.dn-audio-parameter button:focus-visible{outline:2px solid #fff;outline-offset:3px}.dn-audio-parameter button:disabled{opacity:.4;cursor:default}.dn-audio-parameter input[type=range]{accent-color:#fff;cursor:ew-resize;touch-action:pan-y}.dn-audio-parameter input[type=range]:disabled{cursor:default}@media(pointer:coarse){.dn-audio-parameter input,.dn-audio-parameter button{min-height:44px}}`}</style>
    {!props.compact ? <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ color: '#FFFFFF', fontSize: 15 }}>{props.label}</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, fontSize: 13 }}>
        <input type="number" aria-label={`Valor de ${props.label}`} aria-valuetext={props.format(control.value)}
          min={props.min / inputScale} max={props.max / inputScale} step={props.step / inputScale}
          value={entry?.value === props.value ? entry.text : Number((control.value / inputScale).toFixed(9))} disabled={control.disabled}
          style={numericStyle} onChange={event => setEntry({ text: event.currentTarget.value, value: props.value })} onBlur={saveEntry}
          onKeyDown={event => {
            if (event.key === 'Enter') { event.preventDefault(); saveEntry() }
            if (event.key === 'Escape') { event.preventDefault(); setEntry(null) }
          }} />
        {props.unit ? <span style={{ color: '#B3B3B3' }}>{props.unit}</span> : null}
        {props.resetValue !== undefined ? <button type="button" style={buttonStyle}
          aria-label={`Restablecer ${props.label} a ${props.format(props.resetValue)}`}
          disabled={control.disabled || control.value === props.resetValue}
          onClick={() => control.commit(props.resetValue!)}>Restablecer</button> : null}
      </div>
    </div> : null}
    <input type="range" aria-label={props.label} aria-valuetext={props.format(control.value)}
      aria-valuemin={props.min} aria-valuemax={props.max} aria-valuenow={control.value}
      min={logarithmic ? 0 : props.min} max={logarithmic ? 1 : props.max}
      step={logarithmic ? 0.001 : props.step}
      value={logarithmic ? parameterPosition(control.value, props) : control.value}
      disabled={control.disabled} style={{ width: '100%', height: 38, margin: 0 }}
      onChange={event => control.change(logarithmic ? parameterFromPosition(event.currentTarget.valueAsNumber, props) : event.currentTarget.valueAsNumber)}
      onPointerUp={control.finish} onPointerCancel={control.cancel} onBlur={control.finish}
      onKeyUp={control.finish} onDoubleClick={() => { if (props.resetValue !== undefined) control.commit(props.resetValue) }}
      onKeyDown={event => {
        const target = event.key === 'Home' ? props.min : event.key === 'End' ? props.max
          : event.key === 'PageUp' ? control.value + props.step * 10
            : event.key === 'PageDown' ? control.value - props.step * 10 : null
        if (target !== null) { event.preventDefault(); control.commit(target); return }
        const direction = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1
          : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 0
        if (direction && (logarithmic || event.shiftKey)) {
          event.preventDefault()
          control.commit(control.value + direction * props.step * (event.shiftKey ? 10 : 1))
        }
      }} />
    {!props.compact ? <div aria-hidden="true" style={{ display: 'flex', justifyContent: 'space-between', color: '#B3B3B3', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
      <span>{props.format(props.min)}</span>
      {props.resetValue !== undefined && props.resetValue > props.min && props.resetValue < props.max ? <span>{props.format(props.resetValue)}</span> : null}
      <span>{props.format(props.max)}</span>
    </div> : null}
  </div>
}
