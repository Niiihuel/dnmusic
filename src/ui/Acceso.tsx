import { forwardRef, type ReactNode } from 'react'
import { Image, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View, type TextInputProps } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { ScrollArea } from './ScrollArea'
import { ICON_COLOR, IconEye, IconEyeOff } from './icons'

/** El formulario conserva su ancho; el scroll cede espacio al teclado y a ventanas bajas. */
export function PantallaAcceso({ titulo, detalle, children }: { titulo: string; detalle?: string; children: ReactNode }) {
  return <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom', 'left', 'right']}>
    <LinearGradient pointerEvents="none" colors={['#222222', '#121212']} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 400 }} />
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="min-h-0 flex-1">
      <ScrollArea keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
        contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 24 }}>
        <View style={{ width: '100%', maxWidth: 420, gap: 24 }}>
          <View className="gap-3">
            <Image source={require('../../assets/icon.png')} accessibilityLabel="dnmusic" style={{ width: 48, height: 48, borderRadius: 12 }} />
            <Text accessibilityRole="header" className="text-foreground text-[26px] font-semibold">{titulo}</Text>
            {detalle ? <Text className="text-muted-foreground text-[15px] leading-6">{detalle}</Text> : null}
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
  return <View className="gap-2">
    <Text className="text-foreground text-[15px] font-medium">{label}</Text>
    <View className="min-h-12 flex-row items-center rounded-xl bg-muted pl-4 pr-1">
      <TextInput {...input} ref={ref} accessibilityLabel={label} secureTextEntry={password && !visible}
        placeholderTextColor="#999" className="min-h-12 min-w-0 flex-1 text-foreground text-[16px]"
        autoCapitalize="none" autoCorrect={false} />
      {accessory ? <View className="h-11 w-11 items-center justify-center">{accessory}</View> : null}
      {password ? <Pressable accessibilityRole="button" accessibilityLabel={visible ? `Ocultar ${label.toLowerCase()}` : `Mostrar ${label.toLowerCase()}`}
        accessibilityState={{ disabled: input.editable === false }} disabled={input.editable === false} onPress={onToggleVisible}
        className="h-11 w-11 items-center justify-center rounded-lg active:opacity-70">
        {visible ? <IconEyeOff size={18} color={ICON_COLOR.muted} /> : <IconEye size={18} color={ICON_COLOR.muted} />}
      </Pressable> : null}
    </View>
    {error || hint ? <Text accessibilityRole={error ? 'alert' : undefined} accessibilityLiveRegion="polite"
      className="text-muted-foreground text-[13px] leading-5">{error || hint}</Text> : null}
  </View>
})
