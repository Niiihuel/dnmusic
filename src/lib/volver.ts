import { useRouter } from 'expo-router'

type Router = ReturnType<typeof useRouter>
type Destino = Parameters<Router['replace']>[0]

/**
 * Volver, incluso cuando no hay a dónde.
 *
 * `router.back()` a secas asume que esta pantalla se apiló sobre otra. En el
 * teléfono siempre es así —llegás tocando—, pero en la web una pantalla también
 * se abre **escribiendo la dirección o recargando**, y ahí la pila arranca acá:
 * no hay entrada anterior, el navegador no encuentra a quién darle el gesto y
 * salta `The action 'GO_BACK' was not handled by any navigator`. Peor que el
 * aviso es lo que ve el usuario, que es un botón de atrás que no hace nada.
 *
 * El reemplazo es `replace` y no `push` a propósito: si no había historia,
 * apilar el destino dejaría un «atrás» que vuelve a la pantalla de la que
 * acabás de salir, y el botón quedaría rebotando entre las dos.
 *
 * Cada pantalla dice cuál es su destino natural —el editor vuelve al perfil, el
 * perfil a la casa— porque eso no se puede deducir de la ruta: es la jerarquía
 * de la app, no la del árbol de archivos.
 */
export function volver(router: Router, destino: Destino) {
  if (router.canGoBack()) router.back()
  else router.replace(destino)
}
