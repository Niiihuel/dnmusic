import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Panel } from '../../src/ui/Panel'
import { BotonVidrio, Glass } from '../../src/ui/Glass'
import {
  alturaDeHeroe,
  FondoPerfil,
  Identidad,
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
import { ICON_COLOR, IconBack, IconPalette, IconPencil, IconPlus } from '../../src/ui/icons'
import { listPlaylists, type Playlist } from '../../src/services/playlists'
import { useMyProfile } from '../../src/state/session'
import { useChromeH, usePiso } from '../../src/state/shell'
import { editarBorrador, tomarArmado } from '../../src/state/vitrinaBorrador'
import { useColapso } from '../../src/ui/useColapso'
import { volver } from '../../src/lib/volver'

/* El cartel de perfil vacío no depende de nada, así que se arma una sola vez
   y no en cada render del perfil. */
const VACIO = (
  <View className="items-center gap-2 rounded-2xl bg-card px-6 py-12">
    <Text className="text-foreground text-[15px] font-semibold">Tu perfil está vacío</Text>
    <Text className="text-muted-foreground text-center text-[13px] leading-5">
      Fijá una canción desde los tres puntos de cualquier fila y va a aparecer acá.
    </Text>
  </View>
)

/* Armando, el hueco dice qué hacer: el «+» está abajo. */
const VACIO_ARMANDO = (
  <View className="items-center gap-2 rounded-2xl bg-card px-6 py-12">
    <Text className="text-foreground text-[15px] font-semibold">El mosaico está vacío</Text>
    <Text className="text-muted-foreground text-center text-[13px] leading-5">
      Tocá el «+» de abajo para agregar la primera pieza.
    </Text>
  </View>
)

/** Ancho al que el perfil deja de ser una columna centrada. */
const MAX_W = 520
/** Alto de la barra de armado, más su respiro sobre lo que flota debajo. */
const ALTO_BARRA = 64
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
  const colapso = useColapso()
  /*
   * Armando: el mosaico con sus controles y la barra al pie.
   *
   * Es el «modo de edición» del Space de Airbuds, **en el mismo perfil**: se
   * entra manteniendo apretada una pieza, o desde «Editar perfil → Armar el
   * mosaico», y se sale con «Hecho». La identidad se sigue editando en su
   * pantalla; acá se arma lo que se muestra.
   */
  const [armando, setArmando] = useState(false)
  /*
   * La pestaña que se eligió con el dedo, en el teléfono. `null` es «ninguna
   * todavía» y entonces manda `pestanaInicial`: «Space» con piezas, «Reciente»
   * sin ellas. Ver `ui/PestanasPerfil`.
   *
   * Armando manda «Space» siempre, y además se **deja elegida**: al tocar
   * «Hecho» uno quiere ver el mosaico que acaba de armar, no que la pantalla
   * vuelva sola a «Reciente» porque la cuenta de piezas dio cero un momento.
   */
  const [elegida, setElegida] = useState<PestanaPerfil | null>(null)
  /* Mientras se arrastra una pieza el scroll se congela: un ScrollView vivo
     abajo del dedo se pelea con el gesto. */
  const [arrastrando, setArrastrando] = useState(false)
  const chrome = useChromeH()
  const piso = usePiso(24) + (armando ? ALTO_BARRA : 0)
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

  /*
   * Al volver a esta pantalla, se relee todo lo que se edita en otra.
   *
   * Las vitrinas se arman en «Editar perfil» y las reacciones llegan solas: al
   * volver de editar —o de cualquier lado— lo que se ve tiene que ser lo que
   * hay, sin esperar al próximo cambio. La identidad y el fondo no lo
   * necesitan: viven en el store de sesión y ya se actualizan al guardar.
   *
   * El primer foco se saltea porque es el montaje: los efectos de carga ya
   * corrieron y repetirlos sería pedir todo dos veces en cada apertura.
   */
  /** Entrar a armar: desde «Armar el mosaico» o manteniendo apretada una pieza. */
  const entrarEdicion = useCallback(() => {
    setElegida('space')
    setArmando(true)
  }, [])

  const primerFoco = useRef(true)
  useFocusEffect(
    useCallback(() => {
      /* «Armar el mosaico», desde el editor: se entra armando al volver. */
      if (tomarArmado()) entrarEdicion()
      if (primerFoco.current) {
        primerFoco.current = false
        return
      }
      setRecarga((n) => n + 1)
    }, [entrarEdicion]),
  )

  const canciones = listas?.reduce((suma, l) => suma + l.tracks, 0) ?? null
  const nombre = profile?.displayName?.trim() || profile?.username || '?'
  const pestana: PestanaPerfil | null = armando
    ? 'space'
    : (elegida ?? pestanaInicial(cuantasVitrinas))

  /*
   * El botón de editar, y nada más.
   *
   * Es el único control de la pantalla. Con vidrio se apoya sobre el fondo
   * desenfocado, que es exactamente donde el material tiene algo que mostrar.
   */
  const chipDeEdicion = (
    <Glass radius={18} style={{ height: 36, paddingHorizontal: 16, justifyContent: 'center' }}>
      <Text className="text-foreground text-[11px] font-bold uppercase tracking-[1.4px]">
        Modo de edición
      </Text>
    </Glass>
  )
  const botonEditar = armando ? (
    chipDeEdicion
  ) : (
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

  /*
   * La fila de las pestañas, en el teléfono: la píldora en el centro y el
   * lápiz contra el borde derecho.
   *
   * Las pestañas ocupan el lugar que tenía «Editar perfil» —centrado debajo de
   * la identidad— porque son lo que ahora decide qué se ve debajo. El botón no
   * cabe al lado con su texto (píldora más «Editar perfil» no entran en 360px
   * sin apretarse) y apilarlo encima sumaba una segunda fila de controles
   * sobre el fondo; queda como redondel con el lápiz, del mismo alto que la
   * píldora, con el nombre en el rótulo accesible y en el tooltip. Un hueco
   * del mismo ancho a la izquierda mantiene la píldora en el eje del avatar.
   *
   * Armando no hay pestañas: el chip «Modo de edición» ocupa ese lugar, y no
   * hay a dónde cambiar —se arma el mosaico, o sea «Space»—.
   */
  const filaDePestanas = armando ? (
    <View className="items-center">{chipDeEdicion}</View>
  ) : (
    <View className="flex-row items-center justify-between">
      <View style={{ width: 44 }} />
      <PestanasPerfil activa={pestana} onCambiar={setElegida} />
      <BotonVidrio
        label="Editar perfil"
        onPress={() => router.push('/profile/editar')}
        radius={22}
        style={{ width: 44, height: 44 }}
      >
        <IconPencil size={17} color={ICON_COLOR.foreground} />
      </BotonVidrio>
    </View>
  )


  /** El lápiz de una pieza: se copia al borrador y se abre su editor. */
  function abrirEditor(v: Parameters<typeof editarBorrador>[0]) {
    editarBorrador(v)
    router.push('/profile/vitrina')
  }

  /*
   * La barra de armado: el tema del perfil, el «+» y «Hecho».
   *
   * Es de vidrio porque es de la capa de controles: por detrás pasan las
   * piezas. El «+» es el único blanco pleno: es lo principal que hay para
   * hacer mientras se arma.
   */
  const barraDeArmado = (
    <Glass radius={999} style={{ height: 56, paddingHorizontal: 8, justifyContent: 'center' }}>
      <View className="flex-row items-center gap-3">
        <BotonVidrio
          label="El tema de tu perfil"
          onPress={() => router.push({ pathname: '/profile/tema', params: { para: 'perfil' } })}
          radius={999}
          style={{ width: 40, height: 40 }}
        >
          <IconPalette size={17} color={ICON_COLOR.foreground} />
        </BotonVidrio>
        <BotonVidrio
          label="Agregar una pieza"
          onPress={() => router.push('/profile/agregar')}
          radius={999}
          tint={ICON_COLOR.foreground}
          style={{ width: 48, height: 48 }}
        >
          <IconPlus size={22} color={ICON_COLOR.onPrimary} strokeWidth={2.4} />
        </BotonVidrio>
        <BotonVidrio
          label="Terminar de armar"
          onPress={() => setArmando(false)}
          radius={999}
          style={{ height: 40, paddingHorizontal: 16 }}
        >
          <Text className="text-foreground text-[13px] font-bold">Hecho</Text>
        </BotonVidrio>
      </View>
    </Glass>
  )

  /*
   * El mosaico, con todo lo que necesita para armarse. Es el mismo en las dos
   * pantallas —dos columnas y pestañas— así que se arma una vez.
   */
  const vitrinas = profile ? (
    <Vitrinas
      ownerId={profile.userId}
      recarga={recarga}
      onCambio={() => setRecarga((n) => n + 1)}
      editando={armando}
      temaGlobal={profile.tema}
      onEditar={abrirEditor}
      onEntrarEdicion={entrarEdicion}
      onArrastre={setArrastrando}
      /* Un sub-space se abre en su pantalla, apilada: es un mosaico entero
         y no cabe adentro de una pieza. Al volver, el perfil relee en foco. */
      onAbrirSubspace={(v) =>
        router.push({ pathname: '/profile/subspace', params: { owner: profile.userId, id: v.id } })
      }
      vacio={armando ? VACIO_ARMANDO : VACIO}
    />
  ) : null

  const reciente = profile ? (
    <Reciente
      ownerId={profile.userId}
      nombre={nombre}
      propio
      recarga={recarga}
      onAbrirLista={(lista) => router.push(`/lista/${lista.id}`)}
      /* En escritorio el `Resumen` entero va justo debajo, y abre con los
         mismos dos números que el resumen corto. */
      sinResumen={ancho}
    />
  ) : null

  const resumen = (
    <Resumen
      ownerId={profile?.userId ?? ''}
      listas={listas?.length ?? null}
      canciones={canciones}
      vitrinas={cuantasVitrinas}
      desde={profile?.createdAt ?? null}
      /* En el teléfono «Reciente» ya abre con los minutos y el artista. */
      sinEscucha={!ancho}
    />
  )

  return (
    /* En el teléfono el fondo es el mismo del contenido; el negro puro es el de
       la ventana en escritorio, donde los paneles flotan. Ver `app/index.tsx`. */
    <SafeAreaView
      className="flex-1 bg-background"
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
          <FondoPerfil
            bannerPath={profile?.bannerPath ?? null}
            encuadre={profile?.bannerEncuadre ?? null}
          />

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
              /* Armando, el arranque es el compacto aunque haya fondo: la
                 primera pantalla pasa a ser del mosaico, que es lo que se
                 está tocando, y no de la imagen. Sin esto las piezas caían
                 justo debajo de la barra de armado. */
              paddingTop: alturaDeHeroe(
                altoVentana,
                armando ? null : profile?.bannerPath,
                ancho ? 72 : arriba.top + 24,
              ),
              paddingBottom: piso,
            }}
            {...colapso}
            scrollEnabled={!arrastrando}
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
                      encuadre={profile.avatarEncuadre}
                      marco={profile.marco}
                      bio={profile.bio ?? ''}
                      banda
                      accion={armando ? barraDeArmado : botonEditar}
                    />

                    {/*
                     * Las dos columnas son las dos pestañas del teléfono.
                     *
                     * A la izquierda el mosaico solo —«Space»—, y a la derecha
                     * «Reciente» con los números debajo. Antes la pared de
                     * reacciones iba arriba del mosaico y las listas abajo, con
                     * lo que la columna ancha apilaba tres cosas de tres
                     * dueños distintos y la angosta tenía seis números. Ahora
                     * cada columna es una sola idea: lo que armaste, y lo que
                     * pasa. Es el reparto de Steam —las vitrinas mandan, el
                     * costado acompaña— y hace que el mosaico sea lo primero
                     * de la izquierda también armando, cuando la barra vive en
                     * la banda y las piezas tienen que estar a mano debajo.
                     */}
                    <View className="flex-row items-start gap-6">
                      <View className="min-w-0 flex-1">{vitrinas}</View>
                      <View className="w-[320px] shrink-0 gap-8">
                        {reciente}
                        {resumen}
                      </View>
                    </View>
                  </>
                ) : (
                  <>
                    <Identidad
                      nombre={nombre}
                      usuario={profile.username}
                      avatarPath={profile.avatarPath}
                      encuadre={profile.avatarEncuadre}
                      marco={profile.marco}
                      bio={profile.bio ?? ''}
                      centrado
                    />

                    {filaDePestanas}

                    {/* Mientras no se sabe con cuál abrir, nada: mejor un
                        instante en blanco que una pestaña que salta. */}
                    {pestana === 'space' ? (
                      vitrinas
                    ) : pestana === 'reciente' ? (
                      <View className="gap-8">
                        {reciente}
                        {/* Los números de tu biblioteca, al pie, como antes.
                            Sin los minutos: «Reciente» ya abrió con ellos. */}
                        {resumen}
                      </View>
                    ) : null}
                  </>
                )}
              </View>
            )}
          </ScrollView>

          {/*
           * La barra de armado: el tema del perfil, el «+» y «Hecho».
           *
           * Flota sobre el mosaico, apoyada en lo que ya flota debajo —el
           * reproductor, las pestañas—, y es de vidrio porque es de la capa de
           * controles: por detrás pasan las piezas. El «+» es el único blanco
           * pleno: es lo principal que hay para hacer mientras se arma.
           */}
          {/* En el teléfono la barra flota al pie, apoyada sobre el
              reproductor y las pestañas. En escritorio va arriba, en la banda
              —donde estaba «Editar perfil»—: ahí no hay nada que la tape y no
              tapa nada. */}
          {armando && profile && !ancho ? (
            <View
              pointerEvents="box-none"
              className="absolute inset-x-0 items-center"
              style={{ bottom: chrome + 12 }}
            >
              {barraDeArmado}
            </View>
          ) : null}
        </Panel>
      </View>
    </SafeAreaView>
  )
}
