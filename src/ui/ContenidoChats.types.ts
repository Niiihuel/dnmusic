export type FilaConversacionProps = {
  nombre: string
  nombreAvatar?: string
  avatarPath?: string | null
  detalle: string
  fecha?: string
  noLeidos: number
  selected: boolean
  compacto?: boolean
  onPress: () => void
}
export type FilaSolicitudChatProps = {
  nombre: string
  etiqueta: string
  avatarPath?: string | null
  compacto?: boolean
  onAceptar: () => void
  onRechazar: () => void
}
export type CabeceraChatsProps = { cantidad: number; techo: number; onNew: () => void }
