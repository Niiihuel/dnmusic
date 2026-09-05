import { usePreferencia } from './ajustes'
import { createStore, useStore } from './store'

/**
 * El actualizador del escritorio, visto desde la app.
 *
 * Vive en un store por lo mismo que el aviso de abajo: el estado lo publica el
 * proceso principal de Electron, y lo miran **dos** lugares que no se conocen
 * entre sí —la píldora de «hay una nueva» que dibuja el layout y la pantalla de
 * Novedades—. Suscribirse dos veces al mismo puente daría dos verdades y una de
 * ellas siempre estaría un evento atrás.
 *
 * En la web y en el teléfono el puente no existe: `hayActualizador` es falso,
 * nadie se suscribe a nada y las dos pantallas dibujan lo que corresponde a una
 * app que se actualiza sola desde su tienda.
 */

/** Qué trae la versión que viene, sacado del feed (ver desktop/src/actualizador.ts). */
export type NotasVersion = { titulo: string; cambios: string[]; fecha: string | null }

/** El estado tal cual lo publica `desktop/src/actualizador.ts`. */
export type EstadoActualizacion =
  | { fase: 'inactivo'; version: string }
  | { fase: 'apagado'; motivo: string }
  | { fase: 'buscando' }
  | { fase: 'sin-novedad'; version: string }
  | { fase: 'esperando-silencio'; version: string; notas: NotasVersion | null }
  | {
      fase: 'bajando'
      version: string
      notas: NotasVersion | null
      porcentaje: number
      bajados: number
      total: number
    }
  | { fase: 'lista'; version: string; notas: NotasVersion | null }
  | { fase: 'error'; mensaje: string }

/*
 * El puente del preload, tipado estructural como en `lib/notificarEscritorio`:
 * la app no importa **nada** de `desktop/`. Si el puente no está, no estamos en
 * la app de escritorio.
 */
type PuenteEscritorio = {
  version?: () => Promise<string>
  actualizacion?: {
    estado: () => Promise<EstadoActualizacion>
    buscar: () => void
    descargar?: () => void
    instalar: () => void
    alCambiar: (escuchar: (estado: EstadoActualizacion) => void) => () => void
  }
}

function puente(): PuenteEscritorio['actualizacion'] | undefined {
  return (globalThis as { dnmusicEscritorio?: PuenteEscritorio }).dnmusicEscritorio?.actualizacion
}

/** Si esta sesión corre adentro de la app de escritorio. */
export const HAY_ACTUALIZADOR = puente() !== undefined
export const PUEDE_DESCARGAR_ACTUALIZACION = typeof puente()?.descargar === 'function'

type Estado = {
  estado: EstadoActualizacion
  /**
   * La versión cuyo aviso ya despachaste.
   *
   * Se guarda el número y no un booleano: descartar el aviso de la 1.3.0 no
   * puede callar el de la 1.4.0. Y no se persiste a disco a propósito — dura lo
   * que dure esta ventana, porque la próxima vez que abrís la app **ya está
   * instalada** (se instala al cerrar) y no hay nada que avisar.
   */
  descartada: string | null
}

const store = createStore<Estado>({
  estado: { fase: 'inactivo', version: '' },
  descartada: null,
})

/*
 * Una sola suscripción para toda la app, armada al cargar el módulo.
 *
 * Va acá y no adentro de un `useEffect` porque el estado tiene que estar al día
 * aunque nadie lo esté mirando: si la píldora se montara recién al abrir una
 * pantalla, se perdería el evento de «lista» que llegó mientras estabas en otra.
 */
if (HAY_ACTUALIZADOR) {
  const p = puente()
  let huboEvento = false
  p?.alCambiar((estado) => {
    huboEvento = true
    store.set({ estado })
  })
  void p
    ?.estado()
    .then((estado) => {
      if (!huboEvento) store.set({ estado })
    })
    .catch(() => {
      if (!huboEvento)
        store.set({ estado: { fase: 'error', mensaje: 'No se pudo consultar el actualizador.' } })
    })
}

export function buscarActualizacion(): void {
  puente()?.buscar()
}

export function descargarActualizacion(): void {
  puente()?.descargar?.()
}

export function instalarActualizacion(): void {
  puente()?.instalar()
}

/** Despacha el aviso de esta versión. La actualización se instala igual al cerrar. */
export function descartarAviso(version: string): void {
  store.set({ descartada: version })
}

export const useActualizacion = () => useStore(store, (s) => s.estado)

/**
 * ¿Hay una versión lista que todavía no despachaste?
 *
 * Devuelve el estado tal cual (`s.estado`) cuando corresponde, o `null` — y esa
 * es la clave: el selector **no arma nada nuevo**, devuelve una referencia que
 * ya existe. Mientras el estado es `bajando`, esto es `null` en cada tick de
 * progreso, y `null` con `null` es el mismo valor, así que quien se suscribe no
 * se entera de la descarga. Recién cuando pasa a `lista` cambia la referencia y
 * hay un solo re-render.
 *
 * (Un selector que armara `{ version, notas }` devolvería una referencia nueva
 * en cada lectura y `useSyncExternalStore` lo leería como cambio constante: por
 * eso se devuelve el objeto guardado, no uno derivado.)
 */
function seleccionarAviso(s: Estado): Extract<EstadoActualizacion, { fase: 'lista' }> | null {
  return s.estado.fase === 'lista' && s.descartada !== s.estado.version ? s.estado : null
}

/** La versión lista para instalar, con sus notas. La usa la píldora. */
export function useAvisoDeActualizacion() {
  const activo = usePreferencia('avisosActualizacion')
  const aviso = useStore(store, seleccionarAviso)
  return activo ? aviso : null
}

/**
 * Solo **si** hay un aviso, como booleano.
 *
 * Para quien únicamente necesita saber si la píldora está presente —el toast de
 * abajo, que se corre hacia arriba cuando la hay—. Suscribirse al objeto lo
 * re-renderizaría cuando cambien las notas o la versión; suscribirse al estado
 * crudo, en cada tick de descarga. Un booleano solo cambia cuando cruza de no-
 * hay a hay, que es exactamente lo que le importa (regla `rerender-derived-state`).
 */
export function useHayAvisoActualizacion(): boolean {
  const activo = usePreferencia('avisosActualizacion')
  const hay = useStore(store, (s) => seleccionarAviso(s) !== null)
  return activo && hay
}
