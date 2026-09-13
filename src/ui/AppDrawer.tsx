import type { AppDrawerProps } from './AppDrawer.types'
import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePlaybackTrack } from '../state/playback'
import { usePendientesChats } from '../state/session'
import { listPlaylists, type Playlist } from '../services/playlists'
import { Avatar } from './Avatar'
import {
  ICON_COLOR,
  IconChevronRight,
  IconDisc,
  IconInbox,
  IconMusic,
  IconPlus,
  IconSliders,
} from './icons'

/**
 * El panel lateral, **debajo** del contenido.
 *
 * No se dibuja encima ni en un modal: vive al fondo, de borde a borde, y lo que
 * se mueve es la app entera, que se corre a la derecha y se achica dejándolo a
 * la vista. Es como lo hace la app de Claude, y la diferencia no es un detalle:
 * un panel encima tapa; este **descubre**. Por eso acá no hay márgenes ni
 * esquinas redondeadas — el redondeo le toca al contenido que se aparta.
 *
 * ## La forma es la de Claude, y el ritmo también
 *
 * Tres tramos con pesos distintos: marca arriba, navegación al medio,
 * **contenido** abajo. Lo que hace que se lea como el referente no es la
 * estructura sino el aire: filas altas de **una sola línea** —sin subtítulos
 * que las hagan de dos alturas—, tipografía grande, y una sección de contenido
 * que respira lejos de la navegación. Apretado, el mismo esquema se leía como
 * un menú de opciones; con aire se lee como un lugar.
 *
 * El pie son dos piezas sueltas —el avatar y la píldora—, no una barra: la
 * lista de listas pasa por **debajo** de ellas a través de un fundido, que es
 * exactamente lo que hace el «+ Nuevo chat» del referente. Cerrar sesión ya no
 * está acá: es la única acción que te saca en vez de llevarte, y vive en
 * Ajustes, que es donde se buscan las cosas que se hacen una vez cada tanto.
 */
export function AppDrawer({
  name,
  avatarPath,
  onProfile,
  onPlaylists,
  onChats,
  onNowPlaying,
  onNewPlaylist,
  onOpenPlaylist,
  onAjustes,
}: AppDrawerProps) {
  const insets = useSafeAreaInsets()
  const sonando = usePlaybackTrack()
  /* Lo que espera en Chats: el mismo número del globito de la pestaña. */
  const pendientes = usePendientesChats()

  /*
   * Las listas se piden acá, y se piden cada vez que se abre.
   *
   * Este componente **solo está montado mientras el panel se ve** —lo monta y lo
   * desmonta `app/_layout.tsx` siguiendo la animación—, así que el pedido sale
   * al abrirlo y no queda nada corriendo con el panel cerrado. Que se repita en
   * cada apertura es lo que uno quiere: si creaste una lista hace diez segundos,
   * tiene que estar.
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
  }, [])

  return (
    /*
     * Del color del piso, no un escalón más claro.
     *
     * El panel ES el fondo de la escena: la app se aparta y lo descubre. Cuando
     * era `card` sobre un telón `background`, la costura entre los dos era una
     * línea recta vertical justo donde termina el panel — el «difuminado
     * cortado» que no seguía la curva de la tarjeta. Ahora el piso entero es
     * canvas (ver la raíz en `app/_layout.tsx`) y la jerarquía la pone la
     * luminancia al revés que antes: el fondo es lo más oscuro y **la app
     * flota más clara encima**, que es como lo dibuja el referente.
     */
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top + 12 }}>
      {/* La marca, no una tarjeta de perfil.
          Quién sos ya está abajo, en el avatar: repetirlo arriba en grande era
          gastar el tramo más visible del panel en un dato que no es un destino. */}
      <Text className="text-foreground px-6 pb-6 pt-2 text-title2 font-bold">dnmusic</Text>

      <ScrollView
        className="min-h-0 flex-1"
        /* El final pasa por debajo del pie: el hueco es para que la última
           lista se pueda leer por encima del fundido. */
        contentContainerStyle={{ paddingBottom: insets.bottom + 104 }}
      >
        <View className="gap-1 px-3">
          <Fila
            icon={<IconMusic size={20} color={ICON_COLOR.foreground} />}
            label="Tus listas"
            onPress={onPlaylists}
          />
          <Fila
            icon={<IconInbox size={20} color={ICON_COLOR.foreground} />}
            label="Conversaciones"
            badge={pendientes}
            onPress={onChats}
          />
          {/* Una sola línea, sin el título de la canción de subtítulo: las
              filas del panel son destinos parejos, y la que crecía al doble de
              alto desarmaba el ritmo de la columna. Qué suena ya lo dice la
              tarjeta del reproductor, que está siempre a la vista. */}
          {sonando ? (
            <Fila
              icon={<IconDisc size={20} color={ICON_COLOR.foreground} />}
              label="Lo que suena"
              onPress={onNowPlaying}
            />
          ) : null}
          {/* Los ajustes son el último destino de la navegación: se entra de
              vez en cuando, y no compite con lo que uno viene a hacer. */}
          <Fila
            icon={<IconSliders size={20} color={ICON_COLOR.foreground} />}
            label="Configuración"
            onPress={onAjustes}
          />
        </View>

        {/*
         * El contenido: tus listas por nombre, como el «Recientes» del
         * referente. El encabezado va en gris y chico —es un rótulo, no una
         * fila— y lejos de la navegación: la distancia es lo que separa los
         * tramos, no una línea.
         */}
        {listas && listas.length > 0 ? (
          <View className="mt-8 gap-0.5 px-3">
            <Text className="text-muted-foreground px-3 pb-2 text-footnote">Tus listas</Text>
            {listas.map((lista) => (
              <Pressable
                key={lista.id}
                accessibilityRole="button"
                accessibilityLabel={lista.name}
                onPress={() => onOpenPlaylist(lista.id)}
                className="rounded-xl px-3 py-3 active:bg-muted"
              >
                <Text className="text-foreground text-callout" numberOfLines={1}>
                  {lista.name}
                </Text>
              </Pressable>
            ))}
            {/* La salida de la sección, como el «Todos los chats ›»: lleva a
                la biblioteca entera, que es donde las listas se administran. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Todas tus listas"
              onPress={onPlaylists}
              className="flex-row items-center gap-1 rounded-xl px-3 py-3 active:bg-muted"
            >
              <Text className="text-muted-foreground text-subheadline">Todas tus listas</Text>
              <IconChevronRight size={15} color={ICON_COLOR.muted} />
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      {/*
       * El pie: dos piezas sueltas sobre un fundido, no una barra.
       *
       * El avatar y la píldora flotan sobre el final de la lista, y el
       * degradado —del gris del panel a nada— es lo que los despega de las
       * filas que pasan por debajo. Es el mismo recurso del reproductor sobre
       * las listas, y el mismo del referente. La píldora es el único blanco
       * puro del panel: `DESIGN.md` lo reserva para la acción primaria, y acá
       * la acción es crear.
       */}
      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        <View pointerEvents="box-none" style={{ flex: 1 }} />
        <LinearGradient
          pointerEvents="none"
          // canvas (#000) hacia transparente, de abajo hacia arriba: el mismo
          // color del panel, o el fundido se vería como una mancha más clara.
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.9)', 'rgb(0,0,0)']}
          locations={[0, 0.45, 1]}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: insets.bottom + 96 }}
        />
        <View
          className="flex-row items-center justify-between px-5"
          style={{ paddingBottom: insets.bottom + 10 }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ver tu perfil"
            onPress={onProfile}
            className="rounded-full active:opacity-70"
          >
            <Avatar name={name} path={avatarPath} size={40} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Nueva lista"
            onPress={onNewPlaylist}
            className="h-11 flex-row items-center gap-1.5 rounded-full bg-primary px-5 active:opacity-80"
          >
            <IconPlus size={16} color={ICON_COLOR.onPrimary} />
            <Text className="text-primary-foreground text-subheadline font-semibold">Nueva lista</Text>
          </Pressable>
        </View>
      </View>
    </View>
  )
}

/** Fila de navegación: ícono y rótulo, una sola línea, con aire. */
function Fila({
  icon,
  label,
  badge = 0,
  onPress,
}: {
  icon: React.ReactNode
  label: string
  /** Cuánto espera adentro: con más de cero, el globito contra el borde. */
  badge?: number
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={badge > 0 ? `${label}, ${badge} sin ver` : label}
      onPress={onPress}
      className="flex-row items-center gap-4 rounded-xl px-3 py-3.5 active:bg-muted"
    >
      <View className="w-6 items-center">{icon}</View>
      <Text className="min-w-0 flex-1 text-foreground text-body font-medium" numberOfLines={1}>
        {label}
      </Text>
      {/* El mismo globito de la pestaña y de una conversación sin leer:
          blanco —el acento— con el número oscuro. */}
      {badge > 0 ? (
        <View className="min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5">
          <Text className="text-primary-foreground text-caption2 font-semibold">
            {Math.min(badge, 99)}
          </Text>
        </View>
      ) : null}
    </Pressable>
  )
}
