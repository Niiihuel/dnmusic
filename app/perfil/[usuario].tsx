import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Panel } from '../../src/ui/Panel'
import { BotonVidrio } from '../../src/ui/Glass'
import { alturaDeHeroe, FondoPerfil, Identidad, Vitrinas } from '../../src/ui/PerfilPublico'
import { ListasPerfil } from '../../src/ui/ListasPerfil'
import { EscuchaConReacciones, ParedDeReacciones } from '../../src/ui/Reacciones'
import { FilaSostener } from '../../src/ui/Mantener'
import { Vacio } from '../../src/ui/Vacio'
import { ICON_COLOR, IconBack, IconBan, IconUser } from '../../src/ui/icons'
import { fetchProfile, type Profile } from '../../src/services/profile'
import { blockUser } from '../../src/services/contacts'
import { refreshConversations, useMyProfile } from '../../src/state/session'
import { avisar } from '../../src/state/aviso'
import { mensajeError } from '../../src/lib/mensajeError'
import { usePiso } from '../../src/state/shell'
import { volver } from '../../src/lib/volver'

const MAX_W = 520
const ANCHO_PX = 900

/**
 * El perfil de otra persona.
 *
 * Es la misma vista que la tuya menos lo que no le corresponde a quien mira: no
 * hay botón de editar, las vitrinas van sin controles y el resumen no está —esos
 * números son de la biblioteca de uno, que no se comparte—.
 *
 * Reusa `Identidad`, `FondoPerfil` y `Vitrinas` tal cual. Que sean los mismos
 * componentes no es prolijidad: es lo que garantiza que tu perfil se vea igual
 * mirándolo vos que mirándolo otro, que es lo único que un perfil promete.
 */
export default function PerfilAjeno() {
  const { usuario } = useLocalSearchParams<{ usuario?: string }>()
  const router = useRouter()
  const yo = useMyProfile()
  const piso = usePiso(24)
  const { width, height: alto } = useWindowDimensions()
  const ancho = width >= ANCHO_PX

  /*
   * El perfil se guarda **junto al usuario que se pidió**.
   *
   * Así «todavía no llegó» es simplemente «lo que tengo no es de este usuario»,
   * sin tener que limpiarlo desde un efecto — y una respuesta que llega tarde
   * nunca se muestra bajo el nombre equivocado. Es el mismo criterio que usan
   * el álbum, el artista y la lista abierta.
   *
   * De paso: `undefined` acá significa «todavía no sé» y `null` «no hay». Sin
   * esa diferencia, el cartel de «no hay nada para ver» parpadearía en cada
   * apertura antes de que llegue la respuesta.
   */
  const [cargado, setCargado] = useState<{ usuario: string; perfil: Profile | null } | null>(null)
  const fresco = !!usuario && cargado?.usuario === usuario
  const perfil = fresco ? cargado.perfil : undefined

  useEffect(() => {
    if (!usuario || fresco) return
    let vivo = true
    fetchProfile(usuario)
      .then((p) => vivo && setCargado({ usuario, perfil: p }))
      .catch(() => vivo && setCargado({ usuario, perfil: null }))
    return () => {
      vivo = false
    }
  }, [usuario, fresco])

  /* Sube al mandar una reacción: es lo que hace que la pared se relea sin
     recargar el perfil entero. */
  const [reaccion, setReaccion] = useState(0)

  const nombre = perfil?.displayName?.trim() || perfil?.username || ''
  /* Mirándote a vos mismo desde acá, la pantalla sigue siendo la de otro: es
     justamente la forma de ver cómo te ven. */
  const soyYo = !!perfil && perfil.userId === yo?.userId

  async function bloquear() {
    if (!perfil) return
    try {
      await blockUser(perfil.userId)
      /* La conversación con esta cuenta sale de la bandeja; refrescarla acá
         evita que quede a la vista hasta el próximo mensaje de cualquiera. */
      await refreshConversations().catch(() => {})
      avisar(`Bloqueaste a @${perfil.username}`)
      volver(router, '/')
    } catch (e) {
      avisar(mensajeError(e), true)
    }
  }

  return (
    <SafeAreaView
      className={`flex-1 ${ancho ? 'bg-canvas' : 'bg-background'}`}
      edges={ancho ? ['top', 'bottom'] : ['top']}
    >
      <View className={`flex-1 ${ancho ? 'gap-2 p-2' : ''}`}>
        {/* En el teléfono la cabecera se queda: se llegó acá tocando a alguien
            y hace falta la salida, y el @usuario dice de quién es el perfil que
            estás mirando. En escritorio la franja negra cortaba la imagen a
            sangre, así que la salida flota sobre ella. */}
        {ancho ? null : (
          <View className="flex-row items-center gap-3 px-3 py-1">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Volver"
              onPress={() => volver(router, '/')}
              className="h-11 w-11 items-center justify-center rounded-full active:bg-muted"
            >
              <IconBack size={19} color={ICON_COLOR.foreground} />
            </Pressable>
            <Text className="text-foreground text-[15px] font-semibold">
              {perfil ? `@${perfil.username}` : 'Perfil'}
            </Text>
          </View>
        )}

        <Panel className="flex-1">
          <FondoPerfil
            bannerPath={perfil?.bannerPath ?? null}
            encuadre={perfil?.bannerEncuadre ?? null}
          />

          {ancho ? (
            <View className="absolute left-4 top-4 z-10">
              <BotonVidrio
                onPress={() => volver(router, '/')}
                label="Volver"
                radius={22}
                style={{ height: 44, width: 44 }}
              >
                <IconBack size={19} color={ICON_COLOR.foreground} />
              </BotonVidrio>
            </View>
          ) : null}

          <ScrollView
            contentContainerClassName="items-center px-4"
            /* Con fondo, la primera pantalla es de la imagen y el contenido
               arranca abajo, scrolleando por encima (`alturaDeHeroe`). Sin
               fondo, el arranque compacto de siempre: en escritorio debajo del
               redondel de volver, que flota sobre la imagen. */
            contentContainerStyle={{
              paddingTop: alturaDeHeroe(alto, perfil?.bannerPath, ancho ? 72 : 24),
              paddingBottom: piso,
            }}
          >
            {perfil === undefined ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : perfil === null ? (
              /*
               * Un solo cartel para «no existe» y para «está en privado».
               *
               * La función de la base devuelve lo mismo en los dos casos a
               * propósito: «existe pero no te deja ver» ya es información sobre
               * alguien que decidió no mostrarse. Acá no se puede distinguir, y
               * está bien que así sea.
               */
              <Vacio
                icono={<IconUser size={24} color={ICON_COLOR.muted} />}
                titulo="No hay nada para ver"
                detalle="Puede que esa cuenta no exista o que su perfil esté en privado."
                accion={{ rotulo: 'Volver', onPress: () => volver(router, '/') }}
              />
            ) : (
              <View className="w-full gap-7" style={{ maxWidth: ancho ? 720 : MAX_W }}>
                {/* Misma banda que en el perfil propio: acostada en escritorio,
                    apilada y centrada en el teléfono. Que las dos pantallas se
                    vean igual es el punto de compartir `Identidad`. */}
                <Identidad
                  nombre={nombre}
                  usuario={perfil.username}
                  avatarPath={perfil.avatarPath}
                  encuadre={perfil.avatarEncuadre}
                  bio={perfil.bio ?? ''}
                  centrado={!ancho}
                  banda={ancho}
                />

                {/* Lo que está sonando en su casa, con los emojis al lado: es
                    lo más vivo que tiene un perfil y por eso va arriba de todo.
                    Se dibuja solo si sos su contacto y hay algo sonando. */}
                {soyYo ? null : (
                  <EscuchaConReacciones
                    ownerId={perfil.userId}
                    nombre={nombre}
                    onReaccion={() => setReaccion((n) => n + 1)}
                  />
                )}

                <ParedDeReacciones
                  ownerId={perfil.userId}
                  recarga={reaccion}
                  propio={soyYo}
                  nombre={nombre}
                />

                <Vitrinas
                  ownerId={perfil.userId}
                  recarga={0}
                  onCambio={() => undefined}
                  propio={false}
                  vacio={
                    <View className="items-center px-6 py-8">
                      <Text className="text-muted-foreground text-center text-[13px] leading-5">
                        {soyYo
                          ? 'Todavía no fijaste nada en tu perfil.'
                          : `${nombre} todavía no fijó nada.`}
                      </Text>
                    </View>
                  }
                />

                {/* El estante, debajo de lo destacado: las vitrinas eligen qué
                    mostrar arriba de todo, y esto es todo lo que publicó. */}
                <ListasPerfil
                  ownerId={perfil.userId}
                  nombre={nombre}
                  propio={soyYo}
                  onAbrir={(lista) => router.push(`/lista/${lista.id}`)}
                />

                {/* Bloquear vive al fondo del perfil: es la pantalla de esa
                    persona, y es una decisión sobre esa persona. Se sostiene,
                    como todo lo que saca algo de tu vista. Se deshace desde
                    Ajustes → Bloqueados. */}
                {soyYo ? null : (
                  <View className="overflow-hidden rounded-2xl bg-card">
                    <FilaSostener
                      rotulo={`Bloquear a @${perfil.username}`}
                      detalle="No van a poder escribirse ni encontrarse en la búsqueda."
                      icono={<IconBan size={17} color={ICON_COLOR.muted} />}
                      onCompletar={() => void bloquear()}
                      ultima
                    />
                  </View>
                )}
              </View>
            )}
          </ScrollView>
        </Panel>
      </View>
    </SafeAreaView>
  )
}
