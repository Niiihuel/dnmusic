import { View } from 'react-native'
import { PrimaryButton } from './Button'
import type { CollectionPlayButtonProps } from './CollectionPlayButton'
export function CollectionPlayButton({ playing, disabled, onPress }: CollectionPlayButtonProps) {
  return <View style={{ flex: 1, minWidth: 110 }}><PrimaryButton label={playing ? 'Pausar' : 'Reproducir'} disabled={disabled} onPress={onPress} /></View>
}
