import { StyleSheet, View } from 'react-native'
import { Image } from 'expo-image'
import {
  decoracionPropia,
  decoracionUrl,
  esDecoracionPropia,
  rutaDePropia,
  type Decoracion,
  useDecoracion,
} from '../services/decoraciones'
import { ilustracionUrl } from '../services/showcases'
import { EfectoDibujado, esEfectoDibujado } from './EfectosDibujados'
import { esDiscord } from '../services/discordCatalogo'
import { DiscordEfecto } from './DiscordCosmeticos'

/**
 * Un marco que es una imagen, apoyado sobre la foto.
 *
 * Es el hermano de `Marco` para las decoraciones del catálogo en imagen
 * (`services/decoraciones`). La imagen mide `escala` veces el lado de la
 * foto y su centro va donde diga `posicion`: `centro` con escala 1,2 es un
 * marco entero al estilo Discord; `arriba-derecha` con 0,5 es una insignia
 * asomando por la esquina, que es como se llevan los emoji animados.
 *
 * `expo-image` y no `Image` de React Native porque un WebP animado en iOS
 * solo se mueve con este; el de siempre lo muestra quieto. Con `animado` en
 * falso se congela en el primer cuadro —la vidriera de marcos anima solo
 * la elegida y la que tiene el cursor, como con los dibujados.
 */
function MarcoImagen({
  decoracion,
  size,
  animado = true,
}: {
  decoracion: Decoracion
  size: number
  animado?: boolean
}) {
  const lado = Math.round(size * decoracion.escala)
  const { left, top } = esquina(decoracion.posicion, size, lado)
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left, top, width: lado, height: lado }}>
      <Image
        source={{ uri: urlDe(decoracion) }}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        autoplay={animado}
        cachePolicy="memory-disk"
        accessibilityLabel={decoracion.nombre}
      />
    </View>
  )
}

/** Dónde va la esquina superior izquierda de la imagen, según su posición. */
function esquina(posicion: Decoracion['posicion'], size: number, lado: number): { left: number; top: number } {
  const centro = (size - lado) / 2
  /* Las insignias se apoyan en el borde de la foto, no en su centro: el centro
     de la imagen cae sobre la circunferencia (a 45° para las esquinas). */
  const r = size / 2
  const k = Math.SQRT1_2
  switch (posicion) {
    case 'arriba':
      return { left: centro, top: -lado / 2 }
    case 'abajo':
      return { left: centro, top: size - lado / 2 }
    case 'arriba-derecha':
      return { left: r + r * k - lado / 2, top: r - r * k - lado / 2 }
    case 'arriba-izquierda':
      return { left: r - r * k - lado / 2, top: r - r * k - lado / 2 }
    default:
      return { left: centro, top: centro }
  }
}

/** De dónde sale el archivo: del bucket del catálogo, o de tu carpeta si es propia. */
function urlDe(decoracion: Decoracion): string {
  return esDecoracionPropia(decoracion.id)
    ? ilustracionUrl(rutaDePropia(decoracion.id))
    : decoracionUrl(decoracion.archivo)
}

/**
 * El marco de imagen por id: uno propio (`imagen:…`) o uno del catálogo, si
 * lo tiene. Es lo que `Marco` usa cuando el nombre no es un marco dibujado.
 */
export function MarcoImagenPorId({ id, size, animado = true }: { id: string; size: number; animado?: boolean }) {
  const delCatalogo = useDecoracion(esDecoracionPropia(id) ? null : id, 'marco')
  const decoracion = esDecoracionPropia(id) ? decoracionPropia(id, 'marco') : delCatalogo
  if (!decoracion) return null
  return <MarcoImagen decoracion={decoracion} size={size} animado={animado} />
}

/**
 * El efecto del perfil: lo que pasa encima del fondo, arriba.
 *
 * Son los «profile effects» de Discord: no rodean nada, pasan por encima
 * de la banda de arriba del perfil y no se pueden tocar. Los de la casa se
 * dibujan (`ui/EfectosDibujados`: nevada, confeti, luciérnagas…); si el id
 * no es uno de esos, se busca en el catálogo en imagen, que solo tiene
 * sentido con un archivo hecho para la banda entera —cubre el ancho y se
 * recorta arriba y abajo.
 */
export function EfectoPerfil({
  id,
  alto = 320,
  animado = true,
}: {
  id: string | null | undefined
  alto?: number
  animado?: boolean
}) {
  if (esDiscord(id)) return <DiscordEfecto id={id} alto={alto} animado={animado} />
  if (esEfectoDibujado(id)) return <EfectoDibujado id={id} alto={alto} animado={animado} />
  return <EfectoImagen id={id} alto={alto} animado={animado} />
}

function EfectoImagen({ id, alto, animado }: { id: string | null | undefined; alto: number; animado: boolean }) {
  const delCatalogo = useDecoracion(esDecoracionPropia(id) ? null : id, 'efecto')
  const decoracion = esDecoracionPropia(id) ? decoracionPropia(id, 'efecto') : delCatalogo
  if (!decoracion) return null
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: alto }}>
      <Image
        source={{ uri: urlDe(decoracion) }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        contentPosition="top center"
        autoplay={animado}
        cachePolicy="memory-disk"
        accessibilityLabel={decoracion.nombre}
      />
    </View>
  )
}
