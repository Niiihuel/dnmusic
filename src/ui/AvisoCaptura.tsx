import { useEffect, useRef, useState } from 'react'
import { Image, Platform, Pressable, Text, View } from 'react-native'
import { artworkSource } from '../lib/artwork'
import type { PlaylistTrack } from '../services/playlists'
import { getPlaybackState } from '../state/playback'
import { usePiso } from '../state/shell'
import { Glass, HAY_VIDRIO } from './Glass'
import { compartirHistoria } from './CompartirHistoria'
import { ICON_COLOR, IconClose, IconMusic } from './icons'

/** Cuánto se queda la oferta a la vista antes de retirarse sola. */
const OFERTA_MS = 8000

/**
 * La oferta de compartir después de una captura de pantalla.
 *
 * Es el gesto de Spotify: le sacás una captura a la app con música sonando y
 * aparece una tarjetita ofreciendo armar la historia — porque una captura de
 * un reproductor es, casi siempre, alguien queriendo mostrar qué está
 * escuchando. La tarjeta usa el mismo camino del menú («Compartir en una
 * historia»): la imagen de 1080×1920 y la hoja del sistema, donde Instagram
 * ofrece «Agregar a tu historia».
 *
 * La detección es del sistema (`expo-screen-capture`) y **el módulo es
 * opcional**: en la web no existe, y un development client compilado antes de
 * agregarlo tampoco lo trae. En esos casos esto no dibuja nada y la app sigue
 * igual — el mismo trato que `remote-commands`.
 *
 * Solo ofrece cuando hay una canción cargada: una captura del chat o de los
 * ajustes sin nada sonando no es una historia de música.
 */
export function AvisoCaptura() {
  const [oferta, setOferta] = useState<PlaylistTrack | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const piso = usePiso(12)

  useEffect(() => {
    if (Platform.OS === 'web') return
    let sub: { remove: () => void } | null = null
    try {
      /* Perezoso a propósito: si el binario no trae el módulo nativo, el
         import de arriba de todo reventaría la app al arrancar. Acá falla
         adentro del try y simplemente no hay oferta. */
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ScreenCapture = require('expo-screen-capture') as {
        addScreenshotListener: (fn: () => void) => { remove: () => void }
      }
      sub = ScreenCapture.addScreenshotListener(() => {
        const state = getPlaybackState()
        const track = state.manual ?? (state.index >= 0 ? state.tracks[state.index] : null)
        if (!track) return
        setOferta(track)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => setOferta(null), OFERTA_MS)
      })
    } catch {
      // Sin módulo de capturas: sin oferta, y todo lo demás funciona igual.
    }
    return () => {
      sub?.remove()
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  if (!oferta) return null

  const arte = artworkSource(oferta.artworkPath, oferta.artworkUrl, 96)

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 12, right: 12, bottom: piso, zIndex: 60 }}
    >
      <Glass radius={16} style={HAY_VIDRIO ? {} : { backgroundColor: 'rgb(31,31,31)' }}>
        <View className="flex-row items-center gap-3 p-3">
          {arte ? (
            <Image source={{ uri: arte }} className="h-11 w-11 rounded-lg bg-card" />
          ) : (
            <View className="h-11 w-11 items-center justify-center rounded-lg bg-card">
              <IconMusic size={17} color={ICON_COLOR.muted} />
            </View>
          )}
          <View className="min-w-0 flex-1 gap-0.5">
            <Text className="text-foreground text-[13px] font-semibold" numberOfLines={1}>
              ¿La compartís en tu historia?
            </Text>
            <Text className="text-muted-foreground text-[11px]" numberOfLines={1}>
              {oferta.title} — {oferta.artist}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Compartir en una historia"
            onPress={() => {
              setOferta(null)
              compartirHistoria(oferta)
            }}
            className="h-9 flex-row items-center rounded-full bg-primary px-4 active:opacity-80"
          >
            <Text className="text-primary-foreground text-xs font-semibold">Historia</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cerrar"
            onPress={() => setOferta(null)}
            className="h-9 w-9 items-center justify-center rounded-full bg-muted active:opacity-80"
          >
            <IconClose size={14} color={ICON_COLOR.muted} />
          </Pressable>
        </View>
      </Glass>
    </View>
  )
}
