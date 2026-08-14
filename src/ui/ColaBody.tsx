import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { artworkSource } from '../lib/artwork'
import type { PlaylistTrack } from '../services/playlists'
import { useColaJam, useJamActivo, useMiembrosJam } from '../state/jam'
import { playAt, quitarEncolada, usePlaybackState } from '../state/playback'
import { TrackRow } from './TrackRow'
import { formatClock } from './SeekBar'
import { ICON_COLOR, IconClose, IconCola } from './icons'

/**
 * La cola — «¿qué viene después?» — con la anatomía de una lista.
 *
 * Es un cuerpo sin cáscara a propósito, porque vive en dos lugares: en el
 * teléfono es la pantalla `/cola` (un sheet), y en escritorio es **una cara
 * del panel derecho**, al lado de la lista — como el Jam, y como lo hace
 * Spotify. Antes en la compu abría la pantalla entera y se veía como una
 * página rota: un drawer es un gesto de teléfono, no de escritorio.
 *
 * Muestra todo junto y en el orden real en que va a sonar: lo que suena, lo
 * encolado a mano (que va primero, porque alguien lo pidió expresamente) y lo
 * que sigue de la lista **respetando el aleatorio**. En un Jam es la cola
 * compartida y cada fila dice quién la puso.
 */
export function ColaBody({
  piso = 40,
  conTitulo = true,
}: {
  /** Aire al fondo del scroll; el panel pasa lo que tapa el reproductor. */
  piso?: number
  /** El título grande de la pantalla; el panel ya tiene el suyo y lo apaga. */
  conTitulo?: boolean
}) {
  const { tracks, index, manual, upNext, shuffle, wantPlay } = usePlaybackState()
  const enJam = useJamActivo()
  const colaJam = useColaJam()
  const miembros = useMiembrosJam()
  const [hovered, setHovered] = useState<string | null>(null)

  const actual = manual ?? (index >= 0 ? (tracks[index] ?? null) : null)

  /*
   * Lo que viene de la lista, en el orden en que va a sonar de verdad.
   *
   * Con el aleatorio puesto, «lo que sigue» no es la fila de abajo: es el
   * orden barajado. Mostrar otra cosa sería una cola decorativa. Se guarda el
   * índice real junto a cada canción porque saltar necesita el índice de
   * `tracks`, no la posición en esta pantalla.
   */
  const porVenir: { track: PlaylistTrack; indice: number }[] = (() => {
    if (!shuffle) {
      return tracks.slice(index + 1).map((track, i) => ({ track, indice: index + 1 + i }))
    }
    const validos = shuffle.filter((i) => i >= 0 && i < tracks.length)
    const donde = validos.indexOf(index)
    return validos.slice(donde + 1).flatMap((i) => {
      const track = tracks[i]
      return track ? [{ track, indice: i }] : []
    })
  })()

  /** En un Jam, quién puso cada canción; fuera de él, nada que decir. */
  function quienLaPuso(trackId: string): string | null {
    if (!enJam) return null
    const item = colaJam.find((i) => i.id === trackId)
    if (!item) return null
    const dueno = miembros.find((m) => m.userId === item.agregadoPor)
    return dueno ? (dueno.displayName?.trim() || dueno.username) : null
  }

  function artistaDe(track: PlaylistTrack): string {
    const puso = quienLaPuso(track.id)
    return puso ? `${track.artist} · la puso ${puso}` : track.artist
  }

  const cuantas = (actual ? 1 : 0) + upNext.length + porVenir.length
  const totalMs =
    (actual?.durationMs ?? 0) +
    upNext.reduce((suma, t) => suma + t.durationMs, 0) +
    porVenir.reduce((suma, p) => suma + p.track.durationMs, 0)

  if (cuantas === 0) {
    /* El vacío se dice con palabras y con el camino para llenarlo. */
    return (
      <View className="flex-1 items-center justify-center gap-3 px-8" style={{ paddingBottom: piso }}>
        <IconCola size={26} color={ICON_COLOR.muted} />
        <Text className="text-foreground text-[15px] font-semibold">No hay nada en cola</Text>
        <Text className="text-muted-foreground text-center text-[13px] leading-5">
          Poné una lista a sonar, o sumá canciones con «Agregar a la cola» desde cualquier
          lista o búsqueda.
        </Text>
      </View>
    )
  }

  return (
    <ScrollView
      className="min-h-0 flex-1"
      contentContainerClassName="pt-5"
      contentContainerStyle={{ paddingBottom: piso }}
    >
      {conTitulo ? (
        /* La cabecera de lista: rótulo, título grande y el resumen. */
        <View className="gap-1 px-5 pb-4 pt-2">
          <Text className="text-foreground text-2xl font-bold">Lo que viene</Text>
          <Text className="text-muted-foreground text-[13px]">
            {cuantas} {cuantas === 1 ? 'canción' : 'canciones'} · {formatClock(totalMs)}
          </Text>
        </View>
      ) : null}

      {actual ? (
        <>
          <Encabezado texto="Sonando" />
          <TrackRow
            index={1}
            title={actual.title}
            artist={artistaDe(actual)}
            artwork={artworkSource(actual.artworkPath, actual.artworkUrl, 96)}
            durationMs={actual.durationMs}
            sounding
            playing={wantPlay}
            hovered={hovered === `actual-${actual.id}`}
            onHover={(on) => setHovered(on ? `actual-${actual.id}` : null)}
            onPlay={() => {
              if (!manual && index >= 0) playAt(index)
            }}
          />
        </>
      ) : null}

      {upNext.length > 0 ? (
        <>
          <Encabezado texto="A continuación · lo que encolaste" />
          {upNext.map((track, i) => (
            <TrackRow
              key={`encolada-${i}-${track.id}`}
              index={i + 1}
              title={track.title}
              artist={artistaDe(track)}
              artwork={artworkSource(track.artworkPath, track.artworkUrl, 96)}
              durationMs={track.durationMs}
              sounding={false}
              playing={false}
              hovered={hovered === `encolada-${i}`}
              onHover={(on) => setHovered(on ? `encolada-${i}` : null)}
              /* Lo encolado no se salta con un toque: suena cuando le toque.
                 Saltearlo sería adelantar la cola entera de todos modos. */
              onPlay={() => {}}
              trailing={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Quitar ${track.title} de la cola`}
                  onPress={() => quitarEncolada(i)}
                  className="h-9 w-9 items-center justify-center rounded-full active:bg-muted"
                >
                  <IconClose size={15} color={ICON_COLOR.muted} />
                </Pressable>
              }
            />
          ))}
        </>
      ) : null}

      {porVenir.length > 0 ? (
        <>
          <Encabezado texto={upNext.length > 0 ? 'Después · sigue la lista' : 'A continuación'} />
          {porVenir.map(({ track, indice }, i) => (
            <TrackRow
              key={`viene-${track.id}-${indice}`}
              index={i + 1}
              title={track.title}
              artist={artistaDe(track)}
              artwork={artworkSource(track.artworkPath, track.artworkUrl, 96)}
              durationMs={track.durationMs}
              sounding={false}
              playing={false}
              hovered={hovered === `viene-${indice}`}
              onHover={(on) => setHovered(on ? `viene-${indice}` : null)}
              /* En un Jam esto es un intent de saltar ahí para todos; el
                 puente de playback ya sabe pedir permiso. */
              onPlay={() => playAt(indice)}
            />
          ))}
        </>
      ) : actual ? (
        <View className="items-center px-8 py-10">
          <Text className="text-muted-foreground text-center text-[13px] leading-5">
            No hay nada después. Sumá canciones con «Agregar a la cola».
          </Text>
        </View>
      ) : null}
    </ScrollView>
  )
}

/** Separador de sección, en el idioma de las etiquetas de la app. */
function Encabezado({ texto }: { texto: string }) {
  return (
    <Text className="text-muted-foreground px-5 pb-2 pt-5 text-[11px] font-semibold uppercase tracking-[1.2px]">
      {texto}
    </Text>
  )
}
