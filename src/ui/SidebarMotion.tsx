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
  const titleTranslate = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 36] })

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
          className="h-9 w-9 items-center justify-center rounded-full active:opacity-70"
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

/**
 * El riel de un panel colapsado, al modo de la barra lateral plegada de macOS.
 *
 * En reposo muestra lo que hay abajo —las tapas de tus listas, o un ícono— y
 * con el cursor encima solo **atenúa eso y trae el chevrón**: nada de previas
 * fantasma del panel entero. La previa a media opacidad venía de la era de las
 * tarjetas y sobre las columnas de borde a borde se leía como un error de
 * dibujado — dos capas peleando en una franja de 64px.
 */
export function CollapsedSidebar({
  side,
  hovered,
  resting,
  onExpand,
  label,
}: {
  side: 'left' | 'right'
  hovered: boolean
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

  /* Las tapas no desaparecen: se corren a un segundo plano para que el
     chevrón —lo que vas a tocar— quede al frente. */
  const restingOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] })
  const arrowTranslate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [side === 'left' ? -8 : 8, 0],
  })

  return (
    <Panel tone="lateral" className="relative flex-1">
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
