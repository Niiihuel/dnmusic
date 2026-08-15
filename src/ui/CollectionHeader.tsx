import type { ReactNode } from 'react'
import { Text, useWindowDimensions, View } from 'react-native'

/** Debajo de esto la cabecera se apila y se centra. */
const ANGOSTO_PX = 640

/**
 * Si la cabecera está en su forma apilada y centrada.
 *
 * Se exporta porque el título de una lista se puede editar, y el campo tiene
 * que salir con el mismo cuerpo y la misma alineación que el texto que
 * reemplaza: sin esto, entrar a renombrar movía el nombre de lugar y le
 * cambiaba el tamaño.
 */
export function useAngosto(): boolean {
  return useWindowDimensions().width < ANGOSTO_PX
}

/**
 * La cabecera grande de una colección: lista propia, álbum o artista.
 *
 * Las tres se veían igual y estaban escritas tres veces; ahora es una sola
 * pieza. Lo que cambia entre ellas entra por props: la imagen —cuadrada con
 * esquinas redondeadas en una lista o un disco, redonda en un artista—, el
 * rótulo, el título y los controles.
 *
 * **En el teléfono se apila y se centra.** Con la imagen al costado, al título
 * le quedaban 180px: «Cigarettes After Sex» a 36px entraba en cuatro renglones
 * o se cortaba. Apilada, la tapa se luce y el título tiene el ancho completo.
 */
export function CollectionHeader({
  image,
  kind,
  title,
  meta,
  insignia,
  actions,
}: {
  /** La tapa o la foto, ya con su forma y su tamaño resueltos. */
  image: ReactNode
  /** «Lista», «Álbum», «Artista». Va en versalitas sobre el título. */
  kind: string
  /** El título. Es un nodo porque en una lista propia se puede editar. */
  title: ReactNode
  meta?: string
  /**
   * Una marca al lado del rótulo: «Pública», «De @juansi».
   *
   * Va arriba y no abajo con el resto de los datos porque no es un dato de la
   * colección sino **qué clase de colección es** — la misma pregunta que
   * contesta el rótulo. Enterarte de que una lista es pública recién después
   * del título llega tarde.
   */
  insignia?: ReactNode
  /** El botón redondo y los tres puntos. */
  actions?: ReactNode
}) {
  const angosto = useAngosto()

  if (angosto) {
    return (
      <View className="items-center gap-3 px-6 pb-5 pt-4">
        {image}
        <View className="flex-row items-center gap-2">
          <Text className="text-muted-foreground text-[11px] uppercase tracking-[1.4px]">
            {kind}
          </Text>
          {insignia}
        </View>
        <View className="w-full items-center">{title}</View>
        {meta ? (
          <Text className="text-muted-foreground text-center text-[13px]" numberOfLines={2}>
            {meta}
          </Text>
        ) : null}
        {actions ? <View className="flex-row items-center gap-3 pt-1">{actions}</View> : null}
      </View>
    )
  }

  return (
    <View>
      <View className="flex-row items-end gap-5 px-6 pb-5 pt-6">
        {image}
        <View className="min-w-0 flex-1 gap-2 pb-1">
          <View className="flex-row items-center gap-2">
            <Text className="text-muted-foreground text-[11px] uppercase tracking-[1.4px]">
              {kind}
            </Text>
            {insignia}
          </View>
          {title}
          {meta ? (
            <Text className="text-muted-foreground text-[13px]" numberOfLines={2}>
              {meta}
            </Text>
          ) : null}
        </View>
      </View>
      {actions ? (
        <View className="flex-row items-center gap-3 px-6 pb-5">{actions}</View>
      ) : null}
    </View>
  )
}

/**
 * La marca de al lado del rótulo: un ícono chico y una palabra.
 *
 * Píldora en `muted`, que es el escalón de luminancia de las superficies
 * interactivas y alcanza para despegarla del fondo sin dibujar un borde
 * (`docs/DESIGN.md`). No lleva el blanco del acento: es información, no una
 * acción ni un estado activo, y repartir el blanco le saca la fuerza.
 */
export function Insignia({ icono, children }: { icono?: ReactNode; children: string }) {
  return (
    <View className="flex-row items-center gap-1 rounded-full bg-muted px-2 py-0.5">
      {icono}
      <Text className="text-muted-foreground text-[10px] uppercase tracking-[1.2px]">
        {children}
      </Text>
    </View>
  )
}

/**
 * El título, con el cuerpo que corresponda al ancho.
 *
 * A 36px un nombre largo en un teléfono ocupa media pantalla antes de que se
 * vea una sola canción.
 */
export function CollectionTitle({ children }: { children: string }) {
  const angosto = useAngosto()
  return (
    <Text
      className={`text-foreground font-bold ${angosto ? 'text-center text-2xl' : 'text-4xl'}`}
      numberOfLines={3}
    >
      {children}
    </Text>
  )
}

/** El lado de la tapa o la foto de la cabecera. */
export function useCoverSize() {
  const { width } = useWindowDimensions()
  if (width >= ANGOSTO_PX) return 152
  // Un tercio del ancho: se luce sin comerse la pantalla antes del contenido.
  return Math.max(120, Math.min(180, Math.round(width * 0.42)))
}
