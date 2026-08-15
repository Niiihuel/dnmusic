import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Panel } from '../../src/ui/Panel'
import { BotonVidrio } from '../../src/ui/Glass'
import {
  alturaDeHeroe,
  FondoPerfil,
  Identidad,
  Resumen,
  useCuantasVitrinas,
  Vitrinas,
} from '../../src/ui/PerfilPublico'
import { ListasPerfil } from '../../src/ui/ListasPerfil'
import { ICON_COLOR, IconBack, IconPencil } from '../../src/ui/icons'
import { listPlaylists, type Playlist } from '../../src/services/playlists'
import { useMyProfile } from '../../src/state/session'
import { usePiso } from '../../src/state/shell'
import { useColapso } from '../../src/ui/useColapso'
import { volver } from '../../src/lib/volver'

/** Ancho al que el perfil deja de ser una columna centrada. */
const MAX_W = 520
/** A partir de acá entra la columna del resumen al costado. */
const ANCHO_PX = 900
/**
 * Tope del contenido en escritorio.
 *
 * El fondo sangra a todo el ancho del panel, pero el contenido se corta acá. Es
 * lo que hace que en una pantalla de 2560 el recorte se lea como marco y no como
 * vacío: sin tope, las dos columnas se estiran hasta despegarse una de otra.
 */
const CAP_ANCHO = 1100

/**
 * El perfil: **solo se mira**.
 *
 * Es la separación de Discord, y es la que faltaba. Antes esta pantalla tenía la
 * identidad arriba y debajo los campos, las cruces de las vitrinas y las flechas
 * de orden: con los controles encima nunca podías ver tu perfil como lo ve otro,
 * que es justamente para lo que un perfil existe.
 *
 * Ahora todo lo editable vive en `editar/`, detrás de un botón. Acá no hay un
 * solo control que cambie algo.
 *
 * En escritorio se abre en dos columnas —las vitrinas mandan, el resumen
 * acompaña, como en Steam— y en el teléfono se apila.
 */
export default function ProfileScreen() {
  const router = useRouter()
  const profile = useMyProfile()
  const piso = usePiso(24)
  const colapso = useColapso()
  const { width, height: altoVentana } = useWindowDimensions()
  const ancho = width >= ANCHO_PX
  /* El margen del reloj, en el teléfono: la pantalla ya no reserva el área
     segura de arriba — el fondo pasa por detrás de la hora, como la portada. */
  const arriba = useSafeAreaInsets()

  /* Cambia al volver del editor, para releer lo que se haya tocado. */
  const [recarga, setRecarga] = useState(0)
  const cuantasVitrinas = useCuantasVitrinas(profile?.userId ?? '', recarga)

  /*
   * Los números del resumen salen de la biblioteca, que ya sabemos pedir.
   *
   * Se cuenta acá y no en la base porque es una consulta que ya existe y el dato
   * es chico: una función en Postgres para sumar cuatro filas sería más
   * maquinaria de la que el problema pide.
   */
  const [listas, setListas] = useState<Playlist[] | null>(null)
  useEffect(() => {
    let vivo = true
    listPlaylists()
      .then((l) => vivo && setListas(l))
      .catch(() => vivo && setListas([]))
    return () => {
      vivo = false
    }
  }, [recarga])

  const canciones = listas?.reduce((suma, l) => suma + l.tracks, 0) ?? null
  const nombre = profile?.displayName?.trim() || profile?.username || '?'

  /*
   * El botón de editar, y nada más.
   *
   * Es el único control de la pantalla. Con vidrio se apoya sobre el fondo
   * desenfocado, que es exactamente donde el material tiene algo que mostrar.
   */
  const botonEditar = (
    <BotonVidrio
      label="Editar perfil"
      onPress={() => router.push('/profile/editar')}
      radius={22}
      style={{ height: 44, paddingHorizontal: 18 }}
    >
      <View className="flex-row items-center gap-2">
        <IconPencil size={15} color={ICON_COLOR.foreground} />
        <Text className="text-foreground text-[14px] font-semibold">Editar perfil</Text>
      </View>
    </BotonVidrio>
  )

  const vacio = (
    <View className="items-center gap-2 rounded-2xl bg-card px-6 py-12">
      <Text className="text-foreground text-[15px] font-semibold">Tu perfil está vacío</Text>
      <Text className="text-muted-foreground text-center text-[13px] leading-5">
        Fijá una canción desde los tres puntos de cualquier fila y va a aparecer acá.
      </Text>
    </View>
  )

  const resumen = (
    <Resumen
      ownerId={profile?.userId ?? ''}
      listas={listas?.length ?? null}
      canciones={canciones}
      vitrinas={cuantasVitrinas}
      desde={profile?.createdAt ?? null}
    />
  )

  return (
    /* En el teléfono el fondo es el mismo del contenido; el negro puro es el de
       la ventana en escritorio, donde los paneles flotan. Ver `app/index.tsx`. */
    <SafeAreaView
      className={`flex-1 ${ancho ? 'bg-canvas' : 'bg-background'}`}
      /* En el teléfono el margen de abajo lo pone la barra de pestañas.
         Reservarlo también acá lo contaría dos veces. Y el de arriba tampoco
         va: el fondo del perfil pasa por detrás del reloj —el velo del layout
         cuida la hora— y el margen lo reserva el contenido, como la portada. */
      edges={ancho ? ['top', 'bottom'] : []}
    >
      <View className={`flex-1 ${ancho ? 'gap-2 p-2' : ''}`}>
        <Panel className="flex-1">
          {/* El fondo va detrás de todo: además de ser lo de Steam, es la única
              pantalla donde el vidrio tiene una foto que difuminar. */}
          <FondoPerfil bannerPath={profile?.bannerPath ?? null} />

          {/*
           * La salida, en escritorio: un redondel de vidrio sobre la imagen.
           *
           * Antes era una franja negra con «← Tu perfil» **encima** del panel,
           * fuera del fondo. Con la imagen a sangre esa franja quedaba como un
           * techo opaco cortando justo lo que se eligió para que se vea, y el
           * título repetía el nombre que está dos centímetros más abajo, en
           * grande. El botón flota sobre la imagen igual que «Editar perfil» del
           * otro extremo, así la banda de arriba es una sola cosa.
           *
           * En el teléfono no va: el perfil es una pestaña, y una pestaña no
           * tiene volver — se sale tocando otra.
           */}
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

          {/*
           * Bajando, la cáscara se pliega; subiendo, vuelve.
           *
           * Faltaba **solo acá**: inicio, la biblioteca, cada lista y el chat lo
           * tienen. Como el plegado es global, se llegaba al perfil ya plegado
           * desde cualquiera de esas y no había forma de desplegarlo desplazando
           * —era la única pantalla donde el gesto no hacía nada—. Se notaba como
           * que el perfil tenía otro layout que el resto de la app.
           */}
          <ScrollView
            contentContainerClassName="items-center px-4"
            /* En el teléfono el contenido arranca debajo del reloj —la
               pantalla ya no reserva esa franja— con el respiro que ya tenía
               (`pt-6`). El estilo pisa a la clase, así que va todo acá. */
            contentContainerStyle={{
              /* En escritorio el contenido arranca **debajo del redondel de
                 volver**, que ahora flota sobre la imagen: con el respiro de
                 antes, el avatar quedaba justo abajo del botón en una ventana
                 angosta. Es más o menos lo que ocupaba la franja negra, así que
                 el ritmo vertical queda igual y la imagen gana esa altura. */
              /* Y con un fondo elegido, todo eso queda como piso: la primera
                 pantalla es de la imagen y el contenido arranca a ~2/5 del
                 alto, scrolleando por encima. Ver `alturaDeHeroe`. */
              paddingTop: alturaDeHeroe(
                altoVentana,
                profile?.bannerPath,
                ancho ? 72 : arriba.top + 24,
              ),
              paddingBottom: piso,
            }}
            {...colapso}
          >
            {!profile ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              /* `propio` en falso en las vitrinas: acá se ven como las ve
                 cualquiera, sin cruces ni flechas. Los controles están en el
                 editor. */
              <View className="w-full gap-8" style={{ maxWidth: ancho ? CAP_ANCHO : MAX_W }}>
                {ancho ? (
                  <>
                    {/* La banda: identidad acostada de punta a punta, con el
                        botón contra el borde derecho. Va sobre `FondoPerfil`,
                        que sangra a todo el ancho del panel por detrás. */}
                    <Identidad
                      nombre={nombre}
                      usuario={profile.username}
                      avatarPath={profile.avatarPath}
                      bio={profile.bio ?? ''}
                      banda
                      accion={botonEditar}
                    />

                    <View className="flex-row items-start gap-6">
                      <View className="min-w-0 flex-1 gap-8">
                        <Vitrinas
                          ownerId={profile.userId}
                          recarga={recarga}
                          onCambio={() => setRecarga((n) => n + 1)}
                          propio={false}
                          vacio={vacio}
                        />
                        {/* El estante de listas publicadas, debajo de lo
                            destacado y en la misma columna: el resumen de la
                            derecha son números tuyos, esto es lo que ve
                            cualquiera. */}
                        <ListasPerfil
                          ownerId={profile.userId}
                          nombre={nombre}
                          propio
                          onAbrir={(lista) => router.push(`/lista/${lista.id}`)}
                        />
                      </View>
                      <View className="w-[320px] shrink-0">{resumen}</View>
                    </View>
                  </>
                ) : (
                  <>
                    <Identidad
                      nombre={nombre}
                      usuario={profile.username}
                      avatarPath={profile.avatarPath}
                      bio={profile.bio ?? ''}
                      centrado
                    />

                    <View className="items-center">{botonEditar}</View>

                    <Vitrinas
                      ownerId={profile.userId}
                      recarga={recarga}
                      onCambio={() => setRecarga((n) => n + 1)}
                      propio={false}
                      vacio={vacio}
                    />

                    <ListasPerfil
                      ownerId={profile.userId}
                      nombre={nombre}
                      propio
                      onAbrir={(lista) => router.push(`/lista/${lista.id}`)}
                    />

                    {resumen}
                  </>
                )}
              </View>
            )}
          </ScrollView>
        </Panel>
      </View>
    </SafeAreaView>
  )
}
