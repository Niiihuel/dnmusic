import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { mensajeError } from '../../src/lib/mensajeError'
import { volver } from '../../src/lib/volver'
import { saveMyProfile } from '../../src/services/profile'
import { avisar } from '../../src/state/aviso'
import { setMyProfile, useMyProfile } from '../../src/state/session'
import { usePiso } from '../../src/state/shell'
import { Avatar } from '../../src/ui/Avatar'
import { ANCHO_HOJA, Hoja, useHojaModal } from '../../src/ui/Hoja'
import { aireDelMarco, FAMILIAS_MARCO, Marco, MARCOS } from '../../src/ui/Marco'
import { ICON_COLOR, IconBan, IconCheck } from '../../src/ui/icons'

/**
 * Elegir el marco de la foto: la vidriera de los marcos dibujados.
 *
 * Cada opción se muestra **puesta sobre tu propia foto**, no sobre una de
 * muestra: un marco se elige por cómo te queda, y la única forma de saberlo es
 * verlo puesto. Es lo que hacen Discord y Steam en sus tiendas, sin la tienda —
 * acá los marcos se dibujan (ver `ui/Marco`) y son de todos.
 *
 * Van agrupados por familia con un rótulo por grupo, como los temas en
 * `profile/tema`: dieciocho tarjetas en una sola grilla se escanean, cinco
 * grupos con nombre se recorren. Dos por fila y no tres, porque el marco
 * desborda a la foto y necesita aire alrededor; el bloque de cada familia se
 * centra y el rótulo se alinea con su primera tarjeta.
 *
 * Tocar elige y guarda: no hay botón de confirmar, igual que la foto. La
 * primera opción es «Ninguno», que es una elección tan válida como las otras.
 */

/** El ancho de una tarjeta de opción y el hueco entre dos. */
const TARJETA = 136
const HUECO = 12

/** La foto de muestra dentro de cada tarjeta. */
const FOTO = 72

/**
 * El aire que el marco necesita abajo de la foto para no tocar el nombre: el
 * lienzo desborda `aireDelMarco` por lado, y el `gap` de la tarjeta no alcanza
 * solo. Arriba lo cubre el relleno de la tarjeta.
 */
const AIRE_ABAJO = Math.max(0, aireDelMarco(FOTO) - HUECO + 4)
export default function ElegirMarco() {
  const router = useRouter()
  const perfil = useMyProfile()
  const piso = usePiso(24)
  const modal = useHojaModal()
  const [guardando, setGuardando] = useState<string | null>(null)

  const nombre = perfil?.displayName?.trim() || perfil?.username || '?'
  const actual = perfil?.marco ?? null

  async function elegir(marco: string | null) {
    if (guardando) return
    setGuardando(marco ?? 'ninguno')
    try {
      /* La cadena vacía borra, como el resto de los textos del perfil. */
      const guardado = await saveMyProfile({ marco: marco ?? '' })
      setMyProfile(guardado)
      avisar(marco ? 'Marco puesto' : 'Sin marco')
      volver(router, '/')
    } catch (e) {
      avisar(mensajeError(e), true)
      setGuardando(null)
    }
  }

  return (
    <Hoja medida="contenido">
      <ScrollView
        /* `flexGrow` y no `flex-1`: el modal compacto mide su contenido y un
           flex con base cero colapsa adentro (ver `useHojaModal`). */
        className="bg-background"
        style={{ flexGrow: 1 }}
        contentContainerClassName="gap-5 px-6 pt-6"
        contentContainerStyle={{
          paddingBottom: modal ? 24 : piso,
          maxWidth: ANCHO_HOJA,
          width: '100%',
          alignSelf: 'center',
        }}
      >
        <View className="items-center gap-1">
          <Text className="text-foreground text-[17px] font-bold">El marco de tu foto</Text>
          <Text className="text-muted-foreground text-center text-[12px] leading-4">
            Dibujado alrededor, en todos lados donde tu perfil se muestre grande.
          </Text>
        </View>

        {FAMILIAS_MARCO.map((familia, i) => (
          <View key={familia.id} className="gap-2" style={{ width: TARJETA * 2 + HUECO, alignSelf: 'center' }}>
            <Text className="text-muted-foreground text-[11px] font-semibold uppercase tracking-[1.2px]">
              {familia.titulo}
            </Text>
            <View className="flex-row flex-wrap" style={{ gap: HUECO }}>
              {/* «Ninguno» abre el primer grupo: es la salida del catálogo. */}
              {i === 0 ? (
                <Opcion
                  titulo="Ninguno"
                  elegido={actual === null}
                  guardando={guardando === 'ninguno'}
                  onPress={() => void elegir(null)}
                >
                  <View
                    className="items-center justify-center rounded-full bg-muted"
                    style={{ width: FOTO, height: FOTO, marginBottom: AIRE_ABAJO }}
                  >
                    <IconBan size={22} color={ICON_COLOR.muted} />
                  </View>
                </Opcion>
              ) : null}
              {MARCOS.filter((m) => m.familia === familia.id).map((m) => (
                <Opcion
                  key={m.id}
                  titulo={m.nombre}
                  elegido={actual === m.id}
                  guardando={guardando === m.id}
                  onPress={() => void elegir(m.id)}
                >
                  {/* `overflow: visible` explícito: el marco desborda a la foto
                      y se dibuja por fuera de esta caja. */}
                  <View style={{ marginBottom: AIRE_ABAJO, overflow: 'visible' }}>
                    <Avatar name={nombre} path={perfil?.avatarPath} size={FOTO} />
                    <Marco marco={m.id} size={FOTO} />
                  </View>
                </Opcion>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </Hoja>
  )
}

function Opcion({
  titulo,
  elegido,
  guardando,
  onPress,
  children,
}: {
  titulo: string
  elegido: boolean
  guardando: boolean
  onPress: () => void
  children: React.ReactNode
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Marco ${titulo}`}
      accessibilityState={{ selected: elegido }}
      onPress={onPress}
      className={`items-center gap-3 rounded-2xl px-3 pb-3 pt-5 active:opacity-80 ${
        elegido ? 'bg-muted' : 'bg-card'
      }`}
      style={{ width: TARJETA, overflow: 'visible' }}
    >
      {children}
      <View className="h-5 flex-row items-center gap-1.5">
        {guardando ? (
          <ActivityIndicator size="small" color={ICON_COLOR.muted} />
        ) : (
          <>
            {elegido ? <IconCheck size={12} color={ICON_COLOR.foreground} /> : null}
            <Text
              className={`text-[12px] font-semibold ${
                elegido ? 'text-foreground' : 'text-muted-foreground'
              }`}
            >
              {titulo}
            </Text>
          </>
        )}
      </View>
    </Pressable>
  )
}
