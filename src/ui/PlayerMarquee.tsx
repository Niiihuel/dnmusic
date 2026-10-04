import { Pressable, Text } from 'react-native'

type Props = {
  text: string
  kind: 'title' | 'subtitle'
  onPress?: () => void
}

/** Fuera de web conservamos el rótulo nativo de una línea. */
export function PlayerMarquee({ text, kind, onPress }: Props) {
  const label = <Text numberOfLines={1} className={kind === 'title'
    ? 'text-foreground text-footnote font-semibold'
    : 'text-muted-foreground text-caption2'}>{text}</Text>
  if (!onPress) return label
  return <Pressable accessibilityRole="link" accessibilityLabel={`Ver artista: ${text}`}
    onPress={onPress} style={{ minWidth: 0, alignSelf: 'flex-start', maxWidth: '100%' }}>
    {label}
  </Pressable>
}
