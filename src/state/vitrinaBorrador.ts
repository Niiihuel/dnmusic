import type {
  Showcase,
  ShowcaseAncho,
  ShowcaseContenido,
  ShowcaseEstilo,
  ShowcaseKind,
} from '../services/showcases'
import { createStore, useStore } from './store'

/**
 * La vitrina que se está armando.
 *
 * Armar una pieza del perfil son varias pantallas: la hoja que elige el tipo,
 * el editor con la vista previa, el buscador que elige la canción o el
 * artista, la hoja del tema. Todas tocan **la misma vitrina a medio hacer**, y
 * como son rutas distintas no se pueden pasar el objeto por props. Vive acá,
 * como el recorte que viaja de la búsqueda al editor de fragmento
 * (`state/recorte`).
 *
 * Es un borrador: nada de esto llega a la base hasta que el editor guarda.
 * Salir sin guardar lo tira, y editar una vitrina existente arranca copiándola
 * acá para no tocar la de verdad hasta el final.
 */
export type Borrador = {
  /** La vitrina que se edita; `null` si se está creando una nueva. */
  id: string | null
  kind: ShowcaseKind
  ancho: ShowcaseAncho
  /** Lo que muestra. `null` mientras todavía no se eligió nada. */
  contenido: ShowcaseContenido | null
  estilo: ShowcaseEstilo
  /**
   * Dentro de qué sub-space nace; `null` es el mosaico principal.
   *
   * Solo importa al crear: una pieza que ya existe no se muda de mosaico, y
   * al editarla queda en `null` sin que nadie lo mire. Viaja en el borrador y
   * no por la ruta porque entre la hoja del «+», el buscador y el editor hay
   * tres pantallas, y pasarlo de una a otra por query lo perdería en la
   * primera que se olvide.
   */
  parentId: string | null
}

type Estado = {
  borrador: Borrador | null
  /**
   * El perfil tiene que entrar en modo de edición al volver a mostrarse.
   *
   * Lo pide «Editar perfil» —que es otra ruta, apilada sobre el perfil— cuando
   * se toca «Armar el mosaico»: al volver, el perfil lo lee una vez y lo apaga.
   */
  armarAlVolver: boolean
}

const store = createStore<Estado>({ borrador: null, armarAlVolver: false })

/**
 * Con qué tamaño nace cada tipo.
 *
 * Las piezas de música nacen chicas —es lo que hace que un mosaico recién
 * armado se vea como un mosaico y no como una lista—; un verso nace ancho
 * porque es texto y necesita renglón; un encabezado ocupa siempre su fila.
 */
export function anchoInicial(kind: ShowcaseKind): ShowcaseAncho {
  return kind === 'letra' || kind === 'encabezado' || kind === 'espaciador' ? 'entero' : 'mitad'
}

/** Empieza una vitrina nueva del tipo elegido, en el mosaico que se diga. */
export function empezarBorrador(kind: ShowcaseKind, parentId: string | null = null) {
  store.set({
    borrador: {
      id: null,
      kind,
      ancho: anchoInicial(kind),
      /* Las que no piden elegir nada arrancan con su contenido vacío puesto:
         así el editor tiene sobre qué escribir. */
      contenido:
        kind === 'espaciador'
          ? { kind: 'espaciador' }
          : kind === 'encabezado'
            ? { kind: 'encabezado', titulo: '' }
            : kind === 'subspace'
              ? { kind: 'subspace', titulo: '' }
              : kind === 'texto'
                ? { kind: 'texto', texto: '' }
                : null,
      estilo: { tema: null, fondo: null, fuente: null },
      parentId,
    },
  })
}

/** Empieza a editar una vitrina que ya existe, sobre una copia. */
export function editarBorrador(v: Showcase) {
  const { id, ancho, estilo, ...contenido } = v
  store.set({ borrador: { id, kind: v.kind, ancho, contenido, estilo, parentId: null } })
}

/** Cambia una parte del borrador. Sin borrador abierto no hace nada. */
export function actualizarBorrador(patch: Partial<Borrador> | ((b: Borrador) => Partial<Borrador>)) {
  const actual = store.get().borrador
  if (!actual) return
  const cambio = typeof patch === 'function' ? patch(actual) : patch
  store.set({ borrador: { ...actual, ...cambio } })
}

export function limpiarBorrador() {
  store.set({ borrador: null })
}

export function pedirArmado() {
  store.set({ armarAlVolver: true })
}

/** Si se pidió entrar a armar. Leerlo lo apaga: es un pedido, no un estado. */
export function tomarArmado(): boolean {
  const pedido = store.get().armarAlVolver
  if (pedido) store.set({ armarAlVolver: false })
  return pedido
}

export const useBorrador = () => useStore(store, (s) => s.borrador)
