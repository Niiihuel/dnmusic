import { useEffect, useState, type ReactNode } from 'react'
import { View } from 'react-native'
import { fetchStats, type EstadisticasPerfil } from '../services/plays'
import type { Playlist } from '../services/playlists'
import { ListasPerfil } from './ListasPerfil'
import { Dato } from './PerfilPublico'
import { ParedDeReacciones } from './Reacciones'

export { SelectorPestanasPerfil as PestanasPerfil } from './SelectorPestanasPerfil'

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
      <ListasPerfil ownerId={ownerId} nombre={nombre} propio={propio} recarga={recarga} onAbrir={onAbrirLista} />
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
