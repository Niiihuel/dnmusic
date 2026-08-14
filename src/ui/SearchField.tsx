import { useState, type RefObject } from 'react'
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native'
import { ES_WEB, Glass, HAY_VIDRIO } from './Glass'
import { ICON_COLOR, IconClose, IconSearch } from './icons'

/**
 * Campo de búsqueda al estilo del de Spotify: píldora, lupa a la izquierda,
 * botón de limpiar a la derecha y anillo al enfocar. No hay botón "Buscar" —
 * la búsqueda se dispara sola mientras se escribe.
 *
 * En iOS 26 la píldora es vidrio, que es lo que hace el sistema con sus propios
 * campos de búsqueda. Dónde luce depende de qué tenga detrás: colgado del
 * encabezado, sobre la lista de conversaciones, se le ve el material; en la
 * pestaña «Buscar» está arriba de los resultados y no sobre ellos, así que ahí
 * se lee más sobrio. Es la diferencia de siempre — el vidrio necesita algo que
 * difuminar.
 *
 * Enfocado se sigue marcando con el anillo blanco: el material no distingue
 * enfocado de en reposo, y sin el anillo no habría forma de ver dónde está el
 * cursor.
 */
type Props = {
  value: string
  onChangeText: (v: string) => void
  placeholder?: string
  onSubmit?: () => void
  autoFocus?: boolean
  loading?: boolean
  /**
   * Para que otra pantalla pueda mandar el cursor acá.
   *
   * Lo usa la lista vacía: en vez de tener su propio buscador adentro, apunta
   * al de arriba, que es el único de la app.
   */
  inputRef?: RefObject<TextInput | null>
  /** Avisa cuándo tiene el cursor: lo mira quien dibuja el «cancelar». */
  onFocusChange?: (focused: boolean) => void
}

export function SearchField({
  value,
  onChangeText,
  placeholder,
  onSubmit,
  autoFocus,
  loading = false,
  inputRef,
  onFocusChange,
}: Props) {
  const [focused, setFocused] = useState(false)

  const dentro = (
    <View
      /*
       * Con vidrio **no lleva anillo al enfocar**.
       *
       * El anillo blanco existía para una píldora gris plana, donde nada más
       * decía que el cursor estaba ahí. Sobre el material sobra y encima
       * molesta: le dibuja un borde duro justo a la pieza cuya gracia es no
       * tener uno, y `docs/DESIGN.md` pide no separar con líneas lo que ya se
       * separa solo. El teclado abierto y el cursor titilando lo dicen de
       * sobra.
       *
       * En web tampoco: la línea blanca alrededor del campo era lo más duro de
       * toda la pantalla. El foco se dice como pide DESIGN.md — por
       * luminancia: la píldora se aclara un paso con el cursor adentro, y el
       * cursor titilando hace el resto. Solo sin vidrio (Android) queda el
       * anillo, porque ahí sigue siendo la única señal.
       */
      className={`h-12 flex-row items-center gap-3 rounded-full px-4 ${
        HAY_VIDRIO && !ES_WEB
          ? ''
          : ES_WEB
            ? focused
              ? 'bg-white/10'
              : ''
            : `bg-muted ${focused ? 'border border-foreground' : 'border border-transparent'}`
      }`}
    >
      <IconSearch size={18} color={ICON_COLOR.muted} />
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#B3B3B3"
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={autoFocus}
        returnKeyType="search"
        onSubmitEditing={onSubmit}
        onFocus={() => {
          setFocused(true)
          onFocusChange?.(true)
        }}
        onBlur={() => {
          setFocused(false)
          onFocusChange?.(false)
        }}
        className="flex-1 text-foreground text-[15px]"
      />
      {loading ? (
        <ActivityIndicator size="small" color="#B3B3B3" />
      ) : value.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Limpiar la búsqueda"
          onPress={() => onChangeText('')}
          hitSlop={10}
        >
          <IconClose size={16} color={ICON_COLOR.muted} />
        </Pressable>
      ) : null}
    </View>
  )

  /* Sin vidrio se devuelve la píldora tal cual: envolverla igual agregaría un
     contenedor gris redundante detrás del que ya tiene fondo propio. */
  if (!HAY_VIDRIO) return dentro
  return <Glass radius={24}>{dentro}</Glass>
}
