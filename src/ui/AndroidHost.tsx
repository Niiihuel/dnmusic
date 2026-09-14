import { Host, type HostProps } from '@expo/ui/jetpack-compose'
import type { ModifierConfig } from '@expo/ui/jetpack-compose/modifiers'
import { requireNativeModule } from 'expo'

// This module is included in DMusic development/release builds, like our Swift modules.
requireNativeModule('DNAndroidControls')

export const ANDROID_COLORS = {
  background: '#121212', surface: '#242426', raised: '#303032', text: '#FFFFFF',
  muted: '#B3B3B3', primary: '#FFFFFF', onPrimary: '#121212', error: '#FF6961',
} as const

export function androidAccessibility(label: string, value?: string): ModifierConfig {
  return { $type: 'dnmusicAccessibility', label, value }
}

/** Compose owns interaction; the React Native shell owns keyboard/safe-area layout. */
export function AndroidHost(props: HostProps) {
  return <Host colorScheme="dark" seedColor="#FFFFFF" ignoreSafeAreaKeyboardInsets {...props} />
}
