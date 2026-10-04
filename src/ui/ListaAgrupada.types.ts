import type { SFSymbol } from 'sf-symbols-typescript'

/**
 * Una lista agrupada, descrita **como datos y no como hijos**.
 *
 * Es la diferencia que hace que esto pueda ser nativo en iOS. Un `Section` de
 * SwiftUI solo acepta vistas de SwiftUI; si las filas llegaran como JSX de
 * React Native habría que hospedar cada una en un `RNHostView` y devolverle su
 * alto a SwiftUI — el circuito de medición que este proyecto ya sacó una vez
 * (ver el README de `modules/collection-controls`). Describiéndolas, cada
 * plataforma dibuja las suyas y no hay nada que medir dos veces.
 *
 * El precio es que una fila no puede ser cualquier cosa: son estas tres, que
 * es exactamente el vocabulario de una lista de Ajustes. Para lo que no entre
 * —una fila con tapa, una con avatar— está `GrupoAjustes` de siempre.
 */
export type FilaAgrupada =
  | {
      tipo: 'interruptor'
      id: string
      rotulo: string
      /** Una segunda línea. Preferir el `pie` de la sección: deja las filas parejas. */
      detalle?: string
      activo: boolean
      onCambiar: (activo: boolean) => void
      symbol?: SFSymbol
      /** El ícono de React Native, para donde no hay SF Symbols. */
      icono?: React.ReactNode
      disabled?: boolean
    }
  | {
      tipo: 'accion'
      copyText?: string
      id: string
      rotulo: string
      detalle?: string
      onPress: () => void
      symbol?: SFSymbol
      icono?: React.ReactNode
      destructiva?: boolean
      /** Un valor a la derecha del rótulo: «Descargas y caché · 3 descargas». */
      valor?: string
      /** Dibuja el chevron: la fila lleva a otro lado en vez de hacer algo. */
      lleva?: boolean
      disabled?: boolean
      busy?: boolean
    }
  | {
      tipo: 'menu'
      id: string
      rotulo: string
      detalle?: string
      valor: string
      symbol?: SFSymbol
      icono?: React.ReactNode
      disabled?: boolean
      opciones: {
        id: string
        rotulo: string
        symbol?: SFSymbol
        seleccionada?: boolean
        destructiva?: boolean
        disabled?: boolean
      }[]
      onElegir: (id: string) => void
    }
  | {
      tipo: 'dato'
      id: string
      rotulo: string
      valor: string
      symbol?: SFSymbol
      icono?: React.ReactNode
    }

export type SeccionAgrupada = {
  id: string
  titulo?: string
  /** Lo que explica al bloque, al pie. Nunca como subtítulo de una fila. */
  pie?: string
  error?: string
  filas: FilaAgrupada[]
}

export type ListaAgrupadaProps = {
  secciones: SeccionAgrupada[]
  /** Para el lector de pantalla cuando la lista no tiene títulos de sección. */
  label?: string
  /** Reserva inferior para barras flotantes y área segura. */
  piso?: number
}
