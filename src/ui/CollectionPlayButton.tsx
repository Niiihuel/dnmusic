import { Pressable, Text } from 'react-native'
export type CollectionPlayButtonProps = { playing: boolean; disabled: boolean; onPress: () => void }
export function CollectionPlayButton({ playing, disabled, onPress }: CollectionPlayButtonProps) {
  return <Pressable disabled={disabled} onPress={onPress} accessibilityRole="button" accessibilityLabel={playing ? 'Pausar' : 'Reproducir la lista'}
    style={{ flex: 1, minHeight: 48, borderRadius: 24, backgroundColor: '#FFFFFF', opacity: disabled ? 0.45 : 1, alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ color: '#121212', fontSize: 15, fontWeight: '600' }}>{playing ? 'Pausar' : 'Reproducir'}</Text>
  </Pressable>
}
