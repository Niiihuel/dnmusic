import type { ReactNode } from 'react'
import { CabeceraAcceso } from './CabeceraAcceso'
import { KeyboardAvoidingView, Platform, useWindowDimensions, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { ScrollArea } from './ScrollArea'
import { ARRASTRE_SUPERIOR } from './BandaVentana'

export { NotaAcceso } from './CabeceraAcceso'

/** El formulario conserva su ancho; el scroll cede espacio al teclado y a ventanas bajas. */
export function PantallaAcceso({ titulo, detalle, children }: { titulo: string; detalle?: string; children: ReactNode }) {
  const escritorio = useWindowDimensions().width >= 780
  return <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom', 'left', 'right']}>
    <LinearGradient pointerEvents="none" colors={['#242424', '#151515', '#121212']} locations={[0, 0.54, 1]}
      style={{ position: 'absolute', top: 0, left: 0, right: 0, height: escritorio ? 360 : 400 }} />
    {/* Sin barra lateral no habría de dónde agarrar la ventana. Ver `ui/BandaVentana`. */}
    {ARRASTRE_SUPERIOR ? <View className={ARRASTRE_SUPERIOR} /> : null}
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="min-h-0 flex-1">
      <ScrollArea keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
        contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingVertical: escritorio ? 32 : 24 }}>
        <View style={{
          width: '100%', maxWidth: escritorio ? 376 : 420, gap: escritorio ? 20 : 24,
          padding: escritorio ? 28 : 0,
          borderRadius: escritorio ? 20 : 0,
          backgroundColor: escritorio ? 'rgba(18,18,18,0.72)' : 'transparent',
          boxShadow: escritorio ? '0 24px 70px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.06)' : undefined,
        }}>
          <CabeceraAcceso titulo={titulo} detalle={detalle} escritorio={escritorio} />
          {children}
        </View>
      </ScrollArea>
    </KeyboardAvoidingView>
  </SafeAreaView>
}
