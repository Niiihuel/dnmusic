export type FiltrosCatalogoPerfilProps = {
  tipo: string
  tipos: { id: string; nombre: string }[]
  onTipo: (id: string) => void
  buscar: string
  onBuscar: (value: string) => void
  coleccion: string
  colecciones: { id: string; nombre: string }[]
  onColeccion: (id: string) => void
  onPrevia: () => void
  ocupado?: boolean
}
