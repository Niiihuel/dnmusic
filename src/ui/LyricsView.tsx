import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import {
  fetchLyrics,
  translateLyrics,
  LYRIC_LANGS,
  type LyricLang,
  type LyricLine,
} from '../services/music'
import { addShowcase } from '../services/showcases'
import { getSupabase } from '../lib/supabase'
import { avisar } from '../state/aviso'
import { usePlaybackState } from '../state/playback'
import { Lyrics } from './Lyrics'
import { Popover } from './Popover'
import { ICON_COLOR, IconLanguages, IconMusic } from './icons'

/**
 * La letra sincronizada de lo que suena, con su traducción.
 *
 * Se busca en LRCLIB por artista, título y duración —el mismo camino que usa
 * el editor de fragmentos— y solo sirve la versión con tiempos: una letra
 * plana no puede seguir la canción, y mostrarla sería peor que no mostrar
 * nada.
 *
 * Este es el único lugar del panel que mira la posición cuadro a cuadro, y por
 * eso vive aparte: si el componente de arriba la mirara, se redibujaría entero
 * sesenta veces por segundo aunque estuviera mostrando la ficha del artista.
 *
 * La traducción vive acá adentro y no en quien lo usa porque necesita la letra
 * original, que es de este componente: sacarla afuera obligaría a cada pantalla
 * a pedir la letra de nuevo para poder traducirla.
 */
export function LyricsView({
  track,
  translatable = false,
}: {
  track: { title: string; artist: string; durationMs: number }
  /** Muestra el botón de traducir. En el panel angosto no entra. */
  translatable?: boolean
}) {
  const { positionMs } = usePlaybackState()

  /**
   * Fijar un verso en el perfil, congelado: el texto viaja con la vitrina y no
   * depende de que el servicio de letras siga contestando.
   */
  async function fijarVerso(verso: string) {
    const { data } = await getSupabase().auth.getUser()
    const me = data.user?.id
    if (!me) return
    try {
      await addShowcase(
        me,
        'letra',
        { texto: verso, title: track.title, artist: track.artist },
        'mitad',
      )
      avisar('El verso quedó en tu perfil')
    } catch {
      avisar('No se pudo fijar el verso', true)
    }
  }
  const [loaded, setLoaded] = useState<{ key: string; lines: LyricLine[] | null } | null>(null)
  const key = `${track.artist}|${track.title}`
  const fresh = loaded?.key === key

  /*
   * La traducción se guarda **junto a la canción que se tradujo**.
   *
   * Mismo criterio que la letra, la búsqueda y la URL firmada de la barra: así
   * cambiar de tema no necesita un efecto que resetee nada —lo guardado deja de
   * coincidir con la clave y ya— y una traducción que llega tarde nunca se
   * muestra sobre la canción equivocada.
   */
  const [tr, setTr] = useState<{
    key: string
    lang: LyricLang
    /** Cada idioma se traduce una vez: volver a él es instantáneo. */
    byLang: Partial<Record<LyricLang, LyricLine[]>>
  }>({ key, lang: 'off', byLang: {} })
  const mismaCancion = tr.key === key
  const lang = mismaCancion ? tr.lang : 'off'
  const byLang = useMemo(() => (mismaCancion ? tr.byLang : {}), [mismaCancion, tr.byLang])
  const setLang = (next: LyricLang) =>
    setTr((prev) => ({ key, lang: next, byLang: prev.key === key ? prev.byLang : {} }))

  useEffect(() => {
    if (fresh) return
    const controller = new AbortController()
    fetchLyrics(track.artist, track.title, track.durationMs, controller.signal)
      .then((lines) => setLoaded({ key, lines }))
      .catch(() => setLoaded({ key, lines: null }))
    return () => controller.abort()
  }, [key, fresh, track.artist, track.title, track.durationMs])

  const base = useMemo(
    () => (loaded?.key === key ? (loaded.lines ?? []) : []),
    [loaded, key],
  )
  const traduciendo = lang !== 'off' && base.length > 0 && !byLang[lang]

  useEffect(() => {
    if (lang === 'off' || !base.length || byLang[lang]) return
    const controller = new AbortController()
    let alive = true
    translateLyrics(base, lang, controller.signal)
      .then(
        (done) =>
          alive &&
          setTr((prev) =>
            prev.key === key ? { ...prev, byLang: { ...prev.byLang, [lang]: done } } : prev,
          ),
      )
      .catch(() => {
        // Traducir es una ayuda: si falla se vuelve al original en vez de
        // romper la pantalla.
        if (alive) setTr((prev) => ({ ...prev, lang: 'off' }))
      })
    return () => {
      alive = false
      controller.abort()
    }
  }, [lang, base, byLang, key])

  if (!fresh) {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-muted-foreground text-center text-[13px]">Buscando la letra…</Text>
      </View>
    )
  }

  if (!loaded.lines) {
    return (
      <View className="flex-1 items-center justify-center gap-3 px-8">
        <IconMusic size={22} color={ICON_COLOR.muted} />
        <Text className="text-muted-foreground text-center text-[13px] leading-5">
          No encontré la letra sincronizada de este tema.
        </Text>
      </View>
    )
  }

  const lines = (lang === 'off' ? base : byLang[lang]) ?? base

  return (
    <View className="min-h-0 flex-1 px-5 pb-5">
      {/* La letra se queda con **todo** el alto que sobra y el control de
          idioma se apoya contra el piso. Antes los dos iban uno detrás del
          otro, así que el botón terminaba justo debajo del último renglón —a
          media pantalla si la canción tenía pocas líneas— y competía con lo que
          uno está leyendo. Con el hueco vacío abajo, no. */}
      <View className="min-h-0 flex-1">
        <Lyrics
          lines={lines}
          atMs={positionMs}
          size="lg"
          /* Sostener fija **la línea original**, no la traducción: se busca por
             su tiempo en la letra base — lo que la canción dice, no lo que el
             traductor entendió. */
          onHoldLine={(texto, atMs) => {
            const original = base.find((l) => l.atMs === atMs)?.text ?? texto
            void fijarVerso(original)
          }}
        />
      </View>

      {translatable ? (
        <View className="flex-row items-center justify-center gap-2 pt-6">
          <Popover
            value={lang}
            options={LYRIC_LANGS.map((l) => ({ value: l.value, label: l.label }))}
            onChange={setLang}
            display={LYRIC_LANGS.find((l) => l.value === lang)?.short || 'Traducir'}
            accessibilityLabel="Traducir la letra"
            sfSymbol="globe"
            icon={
              <IconLanguages
                size={15}
                color={lang === 'off' ? ICON_COLOR.muted : ICON_COLOR.foreground}
              />
            }
          />
          {traduciendo ? <ActivityIndicator size="small" color={ICON_COLOR.muted} /> : null}
        </View>
      ) : null}
    </View>
  )
}
