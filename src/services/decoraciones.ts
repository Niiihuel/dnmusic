import { getSupabase } from '../lib/supabase'
import { createStore, useStore } from '../state/store'

/**
 * Decoraciones en imagen: marcos y efectos de perfil que son un archivo.
 *
 * Son la otra mitad del catálogo de marcos: los de `ui/Marco.tsx` se dibujan
 * con SVG y viven en el código; estos son imágenes animadas —WebP, APNG,
 * GIF— que se suben **una vez a nuestro Storage** (bucket `decoraciones`) y
 * se registran en la tabla del mismo nombre con su autor y su licencia. Es
 * el camino para lo que no se puede dibujar a mano: una decoración propia,
 * o una con licencia libre como los emoji animados de Noto (CC BY 4.0), que
 * es con lo que arranca el catálogo (`scripts/decoraciones`).
 *
 * Nunca un enlace ajeno: lo que no es nuestro se muere solo (la lección de
 * decoprofile, ver la migración `decoraciones`).
 *
 * Dos tipos: `marco` se apoya sobre la foto —con qué tamaño y en qué lugar lo
 * dice cada fila— y `efecto` se dibuja encima del fondo del perfil, arriba,
 * como los «profile effects» de Discord.
 */
export type TipoDecoracion = 'marco' | 'efecto'

export type PosicionDecoracion = 'centro' | 'arriba' | 'arriba-derecha' | 'arriba-izquierda' | 'abajo'

export type Decoracion = {
  id: string
  tipo: TipoDecoracion
  nombre: string
  familia: string
  /** La ruta en el bucket. */
  archivo: string
  /** El lado de la imagen en veces el lado de la foto (solo `marco`). */
  escala: number
  /** Dónde va el centro de la imagen respecto de la foto (solo `marco`). */
  posicion: PosicionDecoracion
  autor: string
  licencia: string
  fuente: string
  orden: number
}

const store = createStore<{
  /** `null` mientras no se pidió; después la lista, vacía si no hay o falló. */
  lista: Decoracion[] | null
  pidiendo: boolean
}>({ lista: null, pidiendo: false })

/** La URL pública de una decoración. El bucket es público, no hay que firmar. */
export function decoracionUrl(archivo: string): string {
  return getSupabase().storage.from('decoraciones').getPublicUrl(archivo).data.publicUrl
}

/**
 * Trae el catálogo una vez y lo deja en memoria.
 *
 * Es chico —decenas de filas— y cambia cuando alguien corre el script de
 * importar, no mientras la app está abierta. Fallar deja la lista vacía:
 * un perfil con una decoración que no se pudo leer se dibuja sin ella, y
 * nada más.
 */
export async function cargarDecoraciones(): Promise<Decoracion[]> {
  const { lista, pidiendo } = store.get()
  if (lista) return lista
  if (pidiendo) return []
  store.set({ pidiendo: true })
  try {
    const { data, error } = await getSupabase()
      .from('decoraciones')
      .select('id, tipo, nombre, familia, archivo, escala, posicion, autor, licencia, fuente, orden')
      .order('orden', { ascending: true })
      .order('nombre', { ascending: true })
    if (error) throw error
    const filas = ((data ?? []) as Record<string, unknown>[]).map(decoracionDeFila).filter(Boolean) as Decoracion[]
    store.set({ lista: filas, pidiendo: false })
    return filas
  } catch {
    store.set({ lista: [], pidiendo: false })
    return []
  }
}

function decoracionDeFila(r: Record<string, unknown>): Decoracion | null {
  if (typeof r.id !== 'string' || typeof r.archivo !== 'string') return null
  const tipo = r.tipo === 'efecto' ? 'efecto' : 'marco'
  const posiciones: PosicionDecoracion[] = ['centro', 'arriba', 'arriba-derecha', 'arriba-izquierda', 'abajo']
  return {
    id: r.id,
    tipo,
    nombre: typeof r.nombre === 'string' ? r.nombre : r.id,
    familia: typeof r.familia === 'string' && r.familia ? r.familia : 'insignias',
    archivo: r.archivo,
    escala: typeof r.escala === 'number' ? r.escala : Number(r.escala) || 1.2,
    posicion: posiciones.includes(r.posicion as PosicionDecoracion) ? (r.posicion as PosicionDecoracion) : 'centro',
    autor: typeof r.autor === 'string' ? r.autor : '',
    licencia: typeof r.licencia === 'string' ? r.licencia : '',
    fuente: typeof r.fuente === 'string' ? r.fuente : '',
    orden: typeof r.orden === 'number' ? r.orden : 0,
  }
}

/**
 * El catálogo, para dibujar. Lo pide la primera vez que alguien lo mira; hasta
 * que llega es `null` y el marco de imagen no se dibuja — un instante sin
 * decoración, no un cuadrado roto.
 */
export function useDecoraciones(): Decoracion[] | null {
  const lista = useStore(store, (s) => s.lista)
  if (lista === null && !store.get().pidiendo) void cargarDecoraciones()
  return lista
}

/** Una decoración por id, del catálogo ya cargado. */
export function useDecoracion(id: string | null | undefined, tipo: TipoDecoracion): Decoracion | null {
  const lista = useDecoraciones()
  if (!id || !lista) return null
  return lista.find((d) => d.id === id && d.tipo === tipo) ?? null
}

/* ------------------------------------------------------------------------ */
/* Las propias: un archivo tuyo, en tu carpeta                                */
/* ------------------------------------------------------------------------ */

/**
 * El prefijo de una decoración **propia**: `imagen:<ruta en showcases>`.
 *
 * Además del catálogo compartido, cada persona puede subir su propio archivo
 * —como sube su foto— y llevarlo de marco o de efecto. No pasa por la tabla
 * ni por el bucket `decoraciones`: va a su carpeta del bucket `showcases`,
 * que ya es suya, y el perfil guarda la ruta con este prefijo. Lo que cada
 * uno sube es cosa suya, igual que su foto.
 */
export const PREFIJO_PROPIA = 'imagen:'

export function esDecoracionPropia(id: string | null | undefined): id is string {
  return !!id && id.startsWith(PREFIJO_PROPIA)
}

/** La ruta en `showcases` de una decoración propia. */
export function rutaDePropia(id: string): string {
  return id.slice(PREFIJO_PROPIA.length)
}

/**
 * Una decoración propia como fila del catálogo, para dibujarla con lo mismo:
 * un marco entero al estilo Discord (1,2× la foto, centrado) o un efecto que
 * cubre la banda.
 */
export function decoracionPropia(id: string, tipo: TipoDecoracion): Decoracion {
  return {
    id,
    tipo,
    nombre: 'Tu decoración',
    familia: 'propias',
    archivo: rutaDePropia(id),
    escala: 1.2,
    posicion: 'centro',
    autor: '',
    licencia: '',
    fuente: '',
    orden: 0,
  }
}

