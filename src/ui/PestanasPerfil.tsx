import { TextoPerfil as Text } from './FuentePerfil'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Pressable, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { fetchStats, type EstadisticasPerfil } from '../services/plays'
import type { Playlist } from '../services/playlists'
import { Glass } from './Glass'
import { ListasPerfil } from './ListasPerfil'
import { Dato } from './PerfilPublico'
import { ParedDeReacciones } from './Reacciones'

/**
 * Las dos pestañas del perfil, en el teléfono: **«Reciente»** y **«Space»**.
 *
 * Son las de Airbuds, y parten el perfil por la misma línea que ya lo partía
 * el escritorio en dos columnas: a un lado lo que la persona **armó** —el
 * mosaico de vitrinas, quieto hasta que lo toca— y al otro lo que **pasa**
 * —lo que está sonando, lo que le dejaron, cuánto escucha, lo que publicó—.
 * Apilado en una sola columna, lo vivo quedaba enterrado debajo del mosaico
 * o, peor, empujaba el mosaico fuera de la primera pantalla; con las pestañas
 * cada mitad tiene la pantalla entera para ella.
 *
 * Es estado local de la pantalla y no una ruta: cambiar de pestaña no es ir
 * a otro lado, es dar vuelta la misma tarjeta.
 */
export type PestanaPerfil = 'reciente' | 'space'

/**
 * Con qué pestaña abre un perfil.
 *
 * «Space» si el mosaico tiene piezas y «Reciente» si no: un perfil recién
 * hecho abriría en el cartel de «está vacío», que es lo peor que puede
 * mostrar una primera pantalla, mientras que las listas y los minutos siempre
 * tienen algo que decir. `null` mientras no se sabe cuántas hay — decidir con
 * un cero provisorio hacía que todo perfil abriera en «Reciente» y saltara a
 * «Space» apenas llegaba la cuenta.
 */
export function pestanaInicial(cuantasVitrinas: number | null): PestanaPerfil | null {
  if (cuantasVitrinas === null) return null
  return cuantasVitrinas > 0 ? 'space' : 'reciente'
}

const PESTANAS: { id: PestanaPerfil; rotulo: string }[] = [
  { id: 'reciente', rotulo: 'Reciente' },
  { id: 'space', rotulo: 'Space' },
]

/** El mismo resorte que la cápsula de la barra de pestañas (`ui/TabBar`). */
const RESORTE = { damping: 22, stiffness: 260, mass: 0.7, overshootClamping: true }

/** Alto de la píldora: el de «Editar perfil», que va en la misma fila. */
const ALTO = 44
const AIRE = 4

/**
 * El segmento de dos posiciones.
 *
 * Habla el idioma de las pestañas de la app: una píldora de vidrio —va sobre
 * el fondo del perfil, que es justo donde el material tiene algo que
 * difuminar— con la elegida marcada por una cápsula que **se desliza** de una
 * a otra, como la de `TabPildora`. La cápsula es blanca y no un gris más claro
 * porque acá es el estado activo de la pantalla, que es a lo que
 * `docs/DESIGN.md` le reserva el acento; y se mide en vez de repartirse en
 * mitades porque «Reciente» y «Space» no miden lo mismo.
 *
 * `activa` en `null` es «todavía no se decidió»: la píldora se dibuja igual,
 * sin cápsula, para que la fila no cambie de alto cuando llega la cuenta.
 */
export function PestanasPerfil({
  activa,
  onCambiar,
}: {
  activa: PestanaPerfil | null
  onCambiar: (pestana: PestanaPerfil) => void
}) {
  const [sitios, setSitios] = useState<Partial<Record<PestanaPerfil, { x: number; w: number }>>>({})
  const x = useSharedValue(0)
  const w = useSharedValue(0)
  const opacidad = useSharedValue(0)
  /** El primer dibujado no se anima: la cápsula nace donde tiene que estar. */
  const colocada = useRef(false)

  useEffect(() => {
    const sitio = activa ? sitios[activa] : undefined
    if (!sitio) return
    if (colocada.current) {
      x.value = withSpring(sitio.x, RESORTE)
      w.value = withSpring(sitio.w, RESORTE)
    } else {
      x.value = sitio.x
      w.value = sitio.w
      opacidad.value = 1
      colocada.current = true
    }
  }, [activa, sitios, x, w, opacidad])

  /* Por `style` y nunca por `className`: NativeWind no procesa clases en los
     componentes animados y la cápsula se dibujaría sin fondo (`docs/DESIGN.md`). */
  const capsula = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
    width: w.value,
    opacity: opacidad.value,
  }))

  return (
    <Glass radius={ALTO / 2} style={{ height: ALTO, padding: AIRE }}>
      <View className="flex-row" accessibilityRole="tablist">
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              borderRadius: (ALTO - AIRE * 2) / 2,
              backgroundColor: '#FFFFFF', // `primary`: el acento, para el estado activo
            },
            capsula,
          ]}
        />
        {PESTANAS.map((p) => {
          const on = activa === p.id
          return (
            <Pressable
              key={p.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={p.rotulo}
              onPress={() => onCambiar(p.id)}
              onLayout={(e) => {
                // React Native libera el evento al terminar el callback; el
                // actualizador de estado puede ejecutarse después.
                const { x: sx, width: sw } = e.nativeEvent.layout
                setSitios((s) => {
                  return s[p.id]?.x === sx && s[p.id]?.w === sw ? s : { ...s, [p.id]: { x: sx, w: sw } }
                })
              }}
              className="items-center justify-center rounded-full px-5 active:opacity-70"
              style={{ height: ALTO - AIRE * 2 }}
            >
              <Text
                className={`text-[13px] font-semibold ${
                  on ? 'text-primary-foreground' : 'text-muted-foreground'
                }`}
              >
                {p.rotulo}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </Glass>
  )
}

/**
 * Lo que va en «Reciente»: la parte viva del perfil, en este orden.
 *
 * 1. Lo que está sonando ahora o lo último que escuchó (`escucha`, que solo
 *    tiene sentido en el perfil de otro y por eso llega armado desde afuera).
 * 2. La pared de reacciones que le dejaron.
 * 3. El resumen corto de escucha: minutos y artista más escuchado.
 * 4. Las listas que publicó.
 *
 * El orden es de más vivo a más quieto: lo de ahora arriba, lo que otros
 * dejaron después, y al final lo que ya estaba. Cada sección se busca su dato
 * y desaparece sola si no tiene nada —la pared sin reacciones, la escucha sin
 * contacto— así que acá no hay un cartel de vacío: con el resumen y las
 * listas siempre queda algo, y un «todavía no hay nada reciente» encima de
 * dos secciones con contenido sería mentir.
 *
 * Es el mismo componente en el perfil propio y en el ajeno a propósito, igual
 * que `Vitrinas`: tu perfil se tiene que ver igual mirándolo vos que
 * mirándolo otro.
 */
export function Reciente({
  ownerId,
  nombre,
  propio,
  recarga,
  onAbrirLista,
  escucha,
  sinResumen = false,
}: {
  ownerId: string
  nombre: string
  propio: boolean
  /** Sube cuando algo cambió afuera —una reacción mandada, volver del editor—. */
  recarga: number
  onAbrirLista: (lista: Playlist) => void
  /** Arriba de todo: la escucha de otro con sus emojis. En el propio no va. */
  escucha?: ReactNode
  /**
   * Sin el resumen corto. En escritorio la columna de la derecha ya trae el
   * `Resumen` entero, que abre con esos mismos dos números.
   */
  sinResumen?: boolean
}) {
  return (
    <View className="gap-8">
      {escucha}
      <ParedDeReacciones ownerId={ownerId} recarga={recarga} propio={propio} nombre={nombre} />
      {sinResumen ? null : <ResumenCorto ownerId={ownerId} />}
      <ListasPerfil ownerId={ownerId} nombre={nombre} propio={propio} onAbrir={onAbrirLista} />
    </View>
  )
}

/**
 * Cuánto escucha, en dos números: los minutos y el artista más escuchado.
 *
 * Es la cabeza del `Resumen` de escritorio, sola y acostada: es lo que un
 * perfil puede decir de la escucha de alguien sin abrir su historial, que es
 * privado por policy (`get_profile_stats` devuelve agregados y nunca filas,
 * y nada si esa cuenta está en privado — en ese caso acá no se dibuja nada).
 * Cero minutos se muestra igual: es un dato, no un dato faltante.
 *
 * Los dos van en una fila y no apilados como en la columna de escritorio
 * porque acá compiten por alto con las listas y el mosaico: dos números
 * acostados ocupan lo que una fila de texto.
 */
function ResumenCorto({ ownerId }: { ownerId: string }) {
  const [stats, setStats] = useState<EstadisticasPerfil | null>(null)

  useEffect(() => {
    if (!ownerId) return
    let vivo = true
    fetchStats(ownerId)
      .then((e) => vivo && setStats(e))
      .catch(() => undefined)
    return () => {
      vivo = false
    }
  }, [ownerId])

  if (!stats) return null

  return (
    <View className="flex-row items-start gap-8">
      <View className="shrink-0">
        <Dato rotulo="Minutos escuchados" valor={stats.minutos} />
      </View>
      {stats.artistaTop ? (
        <View className="min-w-0 flex-1">
          <Dato
            rotulo="Más escuchado"
            valor={stats.artistaTop}
            detalle={`${stats.minutosArtistaTop} min`}
          />
        </View>
      ) : null}
    </View>
  )
}
