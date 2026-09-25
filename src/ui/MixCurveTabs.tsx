import { useEffect, useRef, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import type { MixCurveView } from './MixAutomationCurve'
import { Glass } from './Glass'
import { estadoControlWeb } from './estadoControl'

const RESORTE = { damping: 22, stiffness: 260, mass: 0.7, overshootClamping: true }
const LABELS: Record<MixCurveView, string> = {
  volume: 'Volumen', eq: 'Ecualizador', filter: 'Filtro',
}

function GlassMixTabs<T extends string>({ items, active, onChange }: {
  items: readonly { value: T; label: string }[]
  active: T
  onChange: (value: T) => void
}) {
  const [sites, setSites] = useState<Partial<Record<T, { x: number; width: number }>>>({})
  const x = useSharedValue(0)
  const width = useSharedValue(0)
  const opacity = useSharedValue(0)
  const placed = useRef(false)

  useEffect(() => {
    const site = sites[active]
    if (!site) return
    if (placed.current) {
      x.value = withSpring(site.x, RESORTE)
      width.value = withSpring(site.width, RESORTE)
    } else {
      x.value = site.x
      width.value = site.width
      opacity.value = 1
      placed.current = true
    }
  }, [active, sites, x, width, opacity])

  const capsule = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }], width: width.value, opacity: opacity.value,
  }))

  return <Glass radius={24} style={{ alignSelf: 'flex-start', padding: 4 }}>
    <View accessibilityRole="tablist" style={{ flexDirection: 'row' }}>
      <Animated.View pointerEvents="none" style={[{
        position: 'absolute', top: 0, bottom: 0, left: 0,
        borderRadius: 20, backgroundColor: '#FFFFFF',
      }, capsule]} />
      {items.map(({ value, label }) => <Pressable key={value} {...estadoControlWeb('none')}
        accessibilityRole="tab" accessibilityLabel={label}
        accessibilityState={{ selected: active === value }}
        onPress={() => onChange(value)}
        onLayout={event => {
          const { x: nextX, width: nextWidth } = event.nativeEvent.layout
          setSites(previous => previous[value]?.x === nextX && previous[value]?.width === nextWidth
            ? previous : { ...previous, [value]: { x: nextX, width: nextWidth } })
        }}
        style={{ height: 40, borderRadius: 20, paddingHorizontal: 15, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: active === value ? '#121212' : '#B3B3B3', fontSize: 13, fontWeight: '600' }}>
          {label}
        </Text>
      </Pressable>)}
    </View>
  </Glass>
}

/** La misma píldora de vidrio y cápsula móvil que las pestañas del perfil. */
export function MixCurveTabs({ available, active, onChange }: {
  available: MixCurveView[]
  active: MixCurveView
  onChange: (view: MixCurveView) => void
}) {
  return <GlassMixTabs items={available.map(value => ({ value, label: LABELS[value] }))}
    active={active} onChange={onChange} />
}

export function MixDeckTabs({ active, onChange }: {
  active: 'out' | 'in'
  onChange: (deck: 'out' | 'in') => void
}) {
  return <GlassMixTabs items={[{ value: 'out', label: 'Salida' }, { value: 'in', label: 'Entrada' }]}
    active={active} onChange={onChange} />
}
