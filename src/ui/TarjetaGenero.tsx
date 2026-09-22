import { StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { identidadGenero, nombreGenero } from '../lib/catalogoEditorial'
import { BotonSuperficie } from './BotonSuperficie'
import { IconCheck, IconPlus } from './icons'

/** Arte propio, sin portadas promocionales ni texto incrustado del proveedor. */
export function TarjetaGenero({ nombre, ancho, elegido, onPress }: {
  nombre: string; ancho: number; elegido?: boolean; onPress: () => void
}) {
  const identidad = identidadGenero(nombre)
  const seleccionable = elegido !== undefined
  return <BotonSuperficie accessibilityRole="button" onPress={onPress}
    accessibilityLabel={seleccionable ? `${elegido ? 'Quitar' : 'Elegir'} ${nombreGenero(nombre)}` : nombreGenero(nombre)}
    accessibilityState={seleccionable ? { selected: elegido } : undefined}
    style={{ width: ancho }} className="active:opacity-80">
    <View style={{ flex: 1, minHeight: 164, borderRadius: 18, overflow: 'hidden', backgroundColor: elegido ? '#393939' : '#202020', padding: 16, gap: 6 }}>
      <LinearGradient pointerEvents="none" colors={elegido ? ['#484848', '#252525'] : ['#303030', '#191919']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        style={{ position: 'absolute', right: -22, top: -28, width: 110, height: 110, opacity: elegido ? 0.2 : 0.09, transform: [{ rotate: `${(identidad?.motivo ?? 0) * 35}deg` }] }}>
        {[0, 1, 2, 3].map(i => <View key={i} style={{ position: 'absolute', top: i * 13, left: i * 13,
          width: 110 - i * 26, height: 110 - i * 26, borderRadius: identidad?.motivo === 1 ? 14 : 80,
          borderWidth: 2, borderColor: '#FFFFFF' }} />)}
      </View>
      <View style={{ height: 30, alignItems: 'flex-end', marginBottom: 8 }}>
        {seleccionable ? <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: elegido ? '#FFFFFF' : '#414141' }}>
          {elegido ? <IconCheck size={16} color="#111111" /> : <IconPlus size={16} color="#D6D6D6" />}
        </View> : null}
      </View>
      <Text style={{ color: '#FFFFFF', fontSize: 18, lineHeight: 23, fontWeight: '600', letterSpacing: -0.4 }}>{nombreGenero(nombre)}</Text>
      <Text style={{ color: '#BDBDBD', fontSize: 12, lineHeight: 17 }}>{identidad?.detalle ?? 'Explorá este sonido'}</Text>
    </View>
  </BotonSuperficie>
}
