import { useState, type ReactNode, type RefObject } from 'react'
import { Pressable, ScrollView, Text, View, type TextInput } from 'react-native'
import type { Playlist } from '../services/playlists'
import { useTermino } from '../state/busqueda'
import { useCuantosMeGusta } from '../state/gustos'
import { useWantPlay } from '../state/playback'
import { usePiso } from '../state/shell'
import { SearchField } from './SearchField'
import { Avatar } from './Avatar'
import { MantenerApretado, Menu, type MenuItem } from './Menu'
import { Panel } from './Panel'
import { PlayingBars } from './PlayingBars'
import { PlaylistCover } from './PlaylistCover'
import { SkeletonList } from './Skeleton'
import { useClicDerecho } from './useClicDerecho'
import {
  ICON_COLOR,
  IconCollapseRight,
  IconDownload,
  IconHeartFilled,
  IconHome,
  IconInbox,
  IconLogOut,
  IconMusic,
  IconPlus,
  IconSliders,
  IconUser,
  type IconProps,
} from './icons'

/** Dónde está parado quien mira, para marcar la fila. */
export type SeccionLateral = 'inicio' | 'gustos' | 'listas' | 'otra'

/**
 * La barra lateral del escritorio: la navegación de la app, al modo de macOS.
 *
 * Es la *source list* de Música, Notas o el Finder —y lo que la HIG llama una
 * *navigation split view*—: a la izquierda, angosta y oscura, **a dónde se
 * puede ir**; a la derecha, grande y clara, lo que se está mirando. Antes la
 * columna izquierda era solo la biblioteca de listas, con filas altas y su
 * propio título: para llegar a la portada, a los chats o a la configuración
 * había que ir al encabezado. Con la navegación en la barra, el encabezado
 * queda para lo que es del contenido —atrás, adelante, buscar— y el resto de
 * la ventana es contenido.
 *
 * Las medidas son las del sistema: filas de 30 con el ícono de 16 y el rótulo
 * de 13, secciones con su rótulo en gris, y la elegida marcada con un escalón
 * de luminancia (`muted`), sin color. Las listas van como en Música: una fila
 * por lista con su tapa chica, y el «+» en el rótulo de la sección.
 */
export function BarraLateral({
  playlists,
  openId,
  seccion,
  soundingId,
  pendientesChats,
  nombre,
  usuario,
  avatarPath,
  showCollapse,
  onCollapse,
  onBuscar,
  inputRef,
  placeholderBusqueda = 'Buscar',
  buscando = false,
  onInicio,
  onChats,
  onGustos,
  onListas,
  onImportar,
  onNuevaLista,
  onOpen,
  onConfiguracion,
  onPerfil,
  onSalir,
  menuFor,
  error,
}: {
  playlists: Playlist[] | null
  /** La lista que se está mirando en el medio. */
  openId: string | null
  seccion: SeccionLateral
  /** La que está sonando, que puede no ser la que se mira. */
  soundingId: string | null
  pendientesChats: number
  nombre: string
  usuario: string
  avatarPath: string | null | undefined
  /** Se muestra el botón de contraer: la barra está bajo el cursor. */
  showCollapse: boolean
  onCollapse: () => void
  /**
   * Lo que se escribe en el buscador de arriba de la barra.
   *
   * Es el buscador de Música en la Mac: vive en la barra lateral y los
   * resultados toman el panel del medio. La pantalla decide qué hacer con el
   * texto; la barra solo lo entrega tecla a tecla.
   */
  onBuscar: (termino: string) => void
  /** Para que otra pantalla pueda mandar el cursor al buscador. */
  inputRef?: RefObject<TextInput | null>
  placeholderBusqueda?: string
  buscando?: boolean
  onInicio: () => void
  onChats: () => void
  onGustos: () => void
  onListas: () => void
  onImportar: () => void
  onNuevaLista: () => Promise<void>
  onOpen: (playlist: Playlist) => void
  onConfiguracion: () => void
  onPerfil: () => void
  onSalir: () => void
  /** Las acciones de una lista, para el click derecho sobre su fila. */
  menuFor?: (playlist: Playlist) => MenuItem[]
  error: string | null
}) {
  const [creando, setCreando] = useState(false)
  const cuantosGustos = useCuantosMeGusta()
  const suena = useWantPlay()
  const piso = usePiso(12)

  async function crear() {
    if (creando) return
    setCreando(true)
    try {
      await onNuevaLista()
    } finally {
      setCreando(false)
    }
  }

  return (
    <Panel tone="lateral" className="flex-1">
      {/* La barra de arriba: solo el botón de contraer, bajo el cursor. macOS
          no le pone título a la barra lateral: las secciones ya dicen qué hay. */}
      <View className="h-9 flex-row items-center justify-end px-2 pt-1">
        {showCollapse ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Contraer la barra lateral"
            onPress={onCollapse}
            className="h-7 w-7 items-center justify-center rounded-md active:bg-muted hover:bg-white/5"
          >
            <IconCollapseRight size={15} color={ICON_COLOR.muted} />
          </Pressable>
        ) : null}
      </View>

      <View className="px-2 pb-2">
        <CampoBusquedaLateral
          onBuscar={onBuscar}
          inputRef={inputRef}
          placeholder={placeholderBusqueda}
          buscando={buscando}
        />
      </View>

      <ScrollView className="min-h-0 flex-1" contentContainerClassName="gap-1 px-2" contentContainerStyle={{ paddingBottom: piso }}>
        <FilaLateral icono={IconHome} label="Inicio" activa={seccion === 'inicio'} onPress={onInicio} />
        <FilaLateral
          icono={IconInbox}
          label="Chats"
          activa={false}
          globito={pendientesChats}
          onPress={onChats}
        />

        <Seccion titulo="Biblioteca">
          <FilaLateral
            icono={IconHeartFilled}
            label="Tus me gusta"
            detalle={cuantosGustos ? String(cuantosGustos) : undefined}
            activa={seccion === 'gustos'}
            onPress={onGustos}
          />
          <FilaLateral icono={IconMusic} label="Todas las listas" activa={seccion === 'listas'} onPress={onListas} />
          <FilaLateral icono={IconDownload} label="Traer de Spotify" activa={false} onPress={onImportar} />
        </Seccion>

        <Seccion
          titulo="Listas"
          accion={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Nueva lista"
              accessibilityState={{ busy: creando }}
              onPress={() => void crear()}
              className="h-6 w-6 items-center justify-center rounded-md active:bg-muted hover:bg-white/5"
            >
              <IconPlus size={14} color={ICON_COLOR.muted} />
            </Pressable>
          }
        >
          {error ? <Text className="px-2 py-1 text-muted-foreground text-[12px]">{error}</Text> : null}
          {playlists === null ? (
            <View className="px-1 py-1">
              <SkeletonList rows={4} />
            </View>
          ) : playlists.length === 0 ? (
            <Text className="px-2 py-1 text-muted-foreground text-[12px]">
              Todavía no hay listas. El «+» crea la primera.
            </Text>
          ) : (
            playlists.map((p) => (
              <FilaLista
                key={p.id}
                playlist={p}
                activa={openId === p.id}
                sonando={soundingId === p.id}
                suena={suena}
                menu={menuFor?.(p)}
                onPress={() => onOpen(p)}
              />
            ))
          )}
        </Seccion>
      </ScrollView>

      {/*
       * El pie: la configuración y la cuenta, como el pie de la barra de
       * Notas o de Mail. La cuenta es un menú —tu perfil, salir— porque lo
       * que se hace con ella se hace poco y no merece dos filas permanentes.
       */}
      <View className="gap-1 px-2 pb-3 pt-1">
        <FilaLateral icono={IconSliders} label="Configuración" activa={false} onPress={onConfiguracion} />
        <Menu
          label="Tu cuenta"
          triggerFullWidth
          items={[
            {
              label: 'Tu perfil',
              onPress: onPerfil,
              icon: <IconUser size={15} color={ICON_COLOR.muted} />,
              sfSymbol: 'person',
            },
            {
              label: 'Cerrar sesión',
              onPress: onSalir,
              destructive: true,
              icon: <IconLogOut size={15} color={ICON_COLOR.muted} />,
              sfSymbol: 'rectangle.portrait.and.arrow.right',
            },
          ]}
          trigger={
            <View className="w-full flex-row items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/5">
              <Avatar name={nombre} path={avatarPath} size={28} />
              <View className="min-w-0 flex-1">
                <Text className="text-foreground text-[13px] font-semibold" numberOfLines={1}>
                  {nombre}
                </Text>
                <Text className="text-muted-foreground text-[11px]" numberOfLines={1}>
                  @{usuario}
                </Text>
              </View>
            </View>
          }
        />
      </View>
    </Panel>
  )
}

/**
 * El buscador de la barra lateral.
 *
 * Es su propia pieza por lo mismo que lo era el campo del encabezado: lee lo
 * que se teclea (`useTermino`) y se redibuja con cada tecla, así que no puede
 * vivir en la pantalla —que se redibujaría entera— ni en la barra, que
 * redibujaría todas sus listas por una letra.
 */
export function CampoBusquedaLateral({
  onBuscar,
  inputRef,
  placeholder,
  buscando = false,
}: {
  onBuscar: (termino: string) => void
  inputRef?: RefObject<TextInput | null>
  placeholder: string
  buscando?: boolean
}) {
  const value = useTermino()
  return (
    <SearchField
      inputRef={inputRef}
      value={value}
      onChangeText={onBuscar}
      placeholder={placeholder}
      loading={buscando}
    />
  )
}

/** Un grupo de filas con su rótulo en gris, y una acción chica a la derecha si la hay. */
function Seccion({ titulo, accion, children }: { titulo: string; accion?: ReactNode; children: ReactNode }) {
  return (
    <View className="pt-4">
      <View className="h-6 flex-row items-center justify-between px-2">
        <Text className="text-muted-foreground text-[11px] font-semibold">{titulo}</Text>
        {accion}
      </View>
      <View className="gap-0.5 pt-1">{children}</View>
    </View>
  )
}

/**
 * Una fila de la barra: ícono, rótulo, y a la derecha un dato chico o la
 * cuenta de lo que espera. Elegida, se marca con `muted` y el ícono en blanco.
 */
function FilaLateral({
  icono: Icono,
  label,
  detalle,
  globito,
  activa,
  onPress,
}: {
  icono: (p: IconProps) => React.ReactElement
  label: string
  detalle?: string
  globito?: number
  activa: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: activa }}
      onPress={onPress}
      className={`h-[30px] flex-row items-center gap-2.5 rounded-md px-2 ${
        activa ? 'bg-muted' : 'hover:bg-white/5 active:bg-muted'
      }`}
    >
      <Icono size={16} color={activa ? ICON_COLOR.foreground : ICON_COLOR.muted} />
      <Text
        className={`min-w-0 flex-1 text-[13px] ${activa ? 'text-foreground font-medium' : 'text-foreground'}`}
        numberOfLines={1}
      >
        {label}
      </Text>
      {globito ? (
        <View className="min-w-[18px] items-center justify-center rounded-full bg-primary px-1">
          <Text className="text-primary-foreground text-[10px] font-bold leading-[16px]">
            {Math.min(globito, 99)}
          </Text>
        </View>
      ) : detalle ? (
        <Text className="text-muted-foreground text-[11px] tabular-nums">{detalle}</Text>
      ) : null}
    </Pressable>
  )
}

/**
 * Una lista en la barra: la tapa chica y el nombre, como en Música. La que
 * suena lleva las barritas a la derecha; la que se mira, el fondo `muted`.
 * El click derecho —y mantener apretado— abre el menú de la lista.
 */
function FilaLista({
  playlist,
  activa,
  sonando,
  suena,
  menu,
  onPress,
}: {
  playlist: Playlist
  activa: boolean
  sonando: boolean
  suena: boolean
  menu?: MenuItem[]
  onPress: () => void
}) {
  const clic = useClicDerecho()
  const fila = (
    <View {...clic.gestos}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Abrir la lista ${playlist.name}`}
        accessibilityState={{ selected: activa }}
        onPress={onPress}
        className={`h-[30px] flex-row items-center gap-2.5 rounded-md px-2 ${
          activa ? 'bg-muted' : 'hover:bg-white/5 active:bg-muted'
        }`}
      >
        <View className="overflow-hidden rounded-[4px]">
          <PlaylistCover covers={playlist.covers} coverPath={playlist.coverPath} size={18} />
        </View>
        <Text
          className={`min-w-0 flex-1 text-[13px] ${sonando ? 'text-foreground font-medium' : 'text-foreground'}`}
          numberOfLines={1}
        >
          {playlist.name}
        </Text>
        {sonando ? <PlayingBars playing={suena} size={12} /> : null}
      </Pressable>
      {clic.punto && menu?.length ? (
        <Menu items={menu} sinDisparador abiertoEn={clic.punto} onCerrarPunto={clic.cerrar} />
      ) : null}
    </View>
  )
  return menu?.length ? <MantenerApretado items={menu}>{fila}</MantenerApretado> : fila
}
