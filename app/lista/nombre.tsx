import { useState } from 'react'
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { volver } from '../../src/lib/volver'
import { createPlaylist } from '../../src/services/playlists'
import { avisar } from '../../src/state/aviso'
import { abrirLista, useKeyboardH, usePiso } from '../../src/state/shell'
import { ANCHO_HOJA, Hoja } from '../../src/ui/Hoja'

/**
 * Ponerle nombre, el segundo paso de crear una lista.
 *
 * El campo **viene escrito** con «Mi lista #N» y con el texto seleccionado: si
 * no se te ocurre nada, tocás «Crear» y listo; si sí, empezás a tipear y se
 * reemplaza sin borrar nada. Un campo vacío obliga a inventar un nombre antes
 * de haber puesto una sola canción, que es el peor momento para pedirlo.
 *
 * Crear es lo último que pasa acá: recién cuando hay nombre se toca la base.
 * Antes la lista nacía al apretar «+» y un arrepentimiento dejaba «Mi lista #4»
 * vacía en la biblioteca para siempre.
 */
export default function NombreDeLista() {
  const router = useRouter()
  const piso = usePiso(24)
  const teclado = useKeyboardH()
  const { sugerido, colaborativa } = useLocalSearchParams<{
    sugerido?: string
    colaborativa?: string
  }>()
  const esColaborativa = colaborativa === '1'

  const [nombre, setNombre] = useState(sugerido || 'Mi lista #1')
  const [creando, setCreando] = useState(false)

  const listo = nombre.trim().length > 0

  async function crear() {
    if (!listo || creando) return
    setCreando(true)
    try {
      const hecha = await createPlaylist(nombre, { colaborativa: esColaborativa })
      /*
       * Abrir la lista antes de cerrar la hoja: `abrirLista` le pide a la
       * pantalla principal que cambie de panel, y esa pantalla está **abajo** de
       * este drawer. Al revés, la hoja se cerraría sobre la portada y la lista
       * aparecería medio segundo después, con un salto a la vista.
       */
      abrirLista(hecha.id)
      if (esColaborativa) {
        // Una lista colaborativa sin nadie adentro es una lista común: el paso
        // que falta es la gente, así que se va derecho ahí en vez de dejarte
        // buscando el botón.
        router.replace({ pathname: '/lista/personas', params: { id: hecha.id } })
        return
      }
      volver(router, '/')
    } catch (e) {
      avisar((e as Error).message, true)
      setCreando(false)
    }
  }

  return (
    <Hoja>
      {/* El fondo va entero y el contenido acotado: si el `bg-background` se
          achicara con el texto, en el formSheet de iOS quedaría el gris del
          sistema asomando a los costados. */}
      <View className="flex-1 bg-background">
      <View
        className="w-full flex-1 justify-center gap-8 self-center px-8"
        style={{ paddingBottom: piso + teclado, maxWidth: ANCHO_HOJA }}
      >
        <Text className="text-foreground text-center text-[17px] font-bold">
          {esColaborativa ? 'Ponele nombre a la lista de todos' : 'Ponele nombre a tu lista'}
        </Text>

        <TextInput
          value={nombre}
          onChangeText={setNombre}
          autoFocus
          selectTextOnFocus
          maxLength={60}
          returnKeyType="done"
          onSubmitEditing={() => void crear()}
          accessibilityLabel="Nombre de la lista"
          placeholder="Mi lista"
          placeholderTextColor="#6A6A6A"
          className="text-foreground border-b border-muted pb-2 text-center text-[26px] font-bold"
        />

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !listo || creando }}
          disabled={!listo || creando}
          onPress={() => void crear()}
          className={`h-12 min-w-[140px] flex-row items-center justify-center gap-2 self-center rounded-full px-8 ${
            listo ? 'bg-primary active:opacity-80' : 'bg-muted'
          }`}
        >
          {creando ? (
            <ActivityIndicator color="#121212" />
          ) : (
            <Text
              className={`text-[15px] font-bold ${
                listo ? 'text-primary-foreground' : 'text-muted-foreground'
              }`}
            >
              Crear
            </Text>
          )}
        </Pressable>
      </View>
      </View>
    </Hoja>
  )
}
