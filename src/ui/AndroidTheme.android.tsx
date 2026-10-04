import type { PropsWithChildren } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { useFonts } from 'expo-font'
import { vars } from 'nativewind'
import { ANDROID_COLORS } from './androidDesign'

const fonts = {
  InterTight_400Regular: require('@expo-google-fonts/inter-tight/400Regular/InterTight_400Regular.ttf'),
  InterTight_600SemiBold: require('@expo-google-fonts/inter-tight/600SemiBold/InterTight_600SemiBold.ttf'),
}
const rgb = (hex: string) => [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16)).join(' ')
const palette = vars({
  '--text': ANDROID_COLORS.text, '--muted': ANDROID_COLORS.muted, '--strong': ANDROID_COLORS.strong, '--track': ANDROID_COLORS.track,
  '--color-foreground': rgb(ANDROID_COLORS.text), '--color-card-foreground': rgb(ANDROID_COLORS.text),
  '--color-card': rgb(ANDROID_COLORS.surface), '--color-muted': rgb(ANDROID_COLORS.raised),
  '--color-muted-foreground': rgb(ANDROID_COLORS.muted), '--color-border': rgb(ANDROID_COLORS.track),
})

/** Se cargan antes de montar Compose: su resolver de fuentes necesita el registro listo. */
export function AndroidTheme({ children }: PropsWithChildren) {
  const [ready, error] = useFonts(fonts)
  if (!ready && !error) return <View style={{ flex: 1, backgroundColor: ANDROID_COLORS.background, justifyContent: 'center', alignItems: 'center' }}>
    <ActivityIndicator color={ANDROID_COLORS.strong} accessibilityLabel="Cargando" />
  </View>
  return <View style={[{ flex: 1 }, palette]}>{children}</View>
}
