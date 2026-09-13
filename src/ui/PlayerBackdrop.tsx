import { Image, Platform, StyleSheet, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'

/** Fondo común del reproductor y de los fragmentos compartidos. */
export function PlayerBackdrop({ uri }: { uri?: string | null }) {
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden', backgroundColor: '#101010' }]}>
    {uri ? <Image source={{ uri }} blurRadius={Platform.OS === 'web' ? 0 : 50}
      style={[StyleSheet.absoluteFill, { opacity: 0.55, transform: [{ scale: 1.25 }] },
        Platform.OS === 'web' ? { filter: 'blur(64px)' } as object : null]} /> : null}
    <LinearGradient colors={['rgba(0,0,0,0.42)', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.7)']}
      style={StyleSheet.absoluteFill} />
  </View>
}
