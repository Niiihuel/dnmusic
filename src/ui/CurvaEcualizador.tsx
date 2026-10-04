import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { PanResponder, View } from 'react-native'
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg'
import { FRECUENCIAS_EQ, guardarEcualizadorAhora, setGananciaEcualizador } from '../state/ecualizador'
import { bandaEQ, curvaEQ, EQ_GRAPH_HEIGHT, gananciaEQ, puntoEQ } from './ecualizadorGeometry'

/** One explicitly sized RN island in SwiftUI. No nested Hosts or ScrollViews. */
export function CurvaEcualizador({ ganancias, ancho, seleccionada, onSeleccionar, disabled }: {
  ganancias: number[]; ancho: number; seleccionada: number; onSeleccionar: (index: number) => void; disabled: boolean
}) {
  const latest = useRef({ ganancias, ancho, onSeleccionar, disabled })
  useLayoutEffect(() => { latest.current = { ganancias, ancho, onSeleccionar, disabled } }, [ganancias, ancho, onSeleccionar, disabled])
  const dragging = useRef<number | null>(null)
  const initialY = useRef(0)
  const queued = useRef<{ index: number; gain: number } | null>(null)
  const raf = useRef<number | null>(null)
  const flush = () => {
    if (raf.current !== null) cancelAnimationFrame(raf.current)
    raf.current = null
    if (queued.current) setGananciaEcualizador(queued.current.index, queued.current.gain)
    queued.current = null
  }
  const finish = () => { flush(); dragging.current = null; void guardarEcualizadorAhora() }
  useEffect(() => () => {
    if (raf.current !== null) cancelAnimationFrame(raf.current)
    if (queued.current) setGananciaEcualizador(queued.current.index, queued.current.gain)
    void guardarEcualizadorAhora()
  }, [])
  // A gesture keeps its original band even when the finger crosses another dot.
  // PanResponder.create registers these callbacks; it does not invoke them in render.
  // eslint-disable-next-line react-hooks/refs
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !latest.current.disabled,
    onPanResponderGrant: event => {
      const { ancho, ganancias, onSeleccionar } = latest.current
      const index = bandaEQ(event.nativeEvent.locationX, ancho, ganancias.length)
      dragging.current = index
      initialY.current = puntoEQ(index, ganancias[index], ancho, ganancias.length).y
      onSeleccionar(index)
    },
    onPanResponderMove: (_event, gesture) => {
      if (dragging.current === null || latest.current.disabled) return
      queued.current = { index: dragging.current, gain: gananciaEQ(initialY.current + gesture.dy) }
      if (raf.current === null) raf.current = requestAnimationFrame(flush)
    },
    onPanResponderRelease: finish,
    onPanResponderTerminate: finish,
    onPanResponderTerminationRequest: () => false,
  // All changing values are read from refs; recreating the responder cancels drags.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [])

  return <View {...responder.panHandlers} collapsable={false} accessible={false}
    accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={{ width: ancho, height: EQ_GRAPH_HEIGHT, opacity: disabled ? 0.4 : 1 }}>
    <Svg width={ancho} height={EQ_GRAPH_HEIGHT} pointerEvents="none">
      {[12, 0, -12].map(db => {
        const start = puntoEQ(0, db, ancho, ganancias.length), end = puntoEQ(ganancias.length - 1, db, ancho, ganancias.length)
        return <Line key={db} x1={start.x} x2={end.x} y1={start.y} y2={end.y} stroke={db === 0 ? '#606064' : '#303033'} strokeDasharray={db === 0 ? undefined : '3 5'} />
      })}
      {[12, 0, -12].map(db => <SvgText key={`label-${db}`} x={1} y={puntoEQ(0, db, ancho, ganancias.length).y + 3} fill="#B3B3B3" fontSize={9}>{db > 0 ? `+${db}` : db}</SvgText>)}
      {ganancias.map((gain, index) => {
        const p = puntoEQ(index, gain, ancho, ganancias.length)
        return <Line key={index} x1={p.x} x2={p.x} y1={24} y2={EQ_GRAPH_HEIGHT - 30} stroke={index === seleccionada ? '#515156' : '#262629'} />
      })}
      <Path d={curvaEQ(ganancias, ancho)} stroke="#FFFFFF" strokeWidth={2.5} fill="none" />
      {ganancias.map((gain, index) => {
        const p = puntoEQ(index, gain, ancho, ganancias.length)
        return <Circle key={index} cx={p.x} cy={p.y} r={index === seleccionada ? 7 : 4} fill={index === seleccionada ? '#FFFFFF' : '#B3B3B3'} stroke="#181818" strokeWidth={2} />
      })}
      {FRECUENCIAS_EQ.map((frequency, index) => <SvgText key={frequency}
        x={puntoEQ(index, 0, ancho, ganancias.length).x} y={EQ_GRAPH_HEIGHT - 6}
        textAnchor="middle" fill={index === seleccionada ? '#FFFFFF' : '#B3B3B3'} fontSize={10}>
        {frequency >= 1000 ? `${frequency / 1000}k` : frequency}
      </SvgText>)}
    </Svg>
  </View>
}
