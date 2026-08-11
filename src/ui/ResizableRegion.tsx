import { Component, type ReactNode } from 'react'
import { Animated, Easing, PanResponder, View } from 'react-native'

const COLLAPSED_WIDTH = 64
const PEEK_WIDTH = 112
const MOTION_MS = 220

type Props = {
  width: number
  collapsed: boolean
  collapsedWidth?: number
  peekWidth?: number
  minWidth: number
  maxWidth: number
  /** El borde que se arrastra: derecho para sidebar izquierdo y viceversa. */
  resizeEdge: 'left' | 'right'
  onWidthChange: (width: number) => void
  children: (state: { hovered: boolean }) => ReactNode
}

type State = { hovered: boolean }

/**
 * Región lateral con el comportamiento de Spotify:
 * - al colapsar/expandir interpola el ancho;
 * - colapsada hace un pequeño "peek" al hover;
 * - abierta expone un tirador de resize sin modificar el layout interior.
 */
export class ResizableRegion extends Component<Props, State> {
  state: State = { hovered: false }
  private startWidth = this.props.width
  private dragging = false
  private animatedWidth = new Animated.Value(
    this.props.collapsed ? (this.props.collapsedWidth ?? COLLAPSED_WIDTH) : this.props.width,
  )

  componentDidUpdate(previous: Props, previousState: State) {
    const collapsedChanged = previous.collapsed !== this.props.collapsed
    const hoverChanged = previousState.hovered !== this.state.hovered

    if (collapsedChanged || (this.props.collapsed && hoverChanged)) {
      this.animateTo(this.targetWidth())
      return
    }

    if (!this.props.collapsed && previous.width !== this.props.width && !this.dragging) {
      this.animatedWidth.setValue(this.props.width)
    }
  }

  private targetWidth() {
    if (!this.props.collapsed) return this.props.width
    if (this.state.hovered) return this.props.peekWidth ?? PEEK_WIDTH
    return this.props.collapsedWidth ?? COLLAPSED_WIDTH
  }

  private animateTo(width: number) {
    Animated.timing(this.animatedWidth, {
      toValue: width,
      duration: MOTION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start()
  }

  private responder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 1,
    onPanResponderGrant: () => {
      this.dragging = true
      this.startWidth = this.props.width
    },
    onPanResponderMove: (_, gesture) => {
      const { resizeEdge, minWidth, maxWidth, onWidthChange } = this.props
      const direction = resizeEdge === 'right' ? 1 : -1
      const next = Math.max(minWidth, Math.min(maxWidth, this.startWidth + gesture.dx * direction))
      this.animatedWidth.setValue(next)
      onWidthChange(next)
    },
    onPanResponderRelease: () => {
      this.dragging = false
    },
    onPanResponderTerminate: () => {
      this.dragging = false
    },
  })

  render() {
    const { collapsed, resizeEdge, width, children } = this.props
    const { hovered } = this.state
    const anchoredStyle = resizeEdge === 'right' ? { left: 0 } : { right: 0 }

    return (
      <Animated.View
        style={{
          width: this.animatedWidth,
          position: 'relative',
          overflow: 'hidden',
        }}
        onPointerEnter={() => this.setState({ hovered: true })}
        onPointerLeave={() => this.setState({ hovered: false })}
      >
        <Animated.View
          style={{
            width: collapsed ? this.animatedWidth : width,
            position: 'absolute',
            top: 0,
            bottom: 0,
            ...anchoredStyle,
          }}
        >
          {children({ hovered })}
        </Animated.View>

        {!collapsed && hovered ? (
          <View
            {...this.responder.panHandlers}
            accessibilityRole="adjustable"
            accessibilityLabel="Redimensionar panel"
            className={`absolute bottom-0 top-0 z-50 w-2 items-center justify-center ${
              resizeEdge === 'right' ? '-right-1' : '-left-1'
            }`}
            // cursor es una extensión de react-native-web.
            style={{ cursor: 'col-resize' } as never}
          >
            <View className="h-14 w-0.5 rounded-full bg-border" />
          </View>
        ) : null}
      </Animated.View>
    )
  }
}
