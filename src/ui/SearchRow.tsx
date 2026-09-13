import { IconButton } from './IconButton'
import type { SearchFieldHandle } from './SearchField.types'
import { Keyboard, View } from 'react-native'
import { useRef } from 'react'
import Animated, { interpolate, useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { cerrarBusqueda, setActivo, setTermino, usePista, useTermino } from '../state/busqueda'
import { useRouter } from 'expo-router'
import { setTab, useKeyboardH } from '../state/shell'
import { SearchField } from './SearchField'
import { ICON_COLOR, IconClose, IconHome } from './icons'

/**
 * El buscador, en el lugar de la barra de pestañas.
 *
 * Mientras buscás, esta fila **reemplaza** a las pestañas: casa, campo y ✕, una
 * sola línea debajo del reproductor. Es la forma de Apple Music, y la razón es
 * de espacio — con las pestañas dibujadas quedaban tres franjas de cáscara
 * apiladas, campo, reproductor y barra, comiéndose media pantalla justo cuando
 * lo único que querés ver son resultados.
 *
 * Va acá, en el layout, y no adentro de la pantalla: es la misma franja que
 * ocupa la barra de pestañas, y dos componentes de árboles distintos no pueden
 * compartir una fila. Lo que se escribe viaja por `state/busqueda`, que es lo
 * que permitió mudarla sin que la pantalla pierda el control de qué se busca.
 *
 * La casa no es «volver»: es salir de la búsqueda por la puerta grande. Te deja
 * en la portada y devuelve la barra entera, que es lo que uno espera después de
 * haber estado buscando.
 */
export function SearchRow() {
  const insets = useSafeAreaInsets()
  const termino = useTermino()
  const pista = usePista()
  const input = useRef<SearchFieldHandle>(null)
  const teclado = useKeyboardH()
  const router = useRouter()

  /*
   * El margen de abajo depende de si el teclado está puesto.
   *
   * En reposo, el campo respeta el área segura: debajo está el indicador del
   * iPhone y apoyarse ahí lo pisa. Con el teclado abierto esa franja queda
   * **tapada por el teclado**, así que reservarla igual dejaba el campo
   * flotando a casi treinta píxeles de las teclas — puro aire muerto.
   *
   * Se interpola sobre el alto real del teclado, en el hilo de la interfaz,
   * para que el margen se achique mientras el teclado sube — un cambio seco al
   * llegar se vería como un salto del campo dentro de la fila que ya se está
   * moviendo. Y por eso es un `Animated.View` con el estilo inline: NativeWind
   * no procesa clases en componentes animados (ver `docs/DESIGN.md`).
   */
  const reposo = insets.bottom > 0 ? insets.bottom - 6 : 8
  const tecladoVivo = useAnimatedKeyboard()
  const alPie = useAnimatedStyle(() => ({
    paddingBottom: interpolate(tecladoVivo.height.value, [0, 60], [reposo, 8], 'clamp'),
  }))

  return (
    <Animated.View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 12,
        },
        alPie,
      ]}
    >
      {/*
       * La casa no está mientras escribís.
       *
       * Con el teclado abierto no hay a dónde ir: estás en el medio de escribir
       * una búsqueda, y salir al inicio es lo último que vas a querer —además
       * de ser el botón más fácil de tocar por error con el pulgar ahí abajo—.
       * Vuelve al cerrarse el teclado, que es cuando mirás resultados y recién
       * ahí tiene sentido irse. Es lo que hace Apple Music.
       */}
      {teclado > 0 ? null : (
        <IconButton label="Volver al inicio" symbol="house" onPress={() => {
            cerrarBusqueda()
            Keyboard.dismiss()
            setTab('inicio')
            /*
             * Además de cambiar de pestaña, se sale de lo que haya apilado.
             *
             * Buscando desde una pantalla empujada —el buscador del editor de
             * perfil, por ejemplo— cambiar la pestaña no movía nada: la pantalla
             * de arriba seguía puesta y la casa parecía no hacer nada. Volver a
             * la raíz es lo que el botón promete.
             */
            router.replace('/')
          }} variant="glass" lado={48} icon={<IconHome size={21} color={ICON_COLOR.foreground} />} />
      )}

      <View className="min-w-0 flex-1">
        <SearchField
          inputRef={input}
          value={termino}
          onChangeText={setTermino}
          onFocusChange={(f) => {
            /* Perder el cursor **no** cierra la búsqueda si hay algo escrito:
               al arrastrar la lista el teclado se va, y ahí uno está mirando
               resultados, no saliendo. */
            if (f) setActivo(true)
            else if (!termino.trim()) setActivo(false)
          }}
          /* La fila aparece justo cuando alguien quiere buscar. */
          autoFocus
          placeholder={pista}
        />
      </View>

      {/* Redondel y sin texto, como en iOS 26: la ✕ no necesita explicación, y
          «Cancelar» escrito obligaría al botón a comerse el ancho del campo. */}
      <IconButton label="Cancelar la búsqueda" symbol="xmark" onPress={() => {
          cerrarBusqueda()
          Keyboard.dismiss()
        }} variant="glass" lado={48} icon={<IconClose size={18} color={ICON_COLOR.foreground} />} />
    </Animated.View>
  )
}
