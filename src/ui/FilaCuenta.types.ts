import type { ContactResult } from '../services/contacts'

export type FilaCuentaProps = {
  cuenta: ContactResult
  /** La solicitud de esta cuenta está saliendo: el redondel muestra la espera. */
  busy?: boolean
  density?: 'regular' | 'compact'
  /** Tocar la fila: abrir la conversación, o el flujo de redactar si no hay. */
  onAbrir: () => void
  /** Avatar y nombre abren el perfil; la elección queda en una acción hermana. */
  onVerPerfil?: () => void
  rotuloAbrir?: 'Elegir' | 'Escribir'
  /** Sin estos dos, la fila no dibuja botones: es una fila de **elegir** — la
   *  usa así el redactar, donde la acción es el botón grande de abajo. */
  onSolicitar?: () => void
  onAceptar?: () => void
}
