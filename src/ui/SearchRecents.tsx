import { useEffect } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { cargarRecientes, limpiarRecientes, olvidarBusqueda, useRecientes } from '../state/recientes'
import { useKeyboardH, usePiso } from '../state/shell'
import { ICON_COLOR, IconClose, IconSearch } from './icons'

/**
 * Lo último que buscaste, mientras el campo está vacío.
 *
 * Ocupa el lugar donde después van los resultados, así la pestaña nunca está en
 * blanco: entrar a «Buscar» sin haber escrito nada mostraba una pantalla negra
 * con un campo arriba y nada más.
 *
 * **No lleva tarjeta.** Son filas sueltas sobre el fondo, y esa es la
 * diferencia con los resultados: acá el contenido tiene que poder correr por
 * debajo del campo de búsqueda y verse difuminado a través del vidrio. Una caja
 * opaca cortaría eso en seco — es la misma razón por la que los resultados sí
 * la llevan y por eso terminan antes de llegar.
 */
export function SearchRecents({ onPick }: { onPick: (termino: string) => void }) {
  const terminos = useRecientes()
  /* La cáscara ya incluye el campo: mientras buscás, la fila de abajo es él.
     Ver `SearchRow`. */
  const piso = usePiso()
  const teclado = useKeyboardH()

  useEffect(() => {
    void cargarRecientes()
  }, [])

  // Todavía no se leyó del disco: nada que mostrar, ni siquiera el cartel.
  if (terminos === null) return null

  if (terminos.length === 0) {
    return (
      /*
       * Se centra en **lo que se ve**, no en el contenedor.
       *
       * El contenedor llega hasta el borde de abajo —así el contenido pasa por
       * detrás del vidrio—, pero el teclado y la fila del buscador tapan la
       * mitad de abajo. Centrado a secas, el cartel caía justo detrás del
       * campo. Descontando lo tapado queda centrado en el hueco que mirás.
       */
      <View
        className="flex-1 items-center justify-center gap-3 px-10"
        style={{ paddingBottom: piso + teclado }}
      >
        <IconSearch size={34} color={ICON_COLOR.muted} />
        <Text className="text-foreground text-center text-[17px] font-semibold">
          Ninguna búsqueda reciente
        </Text>
        <Text className="text-muted-foreground text-center text-[13px] leading-5">
          Acá van a aparecer las canciones y los artistas que busques.
        </Text>
      </View>
    )
  }

  return (
    <View className="min-h-0 flex-1">
      <View className="flex-row items-center justify-between px-4 pb-1 pt-3">
        <Text className="text-foreground text-[17px] font-bold">Búsquedas recientes</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Limpiar las búsquedas recientes"
          onPress={limpiarRecientes}
          hitSlop={8}
          className="active:opacity-60"
        >
          <Text className="text-muted-foreground text-[13px] font-semibold">Limpiar</Text>
        </Pressable>
      </View>

      <ScrollView
        className="min-h-0 flex-1"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: piso }}
      >
        {terminos.map((termino) => (
          <View key={termino} className="flex-row items-center">
            {/* El término ocupa toda la fila y el «✕» queda afuera del
                Pressable: anidarlo dejaría un botón dentro de otro, que en web
                es HTML inválido y se come el click del de adentro. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Buscar ${termino} otra vez`}
              onPress={() => onPick(termino)}
              className="min-w-0 flex-1 flex-row items-center gap-3 px-4 py-3 active:opacity-60"
            >
              <IconSearch size={17} color={ICON_COLOR.muted} />
              <Text className="min-w-0 flex-1 text-foreground text-[15px]" numberOfLines={1}>
                {termino}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Olvidar ${termino}`}
              onPress={() => olvidarBusqueda(termino)}
              hitSlop={8}
              className="h-11 w-11 items-center justify-center active:opacity-60"
            >
              <IconClose size={15} color={ICON_COLOR.muted} />
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </View>
  )
}
