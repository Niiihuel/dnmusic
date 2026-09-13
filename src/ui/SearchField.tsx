import { useImperativeHandle, useRef, useState } from 'react'
import type { SearchFieldProps } from './SearchField.types'
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native'
import { TECLADO_FISICO } from '../lib/teclado'
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

export function SearchField({
  value,
  onChangeText,
  placeholder,
  onSubmit,
  autoFocus,
  loading = false,
  inputRef,
  onFocusChange,
  density = 'regular',
  accessibilityLabel,
}: SearchFieldProps) {
  const input = useRef<TextInput>(null)
  useImperativeHandle(inputRef, () => ({ focus: () => input.current?.focus(), blur: () => input.current?.blur() }), [])
  const [focused, setFocused] = useState(false)
  const compacto = density === 'compact' && TECLADO_FISICO
  const altura = density === 'compact' ? (compacto ? 34 : 44) : 48

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
      style={{ height: altura, minWidth: 0, width: '100%', paddingLeft: compacto ? 10 : 14, paddingRight: compacto ? 3 : 4, gap: compacto ? 7 : 10 }}
      className={`flex-row items-center rounded-full ${
        HAY_VIDRIO && !ES_WEB
          ? ''
          : ES_WEB
            ? focused
              ? 'bg-white/10'
              : ''
            : `bg-muted ${focused ? 'border border-foreground' : 'border border-transparent'}`
      }`}
    >
      <View style={{ flexShrink: 0 }}><IconSearch size={compacto ? 15 : 18} color={ICON_COLOR.muted} /></View>
      <TextInput
        ref={input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        accessibilityLabel={accessibilityLabel ?? placeholder ?? 'Buscar'}
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
        style={{ flex: 1, minWidth: 0, width: 0, height: '100%', padding: 0, fontSize: compacto ? 13 : 15 }}
        className="text-foreground"
      />
      {loading ? (
        <View style={{ width: compacto ? 28 : 44, height: altura, flexShrink: 0, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="small" color="#B3B3B3" /></View>
      ) : value.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Limpiar la búsqueda"
          onPress={() => onChangeText('')}
          style={{ width: compacto ? 28 : 44, height: altura, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: altura / 2 }}
          className="hover:bg-white/10 focus:bg-white/10 active:bg-white/15"
          hitSlop={compacto ? 0 : 4}
        >
          <IconClose size={compacto ? 14 : 16} color={ICON_COLOR.muted} />
        </Pressable>
      ) : null}
    </View>
  )

  /* Sin vidrio se devuelve la píldora tal cual: envolverla igual agregaría un
     contenedor gris redundante detrás del que ya tiene fondo propio. */
  if (!HAY_VIDRIO) return dentro
  return <Glass radius={altura / 2} style={{ minWidth: 0, width: '100%' }}>{dentro}</Glass>
}
