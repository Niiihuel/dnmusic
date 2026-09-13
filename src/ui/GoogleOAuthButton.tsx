import { AccionSocial } from './Social'
import { GoogleIcon } from './GoogleIcon'
import type { GoogleOAuthButtonProps } from './GoogleOAuthButton.types'

/** Botón compacto de PC/web; iOS lo reemplaza por la variante SwiftUI. */
export function GoogleOAuthButton({ label, onPress, busy = false, disabled = false }: GoogleOAuthButtonProps) {
  return <AccionSocial label={label} icono={<GoogleIcon />} onPress={onPress} disabled={disabled} busy={busy} expandida compacta />
}
