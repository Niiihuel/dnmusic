import type { Href } from 'expo-router'
import type { Profile } from '../services/profile'
import type { TrackResult } from '../services/music'
import type { CampoPerfil, EditorCampoPerfil } from './EditorDeCampo'

export type EditorPerfilNativoProps = {
  perfil: Profile
  nombre: EditorCampoPerfil
  usuario: EditorCampoPerfil
  linea: EditorCampoPerfil
  ocupado: boolean
  guardando: boolean
  cambiado: boolean
  puedeGuardar: boolean
  error: string | null
  piso: number
  subiendoFoto: boolean
  subiendoFondo: boolean
  progresoFondo: number | null
  estilo: { fuente: string; marco: string; efecto: string; placa: string; marcoPerfil: string }
  onVolver: () => void
  onAbrir: (destino: Href) => void
  onGuardar: () => void
  onRestablecer: () => void
  onElegirFoto: () => void
  onElegirFondo: () => void
  onQuitar: (medio: 'foto' | 'fondo') => void
  onCambiar: (cambios: Partial<Profile>) => void
}

export type CampoPerfilNativoProps = {
  cual: CampoPerfil
  editor: EditorCampoPerfil
  piso: number
  onVolver: () => void
}

export type BusquedaPerfilNativoProps = {
  termino: string
  resultados: TrackResult[]
  cargando: boolean
  error: string | null
  piso: number
  onCambiar: (texto: string) => void
  onElegir: (track: TrackResult) => void
  onVolver: () => void
}
