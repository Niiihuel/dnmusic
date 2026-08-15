import { useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, Text, useWindowDimensions, View } from 'react-native'
import type { Playlist } from '../services/playlists'
import { useCuantosMeGusta } from '../state/gustos'
import { usePiso, useTecho } from '../state/shell'
import { useColapso } from './useColapso'
import { Panel } from './Panel'
import { PlaylistCover } from './PlaylistCover'
import { SkeletonList } from './Skeleton'
import { AnimatedSidebarTitle } from './SidebarMotion'
import { BotonVidrio } from './Glass'
import { Vacio } from './Vacio'
import {
  ICON_COLOR,
  IconCollapseRight,
  IconGlobe,
  IconHeartFilled,
  IconMusic,
  IconPlus,
} from './icons'

/**
 * Tus listas, en el panel de la derecha.
 *
 * Es el equivalente de la biblioteca de Spotify: la lista de listas queda
 * siempre a mano mientras el centro muestra la que estás mirando, así cambiar
 * de una a otra no es navegar a ningún lado.
 */
export function PlaylistLibrary({
  playlists,
  openId,
  soundingId,
  showCollapse,
  onCollapse,
  onOpen,
  onCreate,
  onOpenGustos,
  error,
}: {
  playlists: Playlist[] | null
  /** La que se está mirando en el centro. */
  openId: string | null
  /** La que está sonando, que puede no ser la que se mira. */
  soundingId: string | null
  /** Se muestra el botón de contraer: el panel está bajo el cursor. */
  showCollapse: boolean
  onCollapse: () => void
  onOpen: (playlist: Playlist) => void
  onCreate: () => Promise<void>
  /** Abre «Tus me gusta». Sin esto la fila fija no se dibuja. */
  onOpenGustos?: () => void
  error: string | null
}) {
  const [busy, setBusy] = useState(false)
  const cuantosGustos = useCuantosMeGusta()
  /* En el teléfono esto es la pestaña «Listas» y llega hasta el borde: la
     última tiene que quedar arriba de lo que flota. */
  const piso = usePiso(12)
  /* Como pestaña del teléfono, el título arranca debajo del encabezado que
     flota, con el respiro que ya tenía (`pt-4`). En escritorio vale eso solo. */
  const techo = useTecho(16)
  /* Mismo criterio que las filas de canciones: con el dedo, las medidas de
     escritorio quedan apretadas. Ver `TrackRow`. */
  const suelto = useWindowDimensions().width < 780
  const colapso = useColapso()

  /*
   * Crear no pregunta nada.
   *
   * Antes había un formulario con su campo y su botón «Crear lista», y era
   * pedir un nombre en el único momento en que todavía no se sabe cuál. Ahora
   * el «+» crea y abre; el nombre se cambia después, desde la lista misma.
   */
  async function create() {
    if (busy) return
    setBusy(true)
    try {
      await onCreate()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel tone="lateral" className="flex-1">
      <View className="flex-row items-center justify-between gap-4 px-4 pb-2" style={{ paddingTop: techo }}>
        <AnimatedSidebarTitle
          visible={showCollapse}
          label="Contraer las listas"
          icon={<IconCollapseRight size={17} color={ICON_COLOR.muted} />}
          onPress={onCollapse}
          alignIconToFirstLine
        >
          <View className="gap-0.5">
            <Text className="text-foreground text-lg font-bold" numberOfLines={1}>
              Tus listas
            </Text>
            <Text className="text-muted-foreground text-xs" numberOfLines={1}>
              {playlists === null
                ? 'Cargando…'
                : `${playlists.length} ${playlists.length === 1 ? 'lista' : 'listas'}`}
            </Text>
          </View>
        </AnimatedSidebarTitle>
        <View className="flex-row items-center gap-1">
          {/* En vidrio como los redondeles del encabezado: es un control
              apoyado sobre el panel, y era el único que quedaba gris plano. */}
          <BotonVidrio
            label="Nueva lista"
            onPress={() => void create()}
            disabled={busy}
            radius={18}
            style={{ width: 36, height: 36 }}
          >
            {busy ? (
              <ActivityIndicator size="small" color={ICON_COLOR.muted} />
            ) : (
              <IconPlus size={15} color={ICON_COLOR.foreground} />
            )}
          </BotonVidrio>
        </View>
      </View>

      {error ? <Text className="px-4 pb-2 text-destructive text-xs">{error}</Text> : null}

      {playlists === null ? (
        <View className="px-4">
          <SkeletonList rows={4} />
        </View>
      ) : (
        <FlatList
          data={playlists}
          keyExtractor={(p) => p.id}
          className="min-h-0 flex-1"
          contentContainerClassName="gap-0.5 px-2"
          contentContainerStyle={{ paddingBottom: piso }}
          {...colapso}
          /* «Tus me gusta» va fija arriba, como en Spotify: no es una lista
             tuya —no se renombra ni se borra— pero es de donde más se
             escucha, y enterrarla entre las listas la volvería invisible. */
          ListHeaderComponent={
            onOpenGustos ? (
              <Pressable
                accessibilityRole="button"
                onPress={onOpenGustos}
                className={`flex-row items-center rounded-lg ${
                  suelto ? 'gap-3 p-2.5' : 'gap-3 p-2'
                } active:bg-card`}
              >
                <View
                  className="items-center justify-center rounded bg-muted"
                  style={{ width: suelto ? 60 : 48, height: suelto ? 60 : 48 }}
                >
                  <IconHeartFilled size={suelto ? 24 : 20} color={ICON_COLOR.foreground} />
                </View>
                <View className="min-w-0 flex-1 gap-0.5">
                  <Text
                    className={`text-foreground ${suelto ? 'text-[16px]' : 'text-[14px]'}`}
                    numberOfLines={1}
                  >
                    Tus me gusta
                  </Text>
                  <Text
                    className={`text-muted-foreground ${suelto ? 'text-[13px]' : 'text-[12px]'}`}
                    numberOfLines={1}
                  >
                    Colección · {cuantosGustos} {cuantosGustos === 1 ? 'canción' : 'canciones'}
                  </Text>
                </View>
              </Pressable>
            ) : null
          }
          ListEmptyComponent={
            <Vacio
              icono={<IconMusic size={22} color={ICON_COLOR.muted} />}
              titulo="Todavía no tenés listas"
              detalle="Creá la primera y sumale lo que quieras."
              accion={{ rotulo: 'Nueva lista', onPress: () => void onCreate() }}
            />
          }
          renderItem={({ item }) => {
            const open = item.id === openId
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: open }}
                onPress={() => onOpen(item)}
                className={`flex-row items-center rounded-lg ${
                  suelto ? 'gap-3 p-2.5' : 'gap-3 p-2'
                } ${open ? 'bg-muted' : 'active:bg-card'}`}
              >
                <PlaylistCover
                  covers={item.covers}
                  coverPath={item.coverPath}
                  size={suelto ? 60 : 48}
                />
                <View className="min-w-0 flex-1 gap-0.5">
                  <Text
                    /* El que suena va en blanco, que en este sistema es el
                       acento — el equivalente del verde de Spotify. */
                    className={`${suelto ? 'text-[16px]' : 'text-[14px]'} ${
                      item.id === soundingId
                        ? 'text-foreground font-semibold'
                        : 'text-foreground'
                    }`}
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>
                  <View className="flex-row items-center gap-1.5">
                    {/* El mundito antes del texto: publicada es una condición
                        de la lista, y saberlo de un vistazo en la biblioteca
                        evita tener que abrirlas una por una para acordarse de
                        cuál compartiste. */}
                    {item.visibilidad === 'publica' ? (
                      <IconGlobe size={11} color={ICON_COLOR.muted} />
                    ) : null}
                    <Text
                      className={`text-muted-foreground min-w-0 shrink ${
                        suelto ? 'text-[13px]' : 'text-[12px]'
                      }`}
                      numberOfLines={1}
                    >
                      Lista · {item.tracks} {item.tracks === 1 ? 'canción' : 'canciones'}
                    </Text>
                  </View>
                </View>
                {item.id === soundingId ? (
                  <View className="h-1.5 w-1.5 rounded-full bg-foreground" />
                ) : null}
              </Pressable>
            )
          }}
        />
      )}
    </Panel>
  )
}

/**
 * Las tapas solas, para la franja del panel contraído.
 *
 * Una lista se reconoce por su portada mucho antes que por su nombre —es el
 * mismo motivo por el que existe el mosaico de `PlaylistCover`—, así que
 * contraído se muestran las tapas y nada más: la franja pasa de ser un hueco
 * con un ícono a ser una versión reducida y honesta de lo que hay abajo.
 *
 * Van centradas en la franja y no pegadas a un borde: la franja es angosta y
 * cualquier alineación deja un margen visiblemente distinto de cada lado.
 */
export function PlaylistRail({ playlists }: { playlists: Playlist[] | null }) {
  if (!playlists?.length) return null
  return (
    <View className="items-center gap-2 px-2">
      {playlists.map((p) => (
        <PlaylistCover key={p.id} covers={p.covers} coverPath={p.coverPath} size={44} />
      ))}
    </View>
  )
}
