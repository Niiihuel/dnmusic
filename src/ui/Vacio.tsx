import type { VacioProps } from './Vacio.types'
import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useNetworkState } from 'expo-network'
import { ICON_COLOR, IconWifiOff } from './icons'

/**
 * El vacío estándar de la app.
 *
 * Es el `ContentUnavailableView` de iOS 17 traducido a este sistema: un ícono
 * apagado, un título en negrita, la explicación en gris y —cuando hay un
 * próximo paso claro— **una** acción, nunca dos. Es el patrón que la HIG pide
 * para «no hay contenido», «sin resultados» y «sin conexión», y reemplaza a la
 * docena de vacíos artesanales que había, cada uno con su tamaño y su aire.
 *
 * La jerarquía es la de siempre: el ícono en un redondel `muted` (un escalón
 * de luminancia, no un adorno), el título con el peso fuerte del binario
 * 700/400, y la acción como píldora del acento — el único blanco pleno de la
 * pantalla vacía, porque es lo único que hay para hacer.
 */
export function Vacio({
  icono,
  titulo,
  detalle,
  accion,
  compacto = false,
}: VacioProps) {
  return (
    <View className={`items-center gap-2 px-8 ${compacto ? 'py-8' : 'py-16'}`}>
      <View
        className={`items-center justify-center rounded-full bg-muted ${
          compacto ? 'h-12 w-12' : 'h-14 w-14'
        }`}
      >
        {icono}
      </View>
      <Text className="pt-1.5 text-foreground text-center text-body font-semibold">
        {titulo}
      </Text>
      {detalle ? (
        <Text className="max-w-xs text-muted-foreground text-center text-footnote leading-5">
          {detalle}
        </Text>
      ) : null}
      {accion ? (
        <Pressable
          accessibilityRole="button"
          onPress={accion.onPress}
          className="mt-3 rounded-full bg-primary px-6 py-3 active:opacity-80"
        >
          <Text className="text-primary-foreground text-footnote font-semibold">
            {accion.rotulo}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

/** Si el aparato tiene red. `null`/`undefined` cuentan como conectado: ante la
 *  duda no se acusa a la conexión de un error que quizás es nuestro. */
function useConectado(): boolean {
  const estado = useNetworkState()
  return estado.isConnected !== false
}

/**
 * El vacío de una carga que falló.
 *
 * Distingue lo que al usuario le importa distinguir: **sin conexión** no es un
 * error de la app, es su avión o su subte — se dice con el ícono de wifi y un
 * reintento; cualquier otra falla usa el texto que mande la pantalla. En los
 * dos casos hay reintento, porque un vacío de error sin salida es un callejón.
 */
export function VacioError({
  icono,
  titulo,
  detalle,
  onReintentar,
  compacto = false,
}: {
  icono: ReactNode
  titulo: string
  detalle?: string
  onReintentar: () => void
  compacto?: boolean
}) {
  const conectado = useConectado()
  if (!conectado) {
    return (
      <Vacio
        icono={<IconWifiOff size={compacto ? 20 : 22} color={ICON_COLOR.muted} />}
        titulo="Sin conexión"
        detalle="Cuando vuelva internet, esto se llena solo. También podés reintentar."
        accion={{ rotulo: 'Reintentar', onPress: onReintentar }}
        compacto={compacto}
      />
    )
  }
  return (
    <Vacio
      icono={icono}
      titulo={titulo}
      detalle={detalle}
      accion={{ rotulo: 'Reintentar', onPress: onReintentar }}
      compacto={compacto}
    />
  )
}
