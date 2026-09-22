import { Fragment, useCallback, useRef, useState, type ReactNode } from 'react'
import { Platform, Pressable, Text, useWindowDimensions, View, type ScrollView as RNScrollView } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  AjustesCompactos,
  AjustesNativos,
  FilaAjuste,
  FilaCuenta,
  FilaInterruptor,
  FilaOpciones,
  GrupoAjustes,
  FilaConfirmable,
} from '../../src/ui/Ajustes'
import { Avatar } from '../../src/ui/Avatar'
import { CabeceraLateral, BotonLateral } from '../../src/ui/CabeceraLateral'
import { BotonVolver } from '../../src/ui/BotonVolver'
import { CollapsedSidebar } from '../../src/ui/SidebarMotion'
import { ScrollArea as ScrollView } from '../../src/ui/ScrollArea'
import { Panel, Shell } from '../../src/ui/Panel'
import { SearchField } from '../../src/ui/SearchField'
import { Vacio } from '../../src/ui/Vacio'
import {
  ICON_COLOR,
  IconBan,
  IconClock,
  IconCollapseLeft,
  IconSliders,
  IconDisc,
  IconDisk,
  IconDownload,
  IconLock,
  IconLogOut,
  IconMusic,
  IconSearch,
  IconSparkles,
  IconTrash,
  IconUser,
  IconWifi,
  type IconProps,
} from '../../src/ui/icons'
import {
  espacioUsado,
  formatoBytes,
  HAY_DESCARGAS,
  useDescargas,
  reanudarDescargas,
} from '../../src/state/descargas'
import { setPreferencia, setPrecargaAutomatica, setPrecargaDatos, setSoloWifi, useAjustes } from '../../src/state/ajustes'
import { programarApagado, setModoReproduccion, useDormirMin, useModoReproduccion } from '../../src/state/playback'
import { borrarHistorial } from '../../src/services/plays'
import { endSession, useAuthUser, useIsAccessAdmin, useMyProfile } from '../../src/state/session'
import { useNovedadesPendientes } from '../../src/state/novedadesVistas'
import { avisar } from '../../src/state/aviso'
import { mensajeError } from '../../src/lib/mensajeError'
import { useKeyboardH, usePiso } from '../../src/state/shell'
import { volver } from '../../src/lib/volver'
import { NOVEDADES } from '../../src/lib/novedades'
import { DETALLE_PRECARGA_SESION, DETALLE_RED_PC, inventarioDescargas } from '../../src/ui/descargasControl'
import { TECLADO_FISICO } from '../../src/lib/teclado'
import { ListaSolicitudes } from '../../src/ui/SolicitudesAcceso'
import { ConectarGoogle } from '../../src/ui/ConectarGoogle'
import { DiscordIcon } from '../../src/ui/DiscordIcon'
import { AjustesDiscord } from '../../src/ui/AjustesDiscord'
import { AjustesActualizaciones } from '../../src/ui/AjustesActualizaciones'

/** Desde acá la pantalla es la de macOS: barra lateral con las categorías y el detalle al lado. */
const ESCRITORIO_PX = 780
/** Ancho de la barra lateral, el de Ajustes del Sistema. */
const LATERAL_W = 240
/** Tope del detalle: una lista agrupada más ancha se lee como una tabla. */
const MAX_W = 540
/** Los minutos que ofrece el temporizador. */
const MINUTOS = [15, 30, 45, 60, 90]

const normalizar = (valor: string) =>
  valor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

type Categoria = {
  id: string
  titulo: string
  resumen: string
  simbolo: string
  icono: (p: IconProps) => React.ReactElement
  /** Con qué palabras se la encuentra buscando. */
  palabras: string
  visible: boolean
  /** Los bloques de la categoría. En el teléfono van uno tras otro; en la compu, al elegirla. */
  bloques: ReactNode
}

/**
 * Configuración, con la anatomía del sistema en las dos plataformas.
 *
 * **En iPhone es Configuración de iOS**: una raíz breve con la cuenta y las
 * categorías. Cada categoría abre su propio destino nativo, con gesto de
 * regreso, barra translúcida y título administrados por NavigationStack.
 *
 * **En la compu es Ajustes del Sistema de macOS**: una barra lateral con el
 * buscador, la cuenta y la lista de categorías, y a la derecha el detalle de la
 * elegida con sus bloques. Es lo que la HIG pide para una app de escritorio con
 * varias secciones —una *navigation split view*— y es lo que deja el espacio
 * que una columna sola desaprovecha en una ventana de 1400.
 *
 * Los dos son la **misma lista de categorías** (`categorias`), armada una vez:
 * lo que cambia es cómo se recorre.
 */
export default function Configuracion() {
  const router = useRouter()
  const { seccion } = useLocalSearchParams<{ seccion?: string }>()
  const ajustes = useAjustes()
  const esAdmin = useIsAccessAdmin()
  const cuentaAuth = useAuthUser()
  const dormirMin = useDormirMin()
  const modoReproduccion = useModoReproduccion()
  const perfil = useMyProfile()
  const nombre = perfil?.displayName?.trim() || perfil?.username || 'Tu cuenta'
  const { items } = useDescargas()
  const inventario = inventarioDescargas(items)
  const descargasManuales = inventario.filter(e => !e.descarga.temporal).length
  const cacheTemporal = inventario.length - descargasManuales
  const pendientes = useNovedadesPendientes()
  const [busqueda, setBusqueda] = useState('')
  const { width } = useWindowDimensions()
  const escritorio = Platform.OS !== 'ios' && width >= ESCRITORIO_PX
  const consulta = normalizar(busqueda)
  const buscando = consulta.length > 0

  async function borrar() {
    try {
      await borrarHistorial()
      avisar('Historial borrado')
    } catch (e) {
      avisar(`No se pudo borrar: ${mensajeError(e)}`, true)
    }
  }

  const categorias: Categoria[] = [
    {
      id: 'reproduccion',
      titulo: 'Reproducción',
      resumen: 'Modo, temporizador y audio',
      simbolo: 'waveform',
      icono: IconDisc,
      palabras:
        'reproducción modo orden aleatorio descubrimiento recomendaciones temporizador apagar dormir minutos pausa géneros artistas gustos música diagnóstico audio errores fallos recuperación',
      visible: true,
      bloques: (
        <>
          <GrupoAjustes pie="En orden respeta la colección. Aleatorio usa solo sus canciones. Descubrimiento intercala una sugerencia cada tres temas y continúa al final.">
            <FilaOpciones
              rotulo="Modo de reproducción"
              icono={<IconDisc size={17} color={ICON_COLOR.muted} />}
              valor={modoReproduccion}
              opciones={[
                { value: 'orden', label: 'En orden', sfSymbol: 'list.number' as const },
                { value: 'aleatorio', label: 'Aleatorio', sfSymbol: 'shuffle' as const },
                { value: 'recomendado', label: 'Descubrimiento', sfSymbol: 'sparkles' as const },
              ]}
              onElegir={setModoReproduccion}
              ultima
            />
          </GrupoAjustes>
          <GrupoAjustes pie="El temporizador pausa la música cuando se cumple el tiempo. Es de esta sesión, no queda guardado.">
            <FilaOpciones
              rotulo="Temporizador"
              icono={<IconClock size={17} color={ICON_COLOR.muted} />}
              valor={dormirMin ?? 0}
              opciones={[
                ...MINUTOS.map((m) => ({ value: m, label: `${m} minutos`, sfSymbol: 'clock' as const })),
                { value: 0, label: 'Apagado', sfSymbol: 'xmark.circle' as const, separadorAntes: true },
              ]}
              onElegir={(m) => programarApagado(m === 0 ? null : m)}
            />
            <FilaAjuste
              rotulo="Géneros y artistas"
              vacio=""
              icono={<IconMusic size={17} color={ICON_COLOR.muted} />}
              onPress={() => router.push('/onboarding?de=ajustes')}
              ultima
            />
          </GrupoAjustes>
          <GrupoAjustes pie="Consultá los fallos y recuperaciones recientes del audio en este dispositivo.">
            <FilaAjuste rotulo="Ecualizador" valor="10 bandas" icono={<IconSliders size={17} color={ICON_COLOR.muted} />}
              onPress={() => router.push('/ajustes/ecualizador' as never)} />
            <FilaAjuste rotulo="Diagnóstico de audio" vacio="" icono={<IconDisc size={17} color={ICON_COLOR.muted} />}
              onPress={() => router.push('/ajustes/diagnostico-audio')} ultima />
          </GrupoAjustes>
        </>
      ),
    },
    {
      id: 'descargas',
      titulo: HAY_DESCARGAS ? 'Descargas y caché' : 'Precarga',
      resumen: 'Música sin conexión y uso de datos',
      simbolo: 'arrow.down.circle',
      icono: IconDownload,
      palabras: 'almacenamiento descargas caché cache automática precarga espacio límite wifi datos conexión bajadas sin conexión',
      visible: true,
      bloques: (
        <GrupoAjustes pie={HAY_DESCARGAS ? 'Las descargas manuales se conservan; la caché se reutiliza automáticamente. Administrá el espacio y las canciones desde Descargas y caché.' : DETALLE_PRECARGA_SESION}>
          {HAY_DESCARGAS ? <><FilaAjuste iconoPlano
            rotulo="Descargas y caché"
            valor={`${descargasManuales} descargas · ${cacheTemporal} en caché · ${formatoBytes(espacioUsado(items))}`}
            icono={<IconDisk size={16} color={ICON_COLOR.muted} />}
            onPress={() => router.push('/ajustes/descargas')}
          />
          <FilaInterruptor iconoPlano
            rotulo="Descargas solo con Wi-Fi"
            detalle={Platform.OS === 'web' ? DETALLE_RED_PC : undefined}
            icono={<IconWifi size={16} color={ICON_COLOR.muted} />}
            activo={ajustes.soloWifi}
            onCambiar={(v) => {
              setSoloWifi(v)
              if (!v) reanudarDescargas()
            }}
          />
          </> : null}
          <FilaInterruptor iconoPlano rotulo="Precarga automática" activo={ajustes.precargaAutomatica}
            icono={<IconDownload size={16} color={ICON_COLOR.muted} />}
            onCambiar={v => { setPrecargaAutomatica(v); if (HAY_DESCARGAS) reanudarDescargas() }} />
          <FilaInterruptor iconoPlano rotulo="Precargar con datos móviles" activo={ajustes.precargaDatos}
            icono={<IconWifi size={16} color={ICON_COLOR.muted} />}
            onCambiar={v => { setPrecargaDatos(v); if (HAY_DESCARGAS) reanudarDescargas() }} ultima />
        </GrupoAjustes>
      ),
    },
    {
      id: 'app',
      titulo: 'La app',
      resumen: 'Novedades y comportamiento',
      simbolo: 'sparkles',
      icono: IconSparkles,
      palabras: 'novedades avisos ayudas cursor interfaz app rótulos',
      visible: true,
      bloques: (
        <GrupoAjustes
          pie={
            TECLADO_FISICO
              ? 'Las ayudas nombran los controles al pasar el cursor; las del teclado siguen disponibles. Las novedades se muestran una vez por versión.'
              : 'Las novedades se muestran una vez por versión, al abrir la app.'
          }
        >
          {TECLADO_FISICO ? (
            <FilaInterruptor
              rotulo="Ayudas al pasar el cursor"
              icono={<IconSparkles size={17} color={ICON_COLOR.muted} />}
              activo={ajustes.ayudasCursor}
              onCambiar={(v) => setPreferencia('ayudasCursor', v)}
            />
          ) : null}
          <FilaInterruptor
            rotulo="Novedades al abrir"
            icono={<IconSparkles size={17} color={ICON_COLOR.muted} />}
            activo={ajustes.novedadesAlAbrir}
            onCambiar={(v) => setPreferencia('novedadesAlAbrir', v)}
            ultima
          />
        </GrupoAjustes>
      ),
    },
    {
      id: 'actualizaciones',
      titulo: 'Actualizaciones',
      resumen: 'Versión instalada y disponibilidad',
      simbolo: 'arrow.triangle.2.circlepath',
      icono: IconDownload,
      palabras: 'actualizaciones versión instalada descargar reiniciar novedades TestFlight tienda',
      visible: true,
      bloques: <AjustesActualizaciones />,
    },
    {
      id: 'accesos',
      titulo: 'Solicitudes de acceso',
      resumen: 'Personas y compatibilidad',
      simbolo: 'person.2',
      icono: IconUser,
      palabras: 'administración aprobar rechazar solicitudes acceso cuentas google',
      visible: esAdmin,
      bloques: <>{escritorio && cuentaAuth ? (
        <ListaSolicitudes key={cuentaAuth.id} administradorId={cuentaAuth.id} integrada />
      ) : (
        <GrupoAjustes pie="Revisá quién puede entrar a DMusic.">
          <FilaAjuste
            iconoPlano
            rotulo="Solicitudes de acceso"
            vacio=""
            icono={<IconUser size={16} color={ICON_COLOR.muted} />}
            onPress={() => router.push('/ajustes/accesos')}
            ultima
          />
        </GrupoAjustes>
      )}
        <GrupoAjustes titulo="Administración" pie="Controlá qué versiones siguen siendo compatibles. Esta herramienta no sube ni compila la app.">
          <FilaAjuste rotulo="Compatibilidad de versiones" vacio="" icono={<IconSliders size={17} color={ICON_COLOR.muted} />} onPress={() => router.push('/ajustes/compatibilidad')} ultima />
        </GrupoAjustes>
      </>,
    },
    {
      id: 'discord',
      titulo: 'Discord',
      resumen: 'Presencia y actividad',
      simbolo: 'bubble.left.and.bubble.right',
      icono: DiscordIcon,
      palabras: 'discord presencia compartir canción escuchando actividad',
      visible: true,
      bloques: <AjustesDiscord />,
    },
    {
      id: 'privacidad',
      titulo: 'Privacidad',
      resumen: 'Bloqueados e historial de escucha',
      simbolo: 'hand.raised',
      icono: IconLock,
      palabras: 'privacidad datos bloqueados borrar historial escucha recomendaciones',
      visible: true,
      bloques: (
        <GrupoAjustes pie="Borrar el historial deja las recomendaciones en cero. No se puede deshacer.">
          <FilaAjuste
            rotulo="Bloqueados"
            vacio=""
            icono={<IconBan size={17} color={ICON_COLOR.muted} />}
            onPress={() => router.push('/ajustes/bloqueados')}
          />
          <FilaConfirmable
            rotulo="Borrar historial de escucha"
            icono={<IconTrash size={17} color={ICON_COLOR.muted} />}
            onCompletar={() => void borrar()}
            ultima
          />
        </GrupoAjustes>
      ),
    },
    {
      id: 'cuenta',
      titulo: 'Cuenta',
      resumen: 'Perfil, Google y sesión',
      simbolo: 'person.crop.circle',
      icono: IconUser,
      palabras: 'perfil foto nombre fuente tipografía espacio cerrar sesión salir cuenta conectar google vincular correo',
      visible: true,
      bloques: (
        <>
        {cuentaAuth ? <ConectarGoogle key={cuentaAuth.id} user={cuentaAuth} /> : null}
        <GrupoAjustes pie="Cerrar sesión no borra nada: tus listas y tu perfil siguen en tu cuenta.">
          <FilaAjuste
            rotulo="Personalizar perfil"
            vacio=""
            icono={<IconUser size={17} color={ICON_COLOR.muted} />}
            onPress={() => router.push('/profile')}
          />
          <FilaConfirmable
            rotulo="Cerrar sesión"
            icono={<IconLogOut size={17} color={ICON_COLOR.muted} />}
            onCompletar={() => void endSession()}
            ultima
          />
        </GrupoAjustes>
        </>
      ),
    },
  ].filter((c) => c.visible)

  /* Lo que la búsqueda deja: la categoría entera si alguna de sus palabras
     coincide. Sin búsqueda, todas. */
  const coinciden = buscando
    ? categorias.filter((c) =>
        consulta.split(/\s+/).every((palabra) => normalizar(`${c.titulo} ${c.palabras}`).includes(palabra)),
      )
    : categorias

  /* La cuenta arriba de todo, con las novedades sin leer como segunda fila:
     es el bloque del Apple ID, con su «1» de lo que espera. */
  const bloqueCuenta = (
    <GrupoAjustes>
      <FilaCuenta
        avatar={<Avatar name={nombre} path={perfil?.avatarPath} size={58} />}
        nombre={nombre}
        detalle={perfil?.username ? `@${perfil.username} · Tu perfil y tu Space` : 'Tu perfil y tu Space'}
        onPress={() => router.push('/profile')}
      />
      <FilaAjuste
        rotulo="Novedades"
        valor={NOVEDADES[0]?.version}
        icono={<IconSparkles size={17} color={ICON_COLOR.muted} />}
        globito={pendientes?.length || undefined}
        onPress={() => router.push('/ajustes/novedades')}
        ultima
      />
    </GrupoAjustes>
  )

  const sinResultados = (
    <Vacio
      compacto
      icono={<IconSearch size={20} color={ICON_COLOR.muted} />}
      titulo="No encontramos ese ajuste"
      detalle="Probá con otra palabra."
      accion={{ rotulo: 'Ver todo', onPress: () => setBusqueda('') }}
    />
  )

  if (escritorio) {
    return (
      <Escritorio
        categorias={categorias}
        initialId={typeof seccion === 'string' ? seccion : undefined}
        coinciden={coinciden}
        buscando={buscando}
        busqueda={busqueda}
        onBusqueda={setBusqueda}
        cuenta={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${nombre}. Tu perfil y tu Space`}
            onPress={() => router.push('/profile')}
            className="mx-2 flex-row items-center gap-3 rounded-xl px-2 py-2 active:bg-muted hover:bg-white/5"
          >
            <Avatar name={nombre} path={perfil?.avatarPath} size={40} />
            <View className="min-w-0 flex-1">
              <Text className="text-foreground text-subheadline font-semibold" numberOfLines={1}>
                {nombre}
              </Text>
              <Text className="text-muted-foreground text-caption1" numberOfLines={1}>
                {perfil?.username ? `@${perfil.username} · Tu perfil y tu Space` : 'Tu perfil y tu Space'}
              </Text>
            </View>
          </Pressable>
        }
        novedades={
          <GrupoAjustes titulo="Versión">
            <FilaAjuste
              rotulo="Novedades"
              valor={NOVEDADES[0]?.version}
              icono={<IconSparkles size={17} color={ICON_COLOR.muted} />}
              globito={pendientes?.length || undefined}
              onPress={() => router.push('/ajustes/novedades')}
              ultima
            />
          </GrupoAjustes>
        }
        sinResultados={sinResultados}
        onVolver={() => volver(router, '/')}
      />
    )
  }

  return (
    <Telefono
      initialId={typeof seccion === 'string' ? seccion : undefined}
      coinciden={coinciden}
      buscando={buscando}
      busqueda={busqueda}
      onBusqueda={setBusqueda}
      cuenta={bloqueCuenta}
      sinResultados={sinResultados}
      onVolver={() => volver(router, '/')}
    />
  )
}

/**
 * La forma del teléfono: la lista de Configuración de iOS, con el buscador
 * flotando abajo.
 */
function Telefono({
  initialId,
  coinciden,
  buscando,
  busqueda,
  onBusqueda,
  cuenta,
  sinResultados,
  onVolver,
}: {
  initialId?: string
  coinciden: Categoria[]
  buscando: boolean
  busqueda: string
  onBusqueda: (v: string) => void
  cuenta: ReactNode
  sinResultados: ReactNode
  onVolver: () => void
}) {
  const piso = usePiso(24)
  const teclado = useKeyboardH()
  const insets = useSafeAreaInsets()
  /*
   * Volver de Google cae en `/ajustes?seccion=cuenta`.
   *
   * En la compu esa sección es una categoría elegida y se ve sola; en el
   * teléfono la lista es una sola tirada larga —así es Configuración de iOS— y
   * «Acceso con Google» queda cuatro pantallas más abajo. Sin esto, terminar de
   * conectar la cuenta te deja mirando Reproducción, sin señal de que algo pasó.
   * Se corre **una sola vez**, cuando esa categoría dice dónde quedó: repetirlo
   * en cada medición pelearía con el dedo de quien ya se puso a leer otra cosa.
   */
  const scroll = useRef<RNScrollView>(null)
  const ubicado = useRef(false)
  const enPosicion = useCallback(
    (id: string, y: number) => {
      if (ubicado.current || id !== initialId || buscando) return
      ubicado.current = true
      scroll.current?.scrollTo({ y: Math.max(0, y - 8), animated: false })
    },
    [initialId, buscando],
  )
  /* El buscador flota sobre el borde de abajo; con el teclado abierto se
     apoya sobre él. La lista reserva su alto para llegar a la última fila. */
  const pieBuscador = Math.max(insets.bottom, 12) + teclado

  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    return <AjustesNativos
      initialId={initialId}
      categorias={coinciden.map(c => ({ id: c.id, titulo: c.titulo, resumen: c.resumen, simbolo: c.simbolo, bloques: c.bloques }))}
      cuenta={cuenta}
      piso={piso}
      buscando={buscando}
      busqueda={busqueda}
      onBusqueda={onBusqueda}
      onVolver={onVolver}
    />
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      {/* La barra chica: solo la flecha. Configuración es una pantalla apilada
          en esta app —no una pestaña— y necesita su vuelta. */}
      <View className="flex-row items-center px-3 py-1">
        <BotonVolver label="Volver" onPress={onVolver} />
      </View>
      <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerClassName="px-4"
        contentContainerStyle={{ paddingBottom: piso + 72 }}
      >
        <View className="gap-7">
          <Text className="px-1 pt-1 text-foreground text-large-title font-bold tracking-[-0.4px]">
            Configuración
          </Text>
          {!buscando ? cuenta : null}
          {coinciden.map((c) => (
            <View
              key={c.id}
              className="gap-7"
              onLayout={(e) => enPosicion(c.id, e.nativeEvent.layout.y)}
            >
              {c.bloques}
            </View>
          ))}
          {coinciden.length === 0 ? sinResultados : null}
        </View>
      </ScrollView>

      {/* El buscador de iOS 26: flota abajo y la lista pasa por detrás. */}
      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', left: 16, right: 16, bottom: pieBuscador }}
      >
        <SearchField value={busqueda} onChangeText={onBusqueda} placeholder="Buscar" />
      </View>
    </SafeAreaView>
  )
}

/**
 * La forma de la compu: Ajustes del Sistema de macOS. La barra lateral con el
 * buscador, la cuenta y las categorías; el detalle de la elegida a la derecha.
 * Buscando, el detalle muestra todo lo que coincide, de una.
 */
function Escritorio({
  categorias,
  initialId,
  coinciden,
  buscando,
  busqueda,
  onBusqueda,
  cuenta,
  novedades,
  sinResultados,
  onVolver,
}: {
  categorias: Categoria[]
  initialId?: string
  coinciden: Categoria[]
  buscando: boolean
  busqueda: string
  onBusqueda: (v: string) => void
  cuenta: ReactNode
  novedades: ReactNode
  sinResultados: ReactNode
  onVolver: () => void
}) {
  const [elegida, setElegida] = useState(() =>
    categorias.some((c) => c.id === initialId) ? initialId! : (categorias[0]?.id ?? ''),
  )
  const [plegada, setPlegada] = useState(false)
  const [hover, setHover] = useState(false)
  const actual = categorias.find((c) => c.id === elegida) ?? categorias[0]
  const mostradas = buscando ? coinciden : actual ? [actual] : []

  return (
    <Shell>
      <SafeAreaView className="flex-1 flex-row" edges={['top', 'bottom']}>
        <View testID="ajustes-lateral" style={{ width: plegada ? 64 : LATERAL_W, flexShrink: 0 }}
          onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}>
        {plegada ? <CollapsedSidebar side="left" hovered={hover} label="Mostrar categorías de configuración"
          resting={<View className="items-center"><IconSliders size={20} color={ICON_COLOR.muted} /></View>}
          onExpand={() => setPlegada(false)} /> : <Panel tone="lateral" className="flex-1">
          <CabeceraLateral titulo="Configuración">
            <BotonLateral label="Contraer categorías de configuración" onPress={() => setPlegada(true)}
              icono={<IconCollapseLeft size={17} color={ICON_COLOR.muted} />} />
          </CabeceraLateral>
          <View className="px-3 pb-3">
            <SearchField value={busqueda} onChangeText={onBusqueda} placeholder="Buscar" density="compact" />
          </View>
          {cuenta}
          <ScrollView className="flex-1" contentContainerClassName="gap-0.5 px-2 pt-3">
            {categorias.map((c) => {
              const activa = !buscando && c.id === actual?.id
              const Icono = c.icono
              return (
                <Pressable
                  key={c.id}
                  accessibilityRole="button"
                  accessibilityLabel={c.titulo}
                  accessibilityState={{ selected: activa }}
                  onPress={() => {
                    onBusqueda('')
                    setElegida(c.id)
                  }}
                  className={`h-[30px] flex-row items-center gap-2.5 rounded-md px-2 ${
                    activa ? 'bg-muted' : 'hover:bg-white/5 active:bg-muted'
                  }`}
                >
                  <Icono size={16} color={c.id === 'discord' || activa ? ICON_COLOR.foreground : ICON_COLOR.muted} />
                  <Text className={`min-w-0 flex-1 text-footnote ${activa ? 'text-foreground font-medium' : 'text-foreground'}`} numberOfLines={1}>{c.titulo}</Text>
                </Pressable>
              )
            })}
          </ScrollView>
        </Panel>}
        </View>

        <Panel className="min-w-0 flex-1">
          <View className="flex-row items-center gap-1 px-2 py-1">
            <BotonVolver label="Volver" onPress={onVolver} />
            <Text className="min-w-0 flex-1 text-foreground text-subheadline font-semibold" numberOfLines={1}>
              {buscando ? `Resultados de «${busqueda.trim()}»` : actual?.titulo}
            </Text>
          </View>
          <ScrollView
            className="flex-1"
            keyboardShouldPersistTaps="handled"
            contentContainerClassName="items-center px-8 pb-10 pt-6"
          >
            <View className="w-full gap-4" style={{ maxWidth: actual?.id === 'accesos' ? 720 : MAX_W }}>
              {mostradas.map((c) => (
                <View key={c.id} className="gap-4">
                  {buscando ? (
                    <Text className="px-1 text-muted-foreground text-footnote font-semibold uppercase tracking-[1.2px]">
                      {c.titulo}
                    </Text>
                  ) : null}
                  <AjustesCompactos>{c.bloques}</AjustesCompactos>
                </View>
              ))}
              {buscando && mostradas.length === 0 ? sinResultados : null}
              {!buscando && actual?.id === 'app' ? <AjustesCompactos>{novedades}</AjustesCompactos> : null}
            </View>
          </ScrollView>
        </Panel>
      </SafeAreaView>
    </Shell>
  )
}
