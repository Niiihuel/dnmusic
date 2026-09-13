import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import {
  fetchLyrics,
  translateLyrics,
  type LyricLang,
  type LyricLine,
} from '../services/music'
import { addShowcase } from '../services/showcases'
import { getSupabase } from '../lib/supabase'
import { avisar } from '../state/aviso'
import { usePlaybackState } from '../state/playback'
import { FadedLyrics } from './FadedLyrics'
import { Lyrics, type LyricsSize } from './Lyrics'
import { LyricsTranslationMenu } from './LyricsTranslationMenu'
import { ICON_COLOR, IconMusic } from './icons'

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
  size = 'lg',
  fondo = '0,0,0',
  onTap,
  onPickLine,
  translationPlacement = 'floating',
}: {
  track: { title: string; artist: string; durationMs: number }
  /** Muestra el botón de traducir. En el panel angosto no entra. */
  translatable?: boolean
  /**
   * `xl` es la letra como contenido principal —la pantalla de «Sonando», el
   * panel del medio en la compu—: a la izquierda, con el traductor flotando
   * arriba a la derecha en vez de al pie.
   */
  size?: Extract<LyricsSize, 'lg' | 'xl'>
  /**
   * El color del fondo sobre el que se apoya la letra, en `r,g,b`, para los
   * fundidos de los bordes.
   *
   * Lo pone quien la usa porque es lo único que este componente **no puede
   * saber**: en «Sonando» atrás hay negro, en el panel de la compu hay
   * `background` (#121212). Con el negro puesto a mano, el fundido de arriba
   * se leía en el panel como una **franja más oscura que el panel** —una
   * sombra flotando en el medio de la nada— en vez de como un borde que se
   * apaga. Igual que en `ArtistPage`: LinearGradient no lee variables CSS.
   */
  fondo?: string
  /** Un toque sobre la letra. Lo usa «Sonando» para pedir los controles. */
  onTap?: () => void
  onPickLine?: (atMs: number) => void
  /** Controles fuera del área de versos en el reproductor iOS. */
  translationPlacement?: 'floating' | 'footer'
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
  const key = JSON.stringify([track.artist, track.title, track.durationMs])
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
    let active = true
    fetchLyrics(track.artist, track.title, track.durationMs, controller.signal)
      .then((lines) => { if (active) setLoaded({ key, lines }) })
      .catch(() => { if (active) setLoaded({ key, lines: null }) })
    return () => {
      active = false
      controller.abort()
    }
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
        <Text className="text-muted-foreground text-center text-footnote">Buscando la letra…</Text>
      </View>
    )
  }

  if (!loaded.lines) {
    return (
      <View className="flex-1 items-center justify-center gap-3 px-8">
        <IconMusic size={22} color={ICON_COLOR.muted} />
        <Text className="text-muted-foreground text-center text-footnote leading-5">
          No encontré la letra sincronizada de este tema.
        </Text>
      </View>
    )
  }

  const lines = (lang === 'off' ? base : byLang[lang]) ?? base

  const traductor = translatable ? (
    <View className="flex-row items-center gap-2">
      <LyricsTranslationMenu value={lang} onChange={setLang} compact={translationPlacement === 'footer'} />
      {traduciendo ? <ActivityIndicator size="small" color={ICON_COLOR.muted} /> : null}
    </View>
  ) : null

  const letra = (
    <Lyrics
      key={`${key}:${lang}`}
      lines={lines}
      atMs={positionMs}
      size={size}
      onTap={onTap}
      onPickLine={onPickLine}
      /* Sostener fija **la línea original**, no la traducción: se busca por
         su tiempo en la letra base — lo que la canción dice, no lo que el
         traductor entendió. */
      onHoldLine={(texto, atMs) => {
        const original = base.find((l) => l.atMs === atMs)?.text ?? texto
        void fijarVerso(original)
      }}
    />
  )

  if (size === 'xl' && translationPlacement === 'footer') {
    return (
      <View style={{ flex: 1, minHeight: 0, paddingHorizontal: 24 }}>
        <FadedLyrics>{letra}</FadedLyrics>
        {traductor ? <View style={{ minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' }}>{traductor}</View> : null}
      </View>
    )
  }

  if (size === 'xl') {
    /*
     * En la pantalla entera la letra llega hasta los bordes y el traductor
     * **flota** arriba a la derecha, como el botón de cantar de Apple Music:
     * al pie están los controles, y una fila más entre la letra y ellos era
     * una franja que no era de nadie.
     */
    return (
      <View className="min-h-0 flex-1 px-6">
        {letra}
        {/* El fundido de arriba, hermano del que hay contra el pie: las líneas
            que ya pasaron se apagan **antes** de llegar al encabezado, en vez
            de cruzarse con el nombre de la canción y con el botón de traducir.
            Es el mismo borde difuso con el que Apple Music mete la letra
            debajo de su cabecera. */}
        <LinearGradient
          pointerEvents="none"
          colors={[`rgba(${fondo},0.85)`, `rgba(${fondo},0.45)`, `rgba(${fondo},0)`]}
          locations={[0, 0.5, 1]}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 96 }}
        />
        {/*
         * Y el de abajo, que es **de la letra y no de los controles**.
         *
         * En «Sonando» hay además el degradado del pie, pero ese se va con los
         * controles a los cuatro segundos y la letra quedaba cortada a filo
         * contra el borde. Y en el panel de la compu no hay controles encima:
         * sin esto, las líneas que vienen aparecen de golpe. Va más suave que
         * el otro, que sigue dibujándose encima cuando está.
         */}
        <LinearGradient
          pointerEvents="none"
          colors={[`rgba(${fondo},0)`, `rgba(${fondo},0.65)`]}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 88 }}
        />
        {traductor ? <View className="absolute right-6 top-0">{traductor}</View> : null}
      </View>
    )
  }

  return (
    <View className="min-h-0 flex-1 px-5 pb-5">
      {/* La letra se queda con **todo** el alto que sobra y el control de
          idioma se apoya contra el piso. Antes los dos iban uno detrás del
          otro, así que el botón terminaba justo debajo del último renglón —a
          media pantalla si la canción tenía pocas líneas— y competía con lo que
          uno está leyendo. Con el hueco vacío abajo, no. */}
      <View className="min-h-0 flex-1">{letra}</View>

      {traductor ? <View className="items-center pt-6">{traductor}</View> : null}
    </View>
  )
}
