import { useEffect, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePlaybackTrack } from '../state/playback'
import { listPlaylists, type Playlist } from '../services/playlists'
import { Avatar } from './Avatar'
import {
  ICON_COLOR,
  IconDisc,
  IconInbox,
  IconLogOut,
  IconMusic,
  IconPlus,
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
 * Ocupa también la franja de la hora y la de abajo, que es justo lo que se veía
 * mal cuando el panel flotaba: quedaban dos recortes negros que no eran de
 * nadie.
 *
 * ## Por qué esta forma y no una lista de filas
 *
 * Antes era una tarjeta grande de perfil arriba y debajo cinco filas iguales,
 * cada una con su ícono adentro de un redondel gris. Se veía ordenado y decía
 * muy poco: cinco destinos, ningún contenido, y la mitad del alto vacío.
 *
 * La forma de Claude reparte el panel en tres tramos con pesos distintos —marca
 * arriba, navegación al medio, **contenido** abajo— y ese contenido es lo que
 * hace que abrirlo sirva para algo más que cambiar de sección: entrás a una
 * lista desde acá, sin pasar por la pestaña.
 *
 * Los redondeles de los íconos se fueron con eso. Con navegación y contenido en
 * la misma columna, el chip gris de cada fila competía en peso con las carátulas
 * de las listas y hacía leer la navegación como si fuera lo importante.
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
  onLogout,
}: {
  name: string
  avatarPath: string | null | undefined
  onProfile: () => void
  onPlaylists: () => void
  onChats: () => void
  onNowPlaying: () => void
  onNewPlaylist: () => void
  /** Abre una lista puntual, sin pasar por la pestaña. */
  onOpenPlaylist: (id: string) => void
  onLogout: () => void
}) {
  const insets = useSafeAreaInsets()
  const sonando = usePlaybackTrack()

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
     * Un escalón más claro que la app: `card` contra `background`.
     *
     * Los dos eran el mismo gris y, con la app corrida encima, no se veía dónde
     * terminaba una y empezaba el otro — el panel parecía un hueco. `DESIGN.md`
     * separa superficies por luminancia, y esta es exactamente esa situación.
     */
    <View
      className="flex-1 bg-card"
      style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }}
    >
      {/* La marca, no una tarjeta de perfil.
          Quién sos ya está abajo, en el avatar: repetirlo arriba en grande era
          gastar el tramo más visible del panel en un dato que no es un destino. */}
      <Text className="text-foreground px-5 pb-4 pt-2 text-[22px] font-bold">dnmusic</Text>

      <ScrollView className="min-h-0 flex-1" contentContainerClassName="pb-4">
        <View className="gap-0.5 px-2">
          <Fila
            icon={<IconMusic size={18} color={ICON_COLOR.foreground} />}
            label="Tus listas"
            onPress={onPlaylists}
          />
          <Fila
            icon={<IconInbox size={18} color={ICON_COLOR.foreground} />}
            label="Conversaciones"
            onPress={onChats}
          />
          {sonando ? (
            <Fila
              icon={<IconDisc size={18} color={ICON_COLOR.foreground} />}
              label="Lo que suena"
              detail={sonando.title}
              onPress={onNowPlaying}
            />
          ) : null}
        </View>

        {/*
         * El contenido: tus listas por nombre.
         *
         * El encabezado va en gris y chico, como el «Recientes» del referente —
         * es un rótulo de sección, no una fila más, y si pesara igual que las
         * de arriba se leería como un sexto destino.
         */}
        {listas && listas.length > 0 ? (
          <View className="mt-6 gap-0.5 px-2">
            <Text className="text-muted-foreground px-3 pb-1 text-[12px]">Tus listas</Text>
            {listas.map((lista) => (
              <Pressable
                key={lista.id}
                accessibilityRole="button"
                accessibilityLabel={lista.name}
                onPress={() => onOpenPlaylist(lista.id)}
                className="rounded-xl px-3 py-2.5 active:bg-muted"
              >
                <Text className="text-foreground text-[15px]" numberOfLines={1}>
                  {lista.name}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>

      {/*
       * El pie: quién sos y la acción principal, en una línea.
       *
       * Es el único blanco puro del panel —`DESIGN.md` lo reserva para la acción
       * primaria— y por eso hay **una** píldora y no dos. Cerrar sesión queda al
       * lado del avatar, en gris y sin texto: es la única de acá que no te lleva
       * a ningún lado sino que te saca, y no compite con crear una lista.
       */}
      <View className="flex-row items-center gap-1 px-4 pt-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ver tu perfil"
          onPress={onProfile}
          className="rounded-full active:opacity-70"
        >
          <Avatar name={name} path={avatarPath} size={36} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cerrar sesión"
          onPress={onLogout}
          className="h-9 w-9 items-center justify-center rounded-full active:bg-muted"
        >
          <IconLogOut size={17} color={ICON_COLOR.muted} />
        </Pressable>

        <View className="flex-1" />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Nueva lista"
          onPress={onNewPlaylist}
          className="h-10 flex-row items-center gap-1.5 rounded-full bg-primary px-4 active:opacity-80"
        >
          <IconPlus size={16} color={ICON_COLOR.onPrimary} />
          <Text className="text-primary-foreground text-[14px] font-semibold">Nueva lista</Text>
        </Pressable>
      </View>
    </View>
  )
}

function Fila({
  icon,
  label,
  detail,
  onPress,
}: {
  icon: React.ReactNode
  label: string
  detail?: string
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-xl px-3 py-2.5 active:bg-muted"
    >
      <View className="w-6 items-center">{icon}</View>
      <View className="min-w-0 flex-1">
        <Text className="text-foreground text-[15px] font-medium">{label}</Text>
        {detail ? (
          <Text className="text-muted-foreground text-[12px]" numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
    </Pressable>
  )
}
