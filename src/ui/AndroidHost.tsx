import { Host, type HostProps } from '@expo/ui/jetpack-compose'
import type { ModifierConfig } from '@expo/ui/jetpack-compose/modifiers'
import { requireNativeModule } from 'expo'

// This module is included in DMusic development/release builds, like our Swift modules.
requireNativeModule('DNAndroidControls')

export { ANDROID_COLORS } from './androidDesign'

export function androidAccessibility(label: string, value?: string): ModifierConfig {
  return { $type: 'dnmusicAccessibility', label, value }
}

/** Compose owns interaction; the React Native shell owns keyboard/safe-area layout. */
export function AndroidHost(props: HostProps) {
  return <Host colorScheme="dark" seedColor="#FFFFFF" ignoreSafeAreaKeyboardInsets {...props} />
}
