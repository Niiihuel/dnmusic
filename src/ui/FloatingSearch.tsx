import type { RefObject } from 'react'
import { Keyboard, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated'
import { usePiso } from '../state/shell'
import { BotonVidrio } from './Glass'
import { SearchField } from './SearchField'
import { ICON_COLOR, IconClose } from './icons'

/**
 * El buscador al pie, como el de Apple Music.
 *
 * Flota sobre el contenido en vez de empujarlo, y con el teclado abierto se
 * apoya sobre él. La razón de tenerlo abajo no es estética: en un teléfono el
 * buscador se usa con una mano, y el borde de arriba es el punto más lejos del
 * pulgar. Lo que queda por detrás corre y se difumina a través del vidrio.
 *
 * **Solo se dibuja mientras estás buscando** — con el cursor puesto o con algo
 * escrito. En reposo se va entero: la pantalla ya tiene la lupa a mano (en la
 * barra de pestañas, o en el encabezado de la pantalla donde esté), y dejar el
 * campo dibujado ahí abajo era repetir dos veces el mismo botón, uno arriba del
 * otro, comiéndose el alto de la lista.
 *
 * Quien lo use tiene que darle el foco al entrar —o al tocar la lupa— porque si
 * no, no hay forma de hacerlo aparecer. Ver `activo`.
 */
export function BuscadorFlotante({
  value,
  onChangeText,
  placeholder,
  loading = false,
  inputRef,
  activo,
  onActivoChange,
  onCancel,
  siempre = false,
}: {
  value: string
  onChangeText: (v: string) => void
  placeholder?: string
  loading?: boolean
  inputRef?: RefObject<TextInput | null>
  /** Tiene el cursor. Lo guarda quien lo usa, para poder prenderlo desde afuera. */
  activo: boolean
  onActivoChange: (activo: boolean) => void
  /** Además de limpiar y cerrar el teclado. Sin esto solo hace eso. */
  onCancel?: () => void
  /**
   * Se queda dibujado aunque nadie esté escribiendo.
   *
   * Es para las pantallas **que existen para buscar**: ahí el campo no es una
   * herramienta que se llama, es el contenido. Sin esto, cerrar el teclado lo
   * hacía desaparecer y no quedaba forma de traerlo de vuelta —esas pantallas
   * no tienen la lupa de las pestañas— así que quedabas mirando un cartel que
   * te pedía escribir y ningún lugar donde hacerlo.
   */
  siempre?: boolean
}) {
  const cascara = usePiso()
  /*
   * El margen del teléfono lo pone **este** componente, no la pantalla.
   *
   * Es la misma cuenta que hace `SearchRow` para el buscador de música, y por
   * eso los dos quedan a la misma altura. Cuando la pantalla también reservaba
   * el área segura, el campo se apoyaba sobre ese margen *y* sobre el suyo: 14
   * píxeles más arriba que su hermano, que es la diferencia que se veía al
   * comparar las dos capturas.
   */
  const insets = useSafeAreaInsets()
  const abajo = insets.bottom > 0 ? insets.bottom - 6 : 8
  /* Pegado al teclado real, como la cáscara y como el campo del chat: el mismo
     número en el hilo de la interfaz, así ninguno se queda atrás. */
  const tecladoVivo = useAnimatedKeyboard()
  const sobreTeclado = useAnimatedStyle(() => ({
    transform: [{ translateY: -tecladoVivo.height.value }],
  }))

  // Con algo escrito se queda aunque se cierre el teclado: si no, no habría
  // forma de corregir la búsqueda ni de cancelarla sin volver a empezar.
  if (!siempre && !activo && !value.trim()) return null

  return (
    /* El layout va inline: NativeWind no procesa `className` en componentes
       animados. Ver `docs/DESIGN.md`. */
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: cascara + abajo,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        },
        sobreTeclado,
      ]}
    >
      <View className="min-w-0 flex-1">
        <SearchField
          inputRef={inputRef}
          value={value}
          onChangeText={onChangeText}
          onFocusChange={onActivoChange}
          /* Se monta justo cuando alguien quiere buscar, así que el cursor va
             puesto. Si apareció solo por texto que quedó de antes, no. */
          autoFocus={activo}
          placeholder={placeholder}
          loading={loading}
        />
      </View>
      {/* Redondel y sin texto, como en iOS 26: la ✕ no necesita que le
          expliquen qué hace, y «Cancelar» escrito obligaría al botón a crecer
          hasta comerse el ancho del campo. */}
      <BotonVidrio
        label="Cancelar la búsqueda"
        radius={24}
        style={{ width: 48, height: 48 }}
        onPress={() => {
          onChangeText('')
          inputRef?.current?.blur()
          Keyboard.dismiss()
          onActivoChange(false)
          onCancel?.()
        }}
      >
        <IconClose size={18} color={ICON_COLOR.foreground} />
      </BotonVidrio>
    </Animated.View>
  )
}
