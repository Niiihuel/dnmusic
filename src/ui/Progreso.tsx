import { Text, View } from 'react-native'

/**
 * Una barra de progreso determinada, como la de iOS: la pista apagada y el
 * relleno blanco pleno —es un estado activo, no un adorno (docs/DESIGN.md)—,
 * con el rótulo debajo cuando hay algo que decir («Subiendo… 43 %»).
 *
 * Va donde algo tarda y se sabe cuánto falta: subir un fondo, un clip. Para
 * lo que no se sabe cuánto falta sigue estando el `ActivityIndicator`.
 */
export function BarraDeProgreso({ valor, rotulo }: { valor: number; rotulo?: string }) {
  const fraccion = Math.max(0, Math.min(1, valor))
  return (
    <View
      className="gap-2"
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(fraccion * 100) }}
    >
      <View className="h-1 overflow-hidden rounded-full bg-muted">
        {/* Nunca a cero: una barra vacía parece rota, no recién empezada. */}
        <View
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.max(2, Math.round(fraccion * 100))}%` }}
        />
      </View>
      {rotulo ? (
        <Text className="text-muted-foreground text-[12px] tabular-nums">{rotulo}</Text>
      ) : null}
    </View>
  )
}

/** «43 %» a partir de una fracción. */
export function porciento(fraccion: number): string {
  return `${Math.round(Math.max(0, Math.min(1, fraccion)) * 100)} %`
}
