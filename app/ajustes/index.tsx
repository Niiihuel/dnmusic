import { useState, type ReactNode } from 'react'
import { Pressable, Text, useWindowDimensions, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  FilaAjuste,
  FilaCuenta,
  FilaInterruptor,
  FilaOpciones,
  GrupoAjustes,
} from '../../src/ui/Ajustes'
import { FilaSostener } from '../../src/ui/Mantener'
import { Avatar } from '../../src/ui/Avatar'
import { CabeceraLateral, BotonLateral } from '../../src/ui/CabeceraLateral'
import { CollapsedSidebar } from '../../src/ui/SidebarMotion'
import { ScrollArea as ScrollView } from '../../src/ui/ScrollArea'
import { Panel, Shell } from '../../src/ui/Panel'
import { SearchField } from '../../src/ui/SearchField'
import { Vacio } from '../../src/ui/Vacio'
import {
  ICON_COLOR,
  IconBack,
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
  cuantasListas,
  cuantasPendientes,
  espacioUsado,
  formatoBytes,
  HAY_DESCARGAS,
  useDescargas,
  reanudarDescargas,
} from '../../src/state/descargas'
import { setAutoplay, setPreferencia, setSoloWifi, useAjustes } from '../../src/state/ajustes'
import { programarApagado, useDormirMin } from '../../src/state/playback'
import { borrarHistorial } from '../../src/services/plays'
import { endSession, useMyProfile } from '../../src/state/session'
import { useNovedadesPendientes } from '../../src/state/novedadesVistas'
import { avisar } from '../../src/state/aviso'
import { mensajeError } from '../../src/lib/mensajeError'
import { useKeyboardH, usePiso } from '../../src/state/shell'
import { volver } from '../../src/lib/volver'
import { NOVEDADES } from '../../src/lib/novedades'
import { HAY_ACTUALIZADOR } from '../../src/state/actualizacion'
import { TECLADO_FISICO } from '../../src/lib/teclado'

/** Desde acá la pantalla es la de macOS: barra lateral con las categorías y el detalle al lado. */
const ESCRITORIO_PX = 780
/** Ancho de la barra lateral, el de Ajustes del Sistema. */
const LATERAL_W = 240
/** Tope del detalle: una lista agrupada más ancha se lee como una tabla. */
const MAX_W = 640
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
 * **En el teléfono es Configuración de iOS**: el título grande, la fila de la
 * cuenta arriba con la cara y el nombre, y debajo los bloques de filas —placa
 * de ícono, rótulo, valor en gris, chevron o interruptor— sin títulos de
 * sección (la raíz de Configuración no los lleva: cada bloque agrupa lo que va
 * junto y su pie explica lo que haga falta). El buscador **flota abajo**, como
 * en iOS 26, y la lista pasa por detrás.
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
  const ajustes = useAjustes()
  const dormirMin = useDormirMin()
  const perfil = useMyProfile()
  const nombre = perfil?.displayName?.trim() || perfil?.username || 'Tu cuenta'
  const { items } = useDescargas()
  const pendientes = useNovedadesPendientes()
  const [busqueda, setBusqueda] = useState('')
  const { width } = useWindowDimensions()
  const escritorio = width >= ESCRITORIO_PX
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
      icono: IconDisc,
      palabras:
        'reproducción autoplay seguir escuchando al terminar lista recomendaciones temporizador apagar dormir minutos pausa géneros artistas gustos música',
      visible: true,
      bloques: (
        <>
          <GrupoAjustes pie="Al terminar la lista, sigue con recomendaciones según lo que escuchás.">
            <FilaInterruptor
              rotulo="Seguir escuchando"
              icono={<IconDisc size={17} color={ICON_COLOR.muted} />}
              activo={ajustes.autoplay}
              onCambiar={setAutoplay}
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
        </>
      ),
    },
    {
      id: 'descargas',
      titulo: 'Descargas',
      icono: IconDownload,
      palabras: 'almacenamiento descargas espacio wifi datos conexión bajadas sin conexión',
      visible: HAY_DESCARGAS,
      bloques: (
        <GrupoAjustes pie="Con «Solo con Wi-Fi», las descargas esperan a tener una red sin consumo de datos.">
          <FilaAjuste
            rotulo="Descargas"
            valor={
              cuantasPendientes(items)
                ? `${cuantasPendientes(items)} en camino`
                : `${cuantasListas(items)} · ${formatoBytes(espacioUsado(items))}`
            }
            icono={<IconDisk size={17} color={ICON_COLOR.muted} />}
            onPress={() => router.push('/ajustes/descargas')}
          />
          <FilaInterruptor
            rotulo="Solo con Wi-Fi"
            icono={<IconWifi size={17} color={ICON_COLOR.muted} />}
            activo={ajustes.soloWifi}
            onCambiar={(v) => {
              setSoloWifi(v)
              if (!v) reanudarDescargas()
            }}
            ultima
          />
        </GrupoAjustes>
      ),
    },
    {
      id: 'app',
      titulo: 'La app',
      icono: IconSparkles,
      palabras: 'novedades actualizaciones versión avisos ayudas cursor interfaz app rótulos',
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
            ultima={!HAY_ACTUALIZADOR}
          />
          {HAY_ACTUALIZADOR ? (
            <FilaInterruptor
              rotulo="Avisar cuando haya una versión nueva"
              icono={<IconDownload size={17} color={ICON_COLOR.muted} />}
              activo={ajustes.avisosActualizacion}
              onCambiar={(v) => setPreferencia('avisosActualizacion', v)}
              ultima
            />
          ) : null}
        </GrupoAjustes>
      ),
    },
    {
      id: 'privacidad',
      titulo: 'Privacidad',
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
          <FilaSostener
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
      icono: IconUser,
      palabras: 'perfil foto nombre fuente tipografía espacio cerrar sesión salir cuenta',
      visible: true,
      bloques: (
        <GrupoAjustes pie="Cerrar sesión no borra nada: tus listas y tu perfil siguen en tu cuenta.">
          <FilaAjuste
            rotulo="Personalizar perfil"
            vacio=""
            icono={<IconUser size={17} color={ICON_COLOR.muted} />}
            onPress={() => router.push('/profile')}
          />
          <FilaSostener
            rotulo="Cerrar sesión"
            icono={<IconLogOut size={17} color={ICON_COLOR.muted} />}
            onCompletar={() => void endSession()}
            ultima
          />
        </GrupoAjustes>
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
              <Text className="text-foreground text-[15px] font-semibold" numberOfLines={1}>
                {nombre}
              </Text>
              <Text className="text-muted-foreground text-[12px]" numberOfLines={1}>
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
  coinciden,
  buscando,
  busqueda,
  onBusqueda,
  cuenta,
  sinResultados,
  onVolver,
}: {
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
  /* El buscador flota sobre el borde de abajo; con el teclado abierto se
     apoya sobre él. La lista reserva su alto para llegar a la última fila. */
  const pieBuscador = Math.max(insets.bottom, 12) + teclado

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      {/* La barra chica: solo la flecha. Configuración es una pantalla apilada
          en esta app —no una pestaña— y necesita su vuelta. */}
      <View className="flex-row items-center px-3 py-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver"
          onPress={onVolver}
          className="h-11 w-11 items-center justify-center rounded-full active:bg-muted"
        >
          <IconBack size={19} color={ICON_COLOR.foreground} />
        </Pressable>
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerClassName="px-4"
        contentContainerStyle={{ paddingBottom: piso + 72 }}
      >
        <View className="gap-7">
          <Text className="px-1 pt-1 text-foreground text-[34px] font-bold tracking-[-0.4px]">
            Configuración
          </Text>
          {!buscando ? cuenta : null}
          {coinciden.map((c) => (
            <View key={c.id} className="gap-7">
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
  coinciden: Categoria[]
  buscando: boolean
  busqueda: string
  onBusqueda: (v: string) => void
  cuenta: ReactNode
  novedades: ReactNode
  sinResultados: ReactNode
  onVolver: () => void
}) {
  const [elegida, setElegida] = useState(categorias[0]?.id ?? '')
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
                  <Icono size={16} color={activa ? ICON_COLOR.foreground : ICON_COLOR.muted} />
                  <Text className={`min-w-0 flex-1 text-[13px] ${activa ? 'text-foreground font-medium' : 'text-foreground'}`} numberOfLines={1}>{c.titulo}</Text>
                </Pressable>
              )
            })}
          </ScrollView>
        </Panel>}
        </View>

        <Panel className="min-w-0 flex-1">
          <View className="flex-row items-center gap-1 px-2 py-1">
            <BotonLateral label="Volver" onPress={onVolver} icono={<IconBack size={17} color={ICON_COLOR.foreground} />} />
            <Text className="min-w-0 flex-1 text-foreground text-[15px] font-semibold" numberOfLines={1}>
              {buscando ? `Resultados de «${busqueda.trim()}»` : actual?.titulo}
            </Text>
          </View>
          <ScrollView
            className="flex-1"
            keyboardShouldPersistTaps="handled"
            contentContainerClassName="items-center px-8 pb-10 pt-6"
          >
            <View className="w-full gap-6" style={{ maxWidth: MAX_W }}>
              {mostradas.map((c) => (
                <View key={c.id} className="gap-6">
                  {buscando ? (
                    <Text className="px-1 text-muted-foreground text-[13px] font-semibold uppercase tracking-[1.2px]">
                      {c.titulo}
                    </Text>
                  ) : null}
                  {c.bloques}
                </View>
              ))}
              {buscando && mostradas.length === 0 ? sinResultados : null}
              {!buscando && actual?.id === 'app' ? novedades : null}
            </View>
          </ScrollView>
        </Panel>
      </SafeAreaView>
    </Shell>
  )
}
