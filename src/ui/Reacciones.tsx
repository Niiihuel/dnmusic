import { AccionSocial } from './Social'
import { AutoresReaccion } from './AutoresReaccion'
import { useLecturaViva } from './useLecturaViva'
import { TextoPerfil as Text } from './FuentePerfil'
import { useCallback, useEffect, useRef, useState } from 'react'
import { escuchaVigente, VIGENCIA_ESCUCHA_MS } from '../services/lecturaViva'
import { useUser } from '../state/session'
import { Image, ScrollView, View } from 'react-native'
import { artworkSource } from '../lib/artwork'
import { mensajeError } from '../lib/mensajeError'
import {
  escuchaDe,
  reaccionar,
  reaccionesDe,
} from '../services/reacciones'
import { avisar } from '../state/aviso'
import { Avatar } from './Avatar'
import { PlayingBars } from './PlayingBars'
import { ICON_COLOR, IconMusic } from './icons'

/**
 * La tapa de una canción, con su hueco cuando no hay.
 *
 * Es la misma pieza que dibuja `TrackRow` inline; acá se necesita en dos
 * tamaños distintos dentro del mismo archivo, así que vale nombrarla.
 */
function Tapa({ uri, size }: { uri: string | null; size: number }) {
  if (uri) {
    return (
      <Image source={{ uri }} className="rounded bg-muted" style={{ width: size, height: size }} />
    )
  }
  return (
    <View
      className="items-center justify-center rounded bg-muted"
      style={{ width: size, height: size }}
    >
      <IconMusic size={Math.round(size * 0.4)} color={ICON_COLOR.muted} />
    </View>
  )
}

/**
 * Los emojis que se ofrecen, y nada más.
 *
 * Un teclado de emojis completo convierte «reaccioná» en «elegí entre tres mil
 * cosas», y lo que se busca es el gesto de un toque. Seis alcanzan para decir
 * lo que se dice sobre una canción — que está buena, que sorprende, que
 * emociona, que da risa, que es un temazo, que la conocés.
 */
export const EMOJIS = ['🔥', '💜', '😭', '😂', '🎧', '👀'] as const

/**
 * Qué está escuchando esta persona, con los emojis para decírselo.
 *
 * Es la idea de Airbuds puesta en el perfil: la música ajena que suena **ahora**
 * es lo más vivo que tiene un perfil, y señalarla tiene que costar un toque.
 *
 * Solo aparece con opt-in, escucha vigente y permiso — la base devuelve
 * vacío en los dos casos y no se distinguen. Sin esto no hay hueco: un cartel
 * de «no está escuchando nada» sería contar una ausencia que a nadie le sirve.
 */
export function EscuchaConReacciones({
  ownerId,
  nombre,
  onReaccion,
}: {
  ownerId: string
  nombre: string
  /** Se acaba de mandar una: el perfil recarga su lista. */
  onReaccion?: () => void
}) {
  const leer = useCallback((signal?: AbortSignal) => escuchaDe(ownerId, signal), [ownerId])
  const user = useUser()
  const escucha = useLecturaViva(`${user?.id ?? ''}:${ownerId}`, leer)
  const puedeReaccionar = !!user && user.id !== ownerId && !!onReaccion
  const [, actualizarReloj] = useState(0)
  // Caduca incluso si la siguiente RPC queda esperando por una desconexión.
  const latido = escucha?.cuando?.getTime()
  useEffect(() => {
    if (latido === undefined) return
    const timer = setTimeout(() => actualizarReloj(n => n + 1), Math.max(0, latido + VIGENCIA_ESCUCHA_MS - Date.now() + 1))
    return () => clearTimeout(timer)
  }, [latido])
  const enviando = useRef(false)
  /* Cuál se está mandando: apaga la fila entera mientras viaja, así un toque
     nervioso no manda seis. */
  const [mandando, setMandando] = useState<string | null>(null)
  /* El último emoji que mandaste, para que el botón lo confirme sin recargar. */
  const [mandado, setMandado] = useState<string | null>(null)


  const mandar = useCallback(
    async (emoji: string) => {
      if (enviando.current || !puedeReaccionar || !escucha || !escuchaVigente(escucha.suena, escucha.cuando)) return
      enviando.current = true
      setMandando(emoji)
      try {
        await reaccionar(ownerId, emoji)
        setMandado(`${escucha.track.videoId}:${emoji}`)
        onReaccion?.()
      } catch (e) {
        avisar(mensajeError(e), true)
      } finally {
        enviando.current = false
        setMandando(null)
      }
    },
    [escucha, onReaccion, ownerId, puedeReaccionar],
  )

  if (!escucha || !escuchaVigente(escucha.suena, escucha.cuando)) return null

  const { track, suena } = escucha

  return (
    <View className="gap-3 rounded-2xl bg-card p-4">
      <View className="flex-row items-center gap-3">
        <Tapa uri={artworkSource(track.artworkPath, track.artworkUrl, 96)} size={48} />
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-2">
            {/* Las mismas barras que marcan la canción que suena en una lista:
                una interfaz sin colores distingue «ahora» por el movimiento. */}
            <PlayingBars playing={suena} size={11} />
            <Text className="text-muted-foreground text-footnote font-semibold uppercase">
              Escuchando ahora
            </Text>
          </View>
          <Text className="text-foreground text-subheadline font-semibold" numberOfLines={1}>
            {track.title}
          </Text>
          <Text className="text-muted-foreground text-caption1" numberOfLines={1}>
            {track.artist}
          </Text>
        </View>
      </View>

      {puedeReaccionar ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
        {EMOJIS.map((emoji) => {
          const esta = mandando === emoji
          const listo = mandado === `${track.videoId}:${emoji}`
          return (
            <AccionSocial key={emoji} label={emoji} accessibilityLabel={`Reaccionar con ${emoji} a lo que escucha ${nombre}`} selected={listo} secundaria={!listo} busy={esta} disabled={!!mandando} expandida={false} onPress={() => void mandar(emoji)} />
          )
        })}
      </ScrollView> : null}
    </View>
  )
}

/**
 * Lo que le fueron dejando: la pared de reacciones del perfil.
 *
 * Cada una guarda **la canción de su momento**, no la que suena ahora — por eso
 * sigue significando algo dentro de un mes, que es lo que la vuelve parte del
 * perfil y no un adorno del presente.
 *
 * Se dibuja en fila horizontal y no en lista vertical porque son muchas y
 * chicas: apiladas empujarían las listas y las vitrinas fuera de la pantalla
 * para mostrar emojis.
 */
export function ParedDeReacciones({
  ownerId,
  recarga,
  propio,
  nombre,
}: {
  ownerId: string
  /** Sube cuando alguien acaba de reaccionar; releer sin esto no pasa nunca. */
  recarga: number
  /** Es tu propio perfil: cambia a quién le habla el texto. */
  propio: boolean
  nombre: string
}) {
  const leer = useCallback(() => reaccionesDe(ownerId), [ownerId])
  const reacciones = useLecturaViva(`${ownerId}:${recarga}`, leer, 5000)

  /* Sin ninguna no se dibuja nada, ni en el perfil propio: un estante vacío
     que dice «todavía nadie te reaccionó» es peor que no estar. */
  if (!reacciones?.length) return null

  return (
    <View className="gap-2">
      <Text className="text-muted-foreground text-footnote font-semibold uppercase">
        {propio ? 'Lo que te dejaron' : `Lo que le dejaron a ${nombre}`}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
        {reacciones.map((r) => (
          <View key={r.id} className="w-[176px] gap-2 rounded-2xl bg-card p-3">
            <AutoresReaccion emoji={r.emoji} cantidad={1} autores={[r.de]} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text className="text-title3">{r.emoji}</Text>
              <Avatar
                name={r.de.displayName || r.de.username}
                path={r.de.avatarPath}
                size={20}
              />
              <Text className="text-muted-foreground min-w-0 flex-1 text-caption2" numberOfLines={1}>
                @{r.de.username}
              </Text>
            </AutoresReaccion>
            <View className="flex-row items-center gap-2">
              <Tapa uri={artworkSource(r.track.artworkPath, r.track.artworkUrl, 96)} size={32} />
              <View className="min-w-0 flex-1">
                <Text className="text-foreground text-caption1 font-semibold" numberOfLines={1}>
                  {r.track.title}
                </Text>
                <Text className="text-muted-foreground text-caption2" numberOfLines={1}>
                  {r.track.artist}
                </Text>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  )
}
