import { forwardRef, useState, type ReactNode } from 'react'
import { Image, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, useWindowDimensions, View, type TextInputProps } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { ScrollArea } from './ScrollArea'
import { ICON_COLOR, IconEye, IconEyeOff } from './icons'
import { estadoControlWeb } from './estadoControl'
import { ARRASTRE_SUPERIOR } from './BandaVentana'

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
          <View style={{ gap: escritorio ? 8 : 12 }}>
            <Image source={require('../../assets/icon.png')} accessibilityLabel="dnmusic"
              style={{ width: escritorio ? 40 : 48, height: escritorio ? 40 : 48, borderRadius: escritorio ? 10 : 12 }} />
            <Text accessibilityRole="header" style={{ fontSize: escritorio ? 24 : 26 }} className="text-foreground font-semibold">{titulo}</Text>
            {detalle ? <Text style={{ fontSize: escritorio ? 14 : 15, lineHeight: escritorio ? 20 : 24 }} className="text-muted-foreground">{detalle}</Text> : null}
          </View>
          {children}
        </View>
      </ScrollArea>
    </KeyboardAvoidingView>
  </SafeAreaView>
}

type CampoAccesoProps = TextInputProps & {
  label: string; hint?: string; error?: string | null; accessory?: ReactNode
  password?: boolean; visible?: boolean; onToggleVisible?: () => void
}

export const CampoAcceso = forwardRef<TextInput, CampoAccesoProps>(function CampoAcceso({
  label, hint, error, accessory, password = false, visible = false, onToggleVisible, ...input
}, ref) {
  const escritorio = useWindowDimensions().width >= 780
  const alto = escritorio ? 40 : 48
  return <View className="gap-2">
    <Text style={{ fontSize: escritorio ? 13 : 15 }} className="text-foreground font-medium">{label}</Text>
    <View style={{ minHeight: alto, borderRadius: escritorio ? 10 : 12, paddingLeft: escritorio ? 12 : 16 }} className="flex-row items-center bg-muted pr-1">
      <TextInput {...input} ref={ref} accessibilityLabel={label} secureTextEntry={password && !visible}
        placeholderTextColor="#999" style={{ minHeight: alto, fontSize: escritorio ? 15 : 16 }} className="min-w-0 flex-1 text-foreground"
        autoCapitalize="none" autoCorrect={false} />
      {accessory ? <View style={{ height: alto, width: alto }} className="items-center justify-center">{accessory}</View> : null}
      {password ? <Pressable accessibilityRole="button" accessibilityLabel={visible ? `Ocultar ${label.toLowerCase()}` : `Mostrar ${label.toLowerCase()}`}
        accessibilityState={{ disabled: input.editable === false }} disabled={input.editable === false} onPress={onToggleVisible}
        style={{ height: alto, width: alto, borderRadius: 8 }} className="items-center justify-center active:opacity-70">
        {visible ? <IconEyeOff size={18} color={ICON_COLOR.muted} /> : <IconEye size={18} color={ICON_COLOR.muted} />}
      </Pressable> : null}
    </View>
    {error || hint ? <Text accessibilityRole={error ? 'alert' : undefined} accessibilityLiveRegion="polite"
      className="text-muted-foreground text-[13px] leading-5">{error || hint}</Text> : null}
  </View>
})


/** Un destino textual: conserva área táctil en teléfono sin parecer un botón. */
export function EnlaceAcceso({
  label,
  onPress,
  disabled = false,
  expanded,
  centrado = false,
}: {
  label: string
  onPress: () => void
  disabled?: boolean
  expanded?: boolean
  centrado?: boolean
}) {
  const escritorio = useWindowDimensions().width >= 780
  const [activo, setActivo] = useState(false)
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityState={{ disabled, expanded }}
      disabled={disabled}
      onPress={onPress}
      onHoverIn={() => setActivo(true)}
      onHoverOut={() => setActivo(false)}
      onFocus={() => setActivo(true)}
      onBlur={() => setActivo(false)}
      hitSlop={escritorio ? 4 : 0}
      {...estadoControlWeb('none')}
      style={{
        minHeight: escritorio ? 28 : 44,
        alignSelf: centrado ? 'center' : 'flex-start',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text
        style={{
          fontSize: escritorio ? 14 : 15,
          color: activo ? '#FFFFFF' : '#B3B3B3',
          textDecorationLine: activo ? 'underline' : 'none',
          textDecorationColor: 'rgba(255,255,255,0.65)',
        }}
      >
        {label}
      </Text>
    </Pressable>
  )
}
