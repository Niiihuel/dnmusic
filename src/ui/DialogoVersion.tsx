import type { ReactNode } from 'react'
import { Platform, ScrollView, View } from 'react-native'
import { Dialogo } from './Dialogo'

/** Hoja real en iOS; modal con foco/Escape y animación del sistema de PC. */
export function DialogoVersion({ visible, titulo, onCerrar, children }: { visible: boolean; titulo: string; onCerrar: () => void; children: ReactNode }) {
  const contenido = <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 12 }}><View style={{ width: '100%' }}>{children}</View></ScrollView>
  return <Dialogo visible={visible} titulo={titulo} ancho={500} contenidoPC={contenido} onRequestClose={onCerrar}
    transparent={Platform.OS !== 'ios'} presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined} animationType={Platform.OS === 'ios' ? 'slide' : 'fade'}>
    <View style={{ flex: 1, justifyContent: 'center', backgroundColor: Platform.OS === 'ios' ? '#111' : '#0009', paddingTop: Platform.OS === 'ios' ? 16 : 36, paddingBottom: 24 }}>
      {contenido}
    </View>
  </Dialogo>
}
