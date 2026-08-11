import AsyncStorage from '@react-native-async-storage/async-storage'
import { createStore, useStore } from './store'

/**
 * Las preferencias de quien escucha.
 *
 * Van aparte de `state/playback` a propósito, y la diferencia no es de
 * comodidad: `playback` es **lo que está pasando** —qué suena, en qué segundo,
 * en qué orden— y muere con la sesión; esto es **lo que elegiste que pase**, y
 * tiene que sobrevivir a cerrar la app.
 *
 * Se guardan en el teléfono y no en la base porque son de este dispositivo: que
 * en la compu quieras las recomendaciones y en el teléfono no es una preferencia
 * legítima, no un estado a sincronizar.
 */
type Ajustes = {
  /**
   * Seguir con recomendaciones cuando se termina la lista.
   *
   * Prendido por defecto, como en Spotify: llegar al final de una lista y que se
   * haga silencio es lo que uno menos espera cuando puso música de fondo. Pero
   * se puede apagar, porque lo contrario —que la app siga sola con cosas que no
   * elegiste— también molesta a mucha gente.
   */
  autoplay: boolean
}

const POR_DEFECTO: Ajustes = { autoplay: true }

const CLAVE = 'ajustes:v1'

const store = createStore<Ajustes>({ ...POR_DEFECTO })

/**
 * Lee lo guardado. Lo llama el layout al arrancar.
 *
 * Si no hay nada o no se entiende, quedan los valores por defecto: una
 * preferencia ilegible no puede dejar la app sin reproducción.
 */
export async function cargarAjustes() {
  try {
    const crudo = await AsyncStorage.getItem(CLAVE)
    if (!crudo) return
    const guardado = JSON.parse(crudo) as Partial<Ajustes>
    store.set({ autoplay: guardado.autoplay ?? POR_DEFECTO.autoplay })
  } catch {
    // Quedan los valores por defecto.
  }
}

export function setAutoplay(autoplay: boolean) {
  store.set({ autoplay })
  void AsyncStorage.setItem(CLAVE, JSON.stringify(store.get())).catch(() => {
    // No se pudo guardar: vale para esta sesión y se vuelve a preguntar.
  })
}

export const useAjustes = () => useStore(store, (s) => s)
/** Para leerlo desde fuera de un componente, como hace `advance`. */
export const leerAjustes = () => store.get()
