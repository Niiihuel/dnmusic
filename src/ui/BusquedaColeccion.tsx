import { useState } from 'react'
import { Keyboard, Platform, Pressable, Text, View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useDerivedValue, withTiming } from 'react-native-reanimated'
import { SearchField } from './SearchField'
import { ICON_COLOR, IconSearch } from './icons'

type Contexto = 'lista' | 'álbum'
type Props = {
  contexto: Contexto
  abierto: boolean
  filtro: string
  onFiltro: (value: string) => void
}

export function useBusquedaColeccion(id: string) {
  const [estado, setEstado] = useState({ id, abierto: false, filtro: '' })
  // Reiniciar antes de renderizar otra colección; un efecto mostraría el filtro viejo un frame.
  if (estado.id !== id) setEstado({ id, abierto: false, filtro: '' })
  return {
    abierto: estado.id === id && estado.abierto,
    filtro: estado.id === id ? estado.filtro : '',
    setFiltro: (filtro: string) => setEstado(actual => ({ ...actual, filtro })),
    alternar: () => {
      if (estado.abierto) Keyboard.dismiss()
      setEstado({ id, abierto: !estado.abierto, filtro: '' })
    },
  }
}

/** En iOS la lupa conserva 44pt; el campo vive en el contenido de la colección. */
export function BuscadorColeccion(props: Props & { vacia: boolean; gestos?: object; onAbrir: () => void }) {
  if (Platform.OS !== 'ios') return <BuscadorExpandible {...props} />
  return <Lupa {...props} />
}

function Lupa({ contexto, abierto, vacia, gestos, onAbrir }: Props & { vacia: boolean; gestos?: object; onAbrir: () => void }) {
  return (
    <Pressable {...gestos} accessibilityRole="button"
      accessibilityLabel={abierto ? 'Cerrar la búsqueda' : `Buscar en ${contexto === 'lista' ? 'la lista' : 'el álbum'}`}
      accessibilityState={{ disabled: vacia, expanded: abierto }}
      onPress={onAbrir} disabled={vacia}
      style={{ width: 44, height: 44, flexShrink: 0, alignItems: 'center', justifyContent: 'center' }}>
      <IconSearch size={19} color={abierto ? ICON_COLOR.foreground : ICON_COLOR.muted} />
    </Pressable>
  )
}

function BuscadorExpandible(props: Props & { vacia: boolean; gestos?: object; onAbrir: () => void }) {
  const p = useDerivedValue(() => withTiming(props.abierto ? 1 : 0,
    { duration: 240, easing: Easing.out(Easing.cubic) }), [props.abierto])
  const ancho = useAnimatedStyle(() => ({ width: 44 + p.value * 256 }))
  return <Animated.View style={[{ height: 48, borderRadius: 999, overflow: 'hidden' }, ancho]}>
    {props.abierto ? <SearchField value={props.filtro} onChangeText={props.onFiltro}
      placeholder={`Buscar en ${props.contexto === 'lista' ? 'esta lista' : 'este álbum'}`} autoFocus
      onFocusChange={focused => { if (!focused && !props.filtro.trim()) props.onAbrir() }} /> : <Lupa {...props} />}
  </Animated.View>
}

export function CampoBusquedaColeccion({ contexto, abierto, filtro, onFiltro, onCerrar, siempreVisible = false }: Props & { onCerrar: () => void; siempreVisible?: boolean }) {
  if (Platform.OS !== 'ios' || (!abierto && !siempreVisible)) return null
  const cancelar = () => {
    if (siempreVisible) {
      onFiltro('')
      Keyboard.dismiss()
    } else onCerrar()
  }
  const placeholder = `Buscar en ${contexto === 'lista' ? 'esta lista' : 'este álbum'}`
  return <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <SearchField value={filtro} onChangeText={onFiltro} placeholder={placeholder}
            accessibilityLabel={placeholder} autoFocus={!siempreVisible} onSubmit={Keyboard.dismiss} />
        </View>
        {abierto || filtro ?
        <Pressable accessibilityRole="button" accessibilityLabel="Cancelar búsqueda" onPress={cancelar}
          style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 }}>
          <Text style={{ color: ICON_COLOR.foreground, fontSize: 17 }}>Cancelar</Text>
        </Pressable> : null}
      </View>
  </View>
}
