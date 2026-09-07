import { CabeceraPerfil, SuperficiePerfil, FondoEstiloPerfil } from '../../src/ui/TarjetaPerfil'
import { FuentePerfil, TextoPerfil as Text } from '../../src/ui/FuentePerfil'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, useWindowDimensions, View } from 'react-native'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Panel } from '../../src/ui/Panel'
import { BotonVidrio } from '../../src/ui/Glass'
import {
  alturaDeHeroe,
  Resumen,
  useCuantasVitrinas,
  Vitrinas,
} from '../../src/ui/PerfilPublico'
import {
  pestanaInicial,
  PestanasPerfil,
  Reciente,
  type PestanaPerfil,
} from '../../src/ui/PestanasPerfil'
import { EscuchaConReacciones } from '../../src/ui/Reacciones'
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
/** Tope de las dos columnas en escritorio, el mismo que en el perfil propio. */
const CAP_ANCHO = 1100

/**
 * El perfil de otra persona.
 *
 * Es la misma vista que la tuya menos lo que no le corresponde a quien mira: no
 * hay botón de editar y las vitrinas van sin controles. Estadísticas usa los
 * agregados públicos; omite los conteos de la biblioteca privada.
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

  /* La pestaña elegida con el dedo; `null` deja mandar a `pestanaInicial`:
     «Space» si tiene piezas, «Reciente» si no. Ver `ui/PestanasPerfil`. */
  const [elegida, setElegida] = useState<PestanaPerfil | null>(null)
  const cuantasVitrinas = useCuantasVitrinas(perfil?.userId ?? '', 0)
  const pestana = elegida ?? pestanaInicial(cuantasVitrinas)

  /*
   * Al recuperar el foco se vuelve a pedir el perfil, **sin vaciar lo que se
   * ve**: la respuesta reemplaza cuando llega. Vaciar primero haría parpadear
   * la pantalla entera para confirmar algo que casi siempre no cambió.
   *
   * Existe por la edición: guardás un encuadre o un fondo, volvés atrás, y lo
   * que mira esta pantalla es su copia cacheada de antes. El primer foco se
   * saltea — es el montaje y el efecto de carga ya corrió.
   */
  const primerFoco = useRef(true)
  useFocusEffect(
    useCallback(() => {
      if (primerFoco.current) {
        primerFoco.current = false
        return
      }
      if (!usuario) return
      let vivo = true
      fetchProfile(usuario)
        .then((p) => vivo && setCargado({ usuario, perfil: p }))
        .catch(() => {})
      return () => {
        vivo = false
      }
    }, [usuario]),
  )

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

  /*
   * Las tres piezas que reparten las dos pantallas —dos columnas y pestañas—
   * se arman una sola vez acá, y cada layout las acomoda.
   */

  /* Mantener apretada una pieza abre la fila de emojis para reaccionarle: es
     el gesto del Space de Airbuds. Mirándote a vos mismo no, que a lo propio
     no se le reacciona. */
  const vitrinas = perfil ? (
    <Vitrinas
      ownerId={perfil.userId}
      recarga={0}
      onCambio={() => undefined}
      temaGlobal={perfil.tema}
      reaccionable={!soyYo}
      /* El usuario viaja también: la pantalla del sub-space lo necesita para
         pedir el tema del perfil, que solo se lee por nombre de usuario. */
      onAbrirSubspace={(v) =>
        router.push({
          pathname: '/profile/subspace',
          params: { owner: perfil.userId, id: v.id, usuario: perfil.username },
        })
      }
      vacio={
        <View className="items-center px-6 py-8">
          <Text className="text-muted-foreground text-center text-[13px] leading-5">
            {soyYo ? 'Todavía no fijaste nada en tu perfil.' : `${nombre} todavía no fijó nada.`}
          </Text>
        </View>
      }
    />
  ) : null

  /* Lo que está sonando en su casa, con los emojis al lado, arriba de todo lo
     reciente: es lo más vivo que tiene un perfil. Se dibuja solo si sos su
     contacto y hay algo sonando, y nunca mirándote a vos mismo. */
  const reciente = perfil ? (
    <Reciente
      ownerId={perfil.userId}
      nombre={nombre}
      propio={soyYo}
      sinResumen
      recarga={reaccion}
      onAbrirLista={(lista) => router.push(`/lista/${lista.id}`)}
      escucha={
        soyYo ? null : (
          <EscuchaConReacciones
            ownerId={perfil.userId}
            nombre={nombre}
            onReaccion={() => setReaccion((n) => n + 1)}
          />
        )
      }
    />
  ) : null

  const resumen = perfil ? <Resumen ownerId={perfil.userId} marcoPerfil={perfil.marcoPerfil}
    vitrinas={cuantasVitrinas} desde={perfil.createdAt} /> : null

  /* Bloquear vive al fondo del perfil, fuera de las pestañas: es la pantalla
     de esa persona y es una decisión sobre esa persona, no sobre lo que armó
     ni sobre lo que escucha. Se sostiene, como todo lo que saca algo de tu
     vista. Se deshace desde Ajustes → Bloqueados. */
  const bloqueo =
    perfil && !soyYo ? (
      <View className="overflow-hidden rounded-2xl bg-card">
        <FilaSostener
          rotulo={`Bloquear a @${perfil.username}`}
          detalle="No van a poder escribirse ni encontrarse en la búsqueda."
          icono={<IconBan size={17} color={ICON_COLOR.muted} />}
          onCompletar={() => void bloquear()}
          ultima
        />
      </View>
    ) : null

  return (
    <FuentePerfil fuente={perfil?.fuente}>
      <SafeAreaView className="flex-1 bg-background" edges={ancho ? ['top', 'bottom'] : ['top']}>
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
            <FondoEstiloPerfil perfil={perfil} />

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
              contentContainerClassName="items-center"
              /* Con fondo, la primera pantalla es de la imagen y el contenido
               arranca abajo, scrolleando por encima (`alturaDeHeroe`). Sin
               fondo, el arranque compacto de siempre: en escritorio debajo del
               redondel de volver, que flota sobre la imagen. */
              contentContainerStyle={{
                paddingHorizontal: ancho ? 24 : 16,
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
                <SuperficiePerfil perfil={perfil} anchoContenido={ancho ? CAP_ANCHO : MAX_W} minHeight={ancho ? 520 : 420}>
                  {/* Misma banda que en el perfil propio: acostada en escritorio,
                    apilada y centrada en el teléfono. Que las dos pantallas se
                    vean igual es el punto de compartir `Identidad`. */}
                  <CabeceraPerfil perfil={perfil}
                    centrado={!ancho}
                    banda={ancho}
                  />

                  {ancho ? (
                    /* Las dos columnas del perfil propio, con el mismo reparto:
                     el mosaico a la izquierda y lo reciente a la derecha. Son
                     las dos pestañas del teléfono, lado a lado. */
                    <View className="flex-row items-start gap-6">
                      <View className="min-w-0 flex-1">{vitrinas}</View>
                      <View className="w-[320px] shrink-0 gap-7">
                        {resumen}
                        {reciente}
                        {bloqueo}
                      </View>
                    </View>
                  ) : (
                    <>
                      <View className="items-center">
                        <PestanasPerfil activa={pestana} onCambiar={setElegida} />
                      </View>

                      {/* Mientras no se sabe con cuál abrir, nada: mejor un
                        instante en blanco que una pestaña que salta. */}
                      {pestana === 'space' ? vitrinas : pestana === 'reciente' ? <>{resumen}{reciente}</> : null}

                      {bloqueo}
                    </>
                  )}
                </SuperficiePerfil>
              )}
            </ScrollView>
          </Panel>
        </View>
      </SafeAreaView>
    </FuentePerfil>
  )
}
