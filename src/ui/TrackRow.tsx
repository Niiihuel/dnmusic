import { useState, type ReactNode } from 'react'
import { Image, Platform, Pressable, Text, useWindowDimensions, View } from 'react-native'
import { EstadoTapa, IndicadorPreparando } from './CoverState'
import { MantenerApretado, Menu, type MenuItem } from './Menu'
import { useClicDerecho } from './useClicDerecho'
import { PlayingBars } from './PlayingBars'
import { usePlaybackCargada } from '../state/playback'
import { formatClock } from './SeekBar'
import { ICON_COLOR, IconMusic, IconPause, IconPlay } from './icons'

/** Debajo de esto la tabla deja de ser una tabla. Igual que en `Panel`. */
const SHELL_PX = 780

/**
 * La tabla de canciones: la misma en una lista propia y en un álbum ajeno.
 *
 * Vive acá y no dentro de la lista porque las dos pantallas tienen que verse
 * igual: cuando la fila estaba duplicada, un retoque en una dejaba la otra a
 * medio camino y se notaba al pasar de una a la otra. Lo único que cambia entre
 * ellas es lo que va al final —quitar de la lista, o sumarla a una— y eso entra
 * por `trailing`.
 *
 * **En el teléfono deja de ser una tabla.** Una tabla tiene sentido con ancho de
 * sobra: número, título, duración y encabezado de columnas, todo alineado. En
 * 390px esas tres columnas de servicio le comen el lugar justamente a lo único
 * que importa, que es de qué canción se trata — el resultado era la fila
 * apretada de la captura, con el título recortado y la duración pegada al menú.
 *
 * Así que ahí se cae el número y se cae la duración, la tapa y la tipografía
 * crecen, y los tres puntos pasan a estar **siempre visibles**. Es lo que hace
 * Spotify en el teléfono, y no por copiarlo: el número lo dice el orden en que
 * están, y la duración es un dato que casi nunca se busca mientras se elige qué
 * escuchar.
 */
export function TrackRow({
  index,
  title,
  artist,
  artwork,
  durationMs,
  sounding,
  playing,
  busy,
  hovered: hoveredExterno,
  inset = true,
  onHover,
  onPlay,
  trailing,
  gusto,
  menu,
}: {
  index: number
  title: string
  artist: string
  /**
   * La imagen ya resuelta, no la URL cruda.
   *
   * De dónde sale —nuestra copia en Storage, el proxy, el CDN— lo decide quien
   * tiene el dato; la fila solo la dibuja. Es lo que permite usarla igual para
   * una canción guardada y para una que todavía es un resultado de búsqueda.
   */
  artwork: string | null
  durationMs: number
  /** Es la que está sonando: se marca con las barritas y el título en negrita. */
  sounding: boolean
  playing: boolean
  /** Se está resolviendo el audio; la primera vez tarda unos segundos. */
  busy?: boolean
  /**
   * El cursor está encima. **Opcional, y conviene no pasarlo.**
   *
   * Por defecto la fila se acuerda sola de si la están señalando, y es la
   * diferencia entre una lista que responde y una que arrastra: con el estado
   * en el padre, cruzar el cursor por una lista de cuarenta canciones dispara
   * cuarenta re-render de **las cuarenta filas** —ochenta con la que se apaga y
   * la que se prende—, y eso es exactamente el «se nota al mover el mouse entre
   * las canciones» que se reportó en el escritorio. Adentro, cada cruce
   * redibuja una fila.
   *
   * Solo se pasa desde afuera cuando quien llama **dibuja algo más** que
   * depende de ese hover y que vive fuera de la fila (ver `AlbumPanel`).
   */
  hovered?: boolean
  /** El margen lateral de una tabla suelta. En una grilla lo pone la celda. */
  inset?: boolean
  onHover?: (on: boolean) => void
  onPlay: () => void
  /** El control del final. El hueco se reserva aunque no haya nada. */
  trailing?: ReactNode
  /** Corazón en la columna de duración, independiente del botón de reproducción. */
  gusto?: ReactNode
  /**
   * Las opciones de esta canción, para el gesto de mantener apretado.
   *
   * Son **las mismas** que las de los tres puntos: quien llama arma la lista
   * una vez y la pasa por los dos lados. Si acá llegara otra cosa, el gesto y
   * el botón ofrecerían menús distintos sobre la misma fila.
   */
  menu?: MenuItem[]
}) {
  const suelto = useWindowDimensions().width < SHELL_PX
  const lado = suelto ? 52 : 40
  /*
   * «Cargando» es dos cosas: el audio se está resolviendo (`busy`, la primera
   * vez de una canción) o el motor todavía no lo tiene (la que suena, con
   * `cargada` en falso: bajando, o cortada por YouTube). En las dos se ve el
   * spinner y no las barras: barras sobre silencio es mentir que suena.
   */
  const cargada = usePlaybackCargada()
  const cargando = !!busy || (sounding && !cargada)

  /* Propio salvo que lo manden de afuera; el de afuera manda porque quien lo
     pasa lo necesita para dibujar algo que no está acá adentro. */
  const [hoveredPropio, setHoveredPropio] = useState(false)
  const [focused, setFocused] = useState(false)
  const hovered = (hoveredExterno ?? hoveredPropio) || focused

  const marcarHover = (on: boolean) => {
    setHoveredPropio(on)
    onHover?.(on)
  }

  const clic = useClicDerecho()
  const [apreton, setApreton] = useState<{ x: number; y: number } | null>(null)
  const punto = apreton ?? clic.punto

  const fila = (
    <View
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        const current = event.currentTarget as unknown as { contains?: (target: unknown) => boolean }
        const related = (event as unknown as { relatedTarget?: unknown }).relatedTarget
        if (!related || !current.contains?.(related)) setFocused(false)
      }}
      onPointerEnter={() => marcarHover(true)}
      onPointerLeave={() => marcarHover(false)}
      {...clic.gestos}
      className={`flex-row items-center rounded-lg px-2 ${suelto ? 'gap-3 py-2' : 'gap-4 py-2'} ${
        inset ? (suelto ? 'mx-3' : 'mx-6') : ''
      } ${hovered ? 'bg-muted' : sounding ? 'bg-card' : ''}`}
    >
      {/*
       * **Toda la fila** es lo tocable, no solo el número.
       *
       * Con el cursor alcanzaba: apuntás al número, se convierte en play y
       * hacés clic. Con el dedo no hay cursor, así que el único blanco era ese
       * cuadradito de 24px y la mitad de los toques no entraban — «muchas veces
       * no me deja elegir la canción». Ahora el área es la fila entera hasta la
       * duración, y los controles del final quedan afuera del Pressable para no
       * anidar botones (en web eso es un <button> dentro de otro).
       */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Pausar' : `Reproducir ${title}`}
        onPress={onPlay}
        delayLongPress={500}
        onLongPress={
          menu?.length
            ? (e) => {
                if (Platform.OS !== 'ios') setApreton({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY })
              }
            : undefined
        }
        accessibilityHint={menu?.length ? 'Mantené apretado para ver las opciones' : undefined}
        className={`min-w-0 flex-1 flex-row items-center ${suelto ? 'gap-3' : 'gap-4'}`}
      >
        {suelto ? null : (
        <View className="w-6 items-center justify-center">
        {/*
         * Con el cursor encima manda el control; si no, las barras dicen cuál
         * es la que suena y el número ordena el resto.
         *
         * Los tres conviven y se alternan por opacidad en vez de montarse y
         * desmontarse: si el nodo donde empezó la pulsación desaparece antes
         * de soltar —el cambio por hover puede caer justo entre el mousedown y
         * el mouseup— el navegador no emite `click` y el toque se pierde.
         */}
        <Text
          className="text-muted-foreground text-[12px] tabular-nums"
          style={{ opacity: hovered || sounding || cargando ? 0 : 1 }}
        >
          {index + 1}
        </Text>
        <View
          pointerEvents="none"
          style={{ position: 'absolute', opacity: hovered && !cargando ? 1 : 0 }}
        >
          {playing ? (
            <IconPause size={13} color={ICON_COLOR.foreground} />
          ) : (
            <IconPlay size={13} color={ICON_COLOR.foreground} />
          )}
        </View>
        <View
          pointerEvents="none"
          style={{ position: 'absolute', opacity: !hovered && sounding && !cargando ? 1 : 0 }}
        >
          {/* Solo en la fila que suena: las barras siguen la onda y la
              posición, y cuarenta filas suscriptas a la posición serían
              cuarenta redibujados por segundo. */}
          {sounding ? <PlayingBars playing={playing} /> : null}
        </View>
        {cargando ? (
          <View pointerEvents="none" style={{ position: 'absolute' }}>
            <IndicadorPreparando color={ICON_COLOR.muted} />
          </View>
        ) : null}
        </View>
        )}

        {/*
         * En el teléfono, la señal de «esta es la que suena» va **sobre la
         * tapa**: es donde se quedó el hueco del número, y es el mismo lugar
         * donde ya la ponen el buscador y la portada. Una fila no puede decir
         * lo mismo de dos formas distintas según la pantalla.
         */}
        <View style={{ width: lado, height: lado }}>
          {artwork ? (
            <Image
              source={{ uri: artwork }}
              className="rounded bg-card"
              style={{ width: lado, height: lado }}
            />
          ) : (
            <View
              className="items-center justify-center rounded bg-card"
              style={{ width: lado, height: lado }}
            >
              <IconMusic size={suelto ? 18 : 15} color={ICON_COLOR.muted} />
            </View>
          )}
          {suelto ? (
            <EstadoTapa busy={cargando} sounding={sounding} playing={playing} />
          ) : null}
        </View>

        <View className="min-w-0 flex-1 gap-0.5">
          <Text
            className={`${suelto ? 'text-[16px]' : 'text-[14px]'} ${
              sounding ? 'text-foreground font-semibold' : 'text-foreground'
            }`}
            numberOfLines={1}
          >
            {title}
          </Text>
          <Text
            className={`text-muted-foreground ${suelto ? 'text-[13px]' : 'text-[12px]'}`}
            numberOfLines={1}
          >
            {artist}
          </Text>
        </View>


      </Pressable>

      {suelto ? null : (
        <View className="w-12 items-end justify-center" style={{ minHeight: 44 }}>
          <Text pointerEvents="none" className="text-right text-muted-foreground text-[12px] tabular-nums"
            style={{ opacity: gusto && hovered ? 0 : 1 }}>
            {durationMs > 0 ? formatClock(durationMs) : ''}
          </Text>
          {gusto ? <View style={{ position: 'absolute', right: 0, opacity: hovered ? 1 : 0 }}
            pointerEvents={hovered ? 'auto' : 'none'}>{gusto}</View> : null}
        </View>
      )}

      {/*
       * Los tres puntos: **siempre en el teléfono**, bajo el cursor en
       * escritorio.
       *
       * Antes quien llamaba decidía esto con `hovered`, y ahí estaba el
       * problema: en un teléfono no hay cursor, así que `hovered` nunca es
       * verdadero y el menú no aparecía **nunca**. Todas las opciones de una
       * canción —encolarla, ir al artista, sumarla a otra lista— existían y no
       * había forma de llegar a ellas con el dedo.
       *
       * Se esconde por opacidad y no desmontándolo, por lo mismo que el número
       * y el play de más arriba: si el nodo donde empezó la pulsación
       * desaparece antes de soltar, el toque se pierde. El hueco se reserva
       * igual para que las filas no se muevan; quien pone dos controles reserva
       * el ancho de los dos.
       */}
      <View
        className="flex-row items-center justify-end"
        style={{ minWidth: 36, opacity: suelto || hovered ? 1 : 0 }}
        pointerEvents={suelto || hovered ? 'auto' : 'none'}
      >
        {trailing}
      </View>

      {/*
       * El menú del click derecho: la **misma** lista que los tres puntos, sin
       * un botón propio. Se abre donde está el cursor (ver `useClicDerecho`);
       * con el dedo no existe, y ahí la puerta siguen siendo los tres puntos.
       */}
      {punto && menu?.length ? (
        <Menu
          items={menu}
          sinDisparador
          abiertoEn={punto}
          onCerrarPunto={() => {
            setApreton(null)
            clic.cerrar()
          }}
        />
      ) : null}
    </View>
  )

  // El callback de onLongPress suprime onPress al soltar; en iOS el menú y
  // su gesto los administra SwiftUI, sin abrir una segunda hoja desde JS.
  return Platform.OS === 'ios' && menu?.length
    ? <MantenerApretado items={menu}>{fila}</MantenerApretado>
    : fila
}

/**
 * El encabezado de la tabla: número, título, duración.
 *
 * `trailing` es el ancho que la tabla reserva al final de cada fila: 36 con un
 * solo control, 72 con dos. Sin esto, «Duración» se despegaría de su columna
 * en las tablas que tienen menú y «+».
 *
 * **En el teléfono no existe.** Es el encabezado de columnas de una tabla, y
 * ahí abajo ya no hay tabla: sin número ni duración no queda ninguna columna
 * que encabezar. Además no entraba — «Duración» se partía al medio en dos
 * renglones contra su columna de 48px, que es lo que se veía en la captura.
 */
export function TrackColumnHeader({ trailing = 36 }: { trailing?: number }) {
  const suelto = useWindowDimensions().width < SHELL_PX
  if (suelto) return null

  return (
    <View className="mx-6 mb-1 flex-row items-center gap-4 border-b border-muted px-2 pb-2">
      <Text className="w-6 text-center text-muted-foreground text-[11px]">#</Text>
      <Text className="flex-1 text-muted-foreground text-[11px] uppercase tracking-[1.2px]">
        Título
      </Text>
      <Text className="w-12 text-right text-muted-foreground text-[11px]">Duración</Text>
      <View style={{ width: trailing }} />
    </View>
  )
}
