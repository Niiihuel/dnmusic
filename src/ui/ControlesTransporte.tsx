import { ActivityIndicator, Platform, View } from 'react-native'
import { ICON_COLOR, IconCola, IconDisc, IconLyrics, IconNext, IconPause, IconPlay, IconPrevious, IconUsers } from './icons'
import { IconButton } from './IconButton'
import { BotonAleatorio, BotonRepetir } from './Transport'

export type ControlesTransporteProps = {
  reproduciendo: boolean
  cargando?: boolean
  remoto?: boolean
  onAlternar: () => void
  onAnterior?: () => void
  onSiguiente?: () => void
  sinSiguiente?: boolean
  /** La barra reserva controles pequeños; la pantalla completa áreas de 48–64 px. */
  grande?: boolean
  conModos?: boolean
}

export function ControlesTransporte({
  reproduciendo, cargando = false, remoto = false, onAlternar, onAnterior, onSiguiente,
  sinSiguiente = false, grande = false, conModos = true,
}: ControlesTransporteProps) {
  const sonando = reproduciendo && !remoto && !cargando
  const etiqueta = remoto ? 'Traer música a este dispositivo' : cargando ? 'Pausar carga' : sonando ? 'Pausar' : 'Reproducir'
  const lado = grande ? 48 : 36
  const iconSize = grande ? 26 : 17
  return <View accessibilityLabel="Controles de reproducción"
    {...(Platform.OS === 'web' ? { role: 'group', dataSet: { audioTransport: '', audioState: cargando ? 'loading' : sonando ? 'playing' : 'paused' } } as object : {})}
    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: grande ? 'space-between' : 'center', gap: grande ? 0 : 1, minWidth: 0 }}>
    {conModos ? <BotonAleatorio size={grande ? 22 : 16} lado={grande ? 44 : 36} /> : null}
    <IconButton label="Anterior" symbol="backward.end.fill" onPress={onAnterior ?? (() => {})} disabled={!onAnterior}
      lado={lado} size={iconSize} muted={!grande}
      icon={<IconPrevious size={iconSize} color={!onAnterior || !grande ? ICON_COLOR.muted : ICON_COLOR.foreground} />} />
    <IconButton label={etiqueta} symbol={sonando ? 'pause.fill' : 'play.fill'} onPress={onAlternar}
      lado={grande ? 64 : 40} size={grande ? 24 : 16} variant="primary" busy={cargando}
      icon={cargando ? <ActivityIndicator size="small" color={ICON_COLOR.onPrimary} />
        : sonando ? <IconPause size={grande ? 24 : 16} color={ICON_COLOR.onPrimary} />
          : <IconPlay size={grande ? 24 : 16} color={ICON_COLOR.onPrimary} />} />
    <IconButton label="Siguiente" symbol="forward.end.fill" onPress={onSiguiente ?? (() => {})} disabled={sinSiguiente || !onSiguiente}
      lado={lado} size={iconSize} muted={sinSiguiente || !grande}
      icon={<IconNext size={iconSize} color={sinSiguiente || !onSiguiente || !grande ? ICON_COLOR.muted : ICON_COLOR.foreground} />} />
    {conModos ? <BotonRepetir size={grande ? 22 : 16} lado={grande ? 44 : 36} /> : null}
  </View>
}

const VISTAS = {
  disc: { icono: IconDisc, simbolo: 'opticaldisc' },
  lyrics: { icono: IconLyrics, simbolo: 'quote.bubble' },
  jam: { icono: IconUsers, simbolo: 'person.2' },
  cola: { icono: IconCola, simbolo: 'list.bullet' },
} as const

export function BotonVistaAudio({ label, active, onPress, vista }: {
  label: string
  active: boolean
  onPress: () => void
  vista: keyof typeof VISTAS
}) {
  const { icono: Icono, simbolo } = VISTAS[vista]
  return <IconButton label={label} symbol={simbolo} selected={active} onPress={onPress} muted={!active}
    icon={<Icono size={20} color={active ? ICON_COLOR.foreground : ICON_COLOR.muted} />} />
}
