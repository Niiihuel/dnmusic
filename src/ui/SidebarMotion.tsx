import { useEffect, useState, type ReactNode } from 'react'
import { Animated, Pressable, View } from 'react-native'
import { Panel } from './Panel'
import {
  ICON_COLOR,
  IconChevronLeft,
  IconChevronRight,
  IconInbox,
  IconMusic,
} from './icons'

export function AnimatedSidebarTitle({
  visible,
  label,
  icon,
  onPress,
  alignIconToFirstLine = false,
  children,
}: {
  visible: boolean
  label: string
  icon: ReactNode
  onPress: () => void
  alignIconToFirstLine?: boolean
  children: ReactNode
}) {
  const [progress] = useState(() => new Animated.Value(visible ? 1 : 0))

  useEffect(() => {
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start()
  }, [progress, visible])

  const iconTranslate = progress.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] })
  const titleTranslate = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 28] })

  return (
    <View className="relative min-w-0 flex-1">
      <Animated.View
        pointerEvents={visible ? 'auto' : 'none'}
        style={{
          position: 'absolute',
          left: 0,
          ...(alignIconToFirstLine ? { top: -4 } : { top: '50%', marginTop: -18 }),
          opacity: progress,
          transform: [{ translateX: iconTranslate }],
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={onPress}
          className="h-9 w-7 items-start justify-center active:opacity-70"
        >
          {icon}
        </Pressable>
      </Animated.View>
      <Animated.View style={{ transform: [{ translateX: titleTranslate }] }}>
        {children}
      </Animated.View>
    </View>
  )
}

export function CollapsedSidebar({
  side,
  hovered,
  expandedWidth,
  preview,
  resting,
  onExpand,
  label,
}: {
  side: 'left' | 'right'
  hovered: boolean
  expandedWidth: number
  preview: ReactNode
  /**
   * Qué se ve en reposo, sin el cursor encima.
   *
   * Por defecto un ícono, que dice qué hay abajo pero no *cuánto*. Cuando el
   * panel tiene contenido reconocible de un vistazo —las tapas de tus listas—
   * conviene mostrar eso: una franja vacía no se parece en nada al panel que
   * va a aparecer.
   */
  resting?: ReactNode
  onExpand: () => void
  label?: string
}) {
  const [progress] = useState(() => new Animated.Value(hovered ? 1 : 0))

  useEffect(() => {
    Animated.timing(progress, {
      toValue: hovered ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start()
  }, [hovered, progress])

  const previewTranslate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [side === 'left' ? -8 : 8, 0],
  })
  const restingOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] })
  const arrowTranslate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [side === 'left' ? -8 : 8, 0],
  })

  return (
    <Panel className="relative flex-1 bg-card">
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          width: expandedWidth,
          opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 0.5] }),
          transform: [{ translateX: previewTranslate }],
          /*
           * La franja es el **borde por donde el panel va a crecer**, no el
           * opuesto.
           *
           * Anclado al revés, lo que asomaba era el final de cada fila —donde
           * no hay nada— y la previa se veía vacía aunque el panel estuviera
           * lleno. La izquierda crece hacia la derecha, así que se ancla a la
           * izquierda; la derecha, al revés.
           */
          ...(side === 'left' ? { left: 0 } : { right: 0 }),
        }}
      >
        {preview}
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 20,
          bottom: 0,
          alignItems: resting ? 'stretch' : 'center',
          opacity: restingOpacity,
        }}
      >
        {resting ??
          (side === 'left' ? (
            <IconInbox size={20} color={ICON_COLOR.muted} />
          ) : (
            <IconMusic size={20} color={ICON_COLOR.muted} />
          ))}
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          inset: 0,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: progress,
          transform: [{ translateX: arrowTranslate }],
        }}
      >
        {side === 'left' ? (
          <IconChevronRight size={26} color={ICON_COLOR.foreground} />
        ) : (
          <IconChevronLeft size={26} color={ICON_COLOR.foreground} />
        )}
      </Animated.View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label ?? (side === 'left' ? 'Expandir panel izquierdo' : 'Expandir panel derecho')}
        onPress={onExpand}
        className="absolute inset-0 active:bg-card/20"
      />
    </Panel>
  )
}
