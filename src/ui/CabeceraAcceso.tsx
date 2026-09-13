import type { ReactNode } from 'react'
import { Image, Text, View } from 'react-native'

export type CabeceraAccesoProps = { titulo: string; detalle?: string; escritorio: boolean }

export function CabeceraAcceso({ titulo, detalle, escritorio }: CabeceraAccesoProps) {
  return <View style={{ gap: escritorio ? 8 : 12 }}>
    <Image source={require('../../assets/icon.png')} accessibilityLabel="dnmusic"
      style={{ width: escritorio ? 40 : 48, height: escritorio ? 40 : 48, borderRadius: escritorio ? 10 : 12 }} />
    <Text accessibilityRole="header" className="text-foreground text-title2 font-semibold">{titulo}</Text>
    {detalle ? <Text className="text-muted-foreground text-subheadline">{detalle}</Text> : null}
  </View>
}

export function NotaAcceso({ children }: { children: ReactNode }) {
  return <Text className="text-muted-foreground text-footnote leading-5">{children}</Text>
}
