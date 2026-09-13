import { BotonSuperficie } from '../../src/ui/BotonSuperficie'
import { EntradaTexto } from '../../src/ui/EntradaTexto'
import { useState } from 'react'
import { ActivityIndicator, Image, ScrollView, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { mensajeError } from '../../src/lib/mensajeError'
import { pickImage, type PickedImage } from '../../src/lib/pickImage'
import { volver } from '../../src/lib/volver'
import { createPlaylist, uploadCover } from '../../src/services/playlists'
import { avisar } from '../../src/state/aviso'
import { useUser } from '../../src/state/session'
import { abrirLista, useKeyboardH, usePiso } from '../../src/state/shell'
import { FilaInterruptor, GrupoAjustes } from '../../src/ui/Ajustes'
import { BotonConfirmar, BotonHoja, EncabezadoHoja } from '../../src/ui/EncabezadoHoja'
import { ANCHO_HOJA, Hoja, useHojaModal } from '../../src/ui/Hoja'
import { ICON_COLOR, IconImage } from '../../src/ui/icons'

/** El lado de la portada en la hoja: grande, es lo primero que se ve. */
const LADO_PORTADA = 168

/**
 * Crear una lista, en **una** hoja: la portada, el nombre y si es colaborativa.
 *
 * Es la «Nueva playlist» de Apple Music. Antes eran dos hojas —elegir la clase
 * y ponerle nombre— y la primera existía por una razón real: una lista
 * colaborativa se comparte con gente y esa decisión no es un nombre. Pero una
 * hoja entera para una pregunta de sí o no es una pantalla de más; la
 * pregunta cabe como interruptor debajo del nombre, con su consecuencia
 * escrita, y se lee igual de claro.
 *
 * El campo **viene escrito** con «Mi lista #N» y seleccionado: si no se te
 * ocurre nada, tocás la marca y listo; si sí, empezás a tipear y se reemplaza
 * sin borrar nada. Un campo vacío obliga a inventar un nombre antes de haber
 * puesto una sola canción, que es el peor momento para pedirlo.
 *
 * Crear es lo último que pasa acá: recién al confirmar se toca la base, y la
 * portada se sube después de que la lista existe. Arrepentirse antes no deja
 * nada — ni una «Mi lista #4» vacía ni una foto huérfana en Storage.
 */
export default function NuevaLista() {
  const router = useRouter()
  const piso = usePiso(24)
  const teclado = useKeyboardH()
  const modal = useHojaModal()
  const user = useUser()
  /* El nombre sugerido lo calcula la pantalla principal, que ya tiene la
     biblioteca en memoria: pedirla de nuevo acá sería un viaje a la red para
     escribir un número. */
  const { sugerido } = useLocalSearchParams<{ sugerido?: string }>()

  const [nombre, setNombre] = useState(sugerido || 'Mi lista #1')
  const [colaborativa, setColaborativa] = useState(false)
  const [portada, setPortada] = useState<PickedImage | null>(null)
  const [creando, setCreando] = useState(false)

  const listo = nombre.trim().length > 0

  async function elegirPortada() {
    try {
      const elegida = await pickImage({ cuadrada: true })
      if (elegida) setPortada(elegida)
    } catch (e) {
      avisar(mensajeError(e), true)
    }
  }

  async function crear() {
    if (!listo || creando) return
    setCreando(true)
    try {
      const hecha = await createPlaylist(nombre, { colaborativa })
      if (portada && user) {
        /* La portada no puede frenar la lista: si falla, la lista ya existe y
           se avisa; cambiarla es un toque desde la lista misma. */
        await uploadCover(user.id, hecha.id, portada.blob, portada.fileName, portada.mime).catch(
          (e: unknown) => avisar(`La lista se creó, pero la portada no: ${mensajeError(e)}`, true),
        )
      }
      /*
       * Abrir la lista antes de cerrar la hoja: `abrirLista` le pide a la
       * pantalla principal que cambie de panel, y esa pantalla está **abajo** de
       * este drawer. Al revés, la hoja se cerraría sobre la portada y la lista
       * aparecería medio segundo después, con un salto a la vista.
       */
      abrirLista(hecha.id)
      if (colaborativa) {
        // Una lista colaborativa sin nadie adentro es una lista común: el paso
        // que falta es la gente, así que se va derecho ahí en vez de dejarte
        // buscando el botón.
        router.replace({ pathname: '/lista/personas', params: { id: hecha.id, nombre: hecha.name } })
        return
      }
      volver(router, '/')
    } catch (e) {
      avisar(mensajeError(e), true)
      setCreando(false)
    }
  }

  return (
    <Hoja>
      {/* El fondo va entero y el contenido acotado: si el `bg-background` se
          achicara con el texto, en el formSheet de iOS quedaría el gris del
          sistema asomando a los costados. */}
      <View className="flex-1 bg-background">
        <View className="w-full flex-1 self-center" style={{ maxWidth: ANCHO_HOJA }}>
          <EncabezadoHoja
            titulo="Nueva lista"
            izquierda={<BotonHoja tipo="cerrar" onPress={() => volver(router, '/')} />}
            derecha={
              <BotonConfirmar
                label="Crear la lista"
                activo={listo}
                ocupado={creando}
                onPress={() => void crear()}
              />
            }
          />
          <ScrollView
            className="flex-1"
            keyboardShouldPersistTaps="handled"
            contentContainerClassName="items-center gap-6 px-5 pt-2"
            contentContainerStyle={{ paddingBottom: (modal ? 24 : piso) + teclado }}
          >
            {/*
             * La portada, primera y grande: es lo que va a identificar a la
             * lista en la biblioteca. Vacía muestra el hueco con el disco del
             * acento adentro —«acá va una imagen»—; con una elegida, la
             * imagen. Cambiarla después sigue siendo un toque sobre la tapa.
             */}
            <BotonSuperficie
              accessibilityRole="button"
              accessibilityLabel={portada ? 'Cambiar la portada' : 'Elegir una portada'}
              onPress={() => void elegirPortada()}
              className="items-center justify-center overflow-hidden rounded-2xl bg-card active:opacity-80"
              style={{ width: LADO_PORTADA, height: LADO_PORTADA }}
            >
              {portada?.uri ? (
                <Image
                  source={{ uri: portada.uri }}
                  style={{ width: LADO_PORTADA, height: LADO_PORTADA }}
                />
              ) : (
                <View className="h-14 w-14 items-center justify-center rounded-full bg-primary">
                  <IconImage size={22} color={ICON_COLOR.onPrimary} />
                </View>
              )}
            </BotonSuperficie>

            <View className="w-full items-center">
              <EntradaTexto
                value={nombre}
                onChangeText={setNombre}
                autoFocus
                selectTextOnFocus
                maxLength={60}
                returnKeyType="done"
                onSubmitEditing={() => void crear()}
                accessibilityLabel="Nombre de la lista"
                placeholder="Nombre de la lista"
                placeholderTextColor="#6A6A6A"
                className="w-full text-center text-title2 font-semibold text-foreground"
              />
              {/* La única línea de la hoja: el subrayado del campo, como en el
                  referente. Es un campo de texto y esa es su forma; no separa
                  superficies. */}
              <View className="mt-3 h-px w-full bg-muted" />
            </View>

            <View className="w-full">
              <GrupoAjustes>
                <FilaInterruptor
                  rotulo="Lista colaborativa"
                  detalle="Quienes entren pueden sumar canciones y sacar las que sobren. Después elegís a quién invitar."
                  activo={colaborativa}
                  onCambiar={setColaborativa}
                  ultima
                />
              </GrupoAjustes>
            </View>

            {creando ? (
              <View className="flex-row items-center gap-2">
                <ActivityIndicator size="small" color={ICON_COLOR.muted} />
                <Text className="text-muted-foreground text-caption1">
                  {portada ? 'Creando la lista y subiendo la portada…' : 'Creando la lista…'}
                </Text>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Hoja>
  )
}
