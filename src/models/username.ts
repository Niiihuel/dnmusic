/**
 * Forma del nombre de usuario.
 *
 * La regla vive acá y en la base (`public.is_valid_username`). Está duplicada a
 * propósito: en el cliente para poder avisar mientras se escribe, y en la base
 * porque es lo que identifica a la cuenta y no puede depender de que el
 * formulario se haya portado bien. Si una cambia, la otra también.
 */
export const USERNAME_MIN = 3
export const USERNAME_MAX = 20
const SHAPE = /^[a-z0-9_]{3,20}$/

/** Lo que se escribe se acomoda solo: sin espacios, sin mayúsculas, sin @. */
export function normalizeUsername(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, USERNAME_MAX)
}

export function isValidUsername(username: string): boolean {
  return SHAPE.test(username)
}

/**
 * Por qué no sirve, en palabras. `null` si está bien.
 *
 * Devuelve el motivo y no un booleano porque "usuario inválido" a secas obliga
 * a adivinar qué falta.
 */
export function usernameProblem(username: string): string | null {
  if (username.length === 0) return 'Elegí un nombre de usuario.'
  if (username.length < USERNAME_MIN) return `Tiene que tener al menos ${USERNAME_MIN} caracteres.`
  if (username.length > USERNAME_MAX) return `No puede pasar de ${USERNAME_MAX} caracteres.`
  if (!SHAPE.test(username)) return 'Solo letras, números y guion bajo.'
  return null
}

/** Mínimo de la contraseña; lo impone Supabase (`minimum_password_length`). */
export const PASSWORD_MIN = 6

export function passwordProblem(password: string): string | null {
  if (password.length === 0) return 'Elegí una contraseña.'
  if (password.length < PASSWORD_MIN) return `Tiene que tener al menos ${PASSWORD_MIN} caracteres.`
  return null
}
