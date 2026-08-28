import AsyncStorage from '@react-native-async-storage/async-storage'
import { NOVEDADES, type Novedad } from '../lib/novedades'
import { createStore, useStore } from './store'

/**
 * Qué versión de las novedades ya leyó esta persona, en este aparato.
 *
 * Existe para que actualizar **cuente lo que trajo sin que haya que ir a
 * buscarlo**: hasta ahora las novedades vivían solo en Ajustes → Novedades, o
 * sea que quien no entraba ahí nunca se enteraba de nada. Ahora la primera vez
 * que abrís una versión nueva, la tarjeta lo dice y se va.
 *
 * Se guarda **el número de versión y no un booleano**, por la misma razón que
 * el aviso del actualizador: haber leído lo de la 1.8.3 no puede callar lo de
 * la 1.9.0. Y va en el aparato y no en la base porque es de acá: la compu y el
 * teléfono se actualizan cada uno cuando le toca, y cada uno tiene que contar
 * lo suyo cuando le toca.
 */

const CLAVE = 'novedades:vista:v1'

/**
 * Lo que hay para contar, ya resuelto.
 *
 * Se guarda la **lista armada** y no la versión leída con un selector que la
 * derive: un selector que hiciera `slice` devolvería un array nuevo en cada
 * lectura y `useSyncExternalStore` lo tomaría por un cambio en cada render.
 * Acá se calcula una vez, al arrancar, y después solo se apaga.
 */
type Estado = { pendientes: Novedad[] | null }

const store = createStore<Estado>({ pendientes: null })

/**
 * Lee lo guardado y decide si hay algo que contar. Lo llama el layout cuando
 * ya hay sesión — sobre el login no hay nada que festejar.
 *
 * Si la versión leída está en la lista, se muestran **todas las de arriba**:
 * quien estuvo un mes sin abrir la app se salteó tres versiones y las tres son
 * novedad para él. Si no está —aparato nuevo, o una versión más vieja que las
 * que quedaron escritas— se muestra solo la última: es lo que está corriendo, y
 * volcarle el changelog entero a alguien que recién llega no es una bienvenida.
 */
export async function cargarNovedadesVistas(): Promise<void> {
  const actual = NOVEDADES[0]
  if (!actual) return

  let vista: string | null
  try {
    vista = await AsyncStorage.getItem(CLAVE)
  } catch {
    /* Sin disco no se muestra nada: es preferible perderse una novedad a
       repetirle la misma tarjeta en cada arranque a alguien que no la puede
       despachar nunca, porque tampoco se le puede guardar que ya la vio. */
    return
  }

  if (vista === actual.version) return

  const desde = vista ? NOVEDADES.findIndex((n) => n.version === vista) : -1
  store.set({ pendientes: desde > 0 ? NOVEDADES.slice(0, desde) : [actual] })
}

/** Despacha la tarjeta y anota hasta dónde leyó. */
export function marcarNovedadesVistas(): void {
  const actual = NOVEDADES[0]
  store.set({ pendientes: null })
  if (actual) {
    void AsyncStorage.setItem(CLAVE, actual.version).catch(() => {
      /* No se pudo anotar: vuelve a aparecer la próxima vez. Molesta menos que
         tragarse la novedad. */
    })
  }
}

/** Las versiones que todavía no leyó, de la más nueva a la más vieja. */
export const useNovedadesPendientes = () => useStore(store, (s) => s.pendientes)
