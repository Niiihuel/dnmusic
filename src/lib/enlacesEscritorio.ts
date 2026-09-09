import { useEffect } from 'react'
import { useRouter } from 'expo-router'

/**
 * Los links de afuera, cuando la app es la de escritorio.
 *
 * En el teléfono esto no hace falta: un universal link abre la app y expo-router
 * ya está mirando la URL. En el escritorio no hay URL que mirar —la ventana se
 * sirve a sí misma desde `app://dnmusic`— así que el link llega por el proceso
 * principal, que es el único que lo ve (`desktop/src/enlaces.ts`), y entra acá
 * como una ruta ya resuelta.
 *
 * Es un `push` y no un `replace`: quien tocó un link desde afuera mientras
 * escuchaba tiene que poder volver a lo que estaba haciendo.
 */
type PuenteEnlaces = { alAbrir: (fn: (ruta: string) => void) => () => void }

function puente(): PuenteEnlaces | undefined {
  return (globalThis as { dnmusicEscritorio?: { enlaces?: PuenteEnlaces } }).dnmusicEscritorio
    ?.enlaces
}

export function useEnlacesDelEscritorio(): void {
  const router = useRouter()
  useEffect(() => {
    const p = puente()
    if (!p) return
    return p.alAbrir((ruta) => {
      /* El tipo de `href` enumera las rutas estáticas y no acepta un string
         armado en tiempo de ejecución; ésta la validó `enlaces.ts` contra la
         lista de compartibles antes de salir del proceso principal. Mismo
         casteo y misma razón que el destino guardado del gate. */
      router.push(ruta as '/')
    })
  }, [router])
}
