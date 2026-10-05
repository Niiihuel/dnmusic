import AsyncStorage from '@react-native-async-storage/async-storage'
import { getSupabase } from '../lib/supabase'

/**
 * Las semillas: el gusto dicho **antes** de escuchar nada.
 *
 * Son la pieza que le falta a la radio: `plays` y `me_gusta` son señales
 * posteriores al uso, y una cuenta nueva no tiene ninguna — sus
 * recomendaciones nacían vacías. Lo que se elige acá en el onboarding entra
 * como ancla desde el minuto uno, con un peso chico que se va diluyendo solo
 * a medida que el historial real acumula horas. Ver
 * `services/recomendaciones`, donde se convierten en anclas.
 *
 * Se guardan dos clases:
 *
 * - `genero`: el `params` opaco de YouTube Music, para volver a abrir su
 *   página (la fila «Hecho para vos» de la portada y futuros rincones).
 * - `artista`: el id de canal, que es literalmente lo que una ancla necesita.
 */

export type Semilla = {
  kind: 'genero' | 'artista'
  /** El `params` del género o el id de canal del artista. */
  ref: string
  name: string
  artworkUrl: string
}

type Fila = {
  kind: 'genero' | 'artista'
  ref: string
  name: string
  artwork_url: string
}

/** Todas las tuyas, del más nuevo al más viejo. */
export async function listarSemillas(): Promise<Semilla[]> {
  const { data, error } = await getSupabase()
    .from('semillas')
    .select('kind, ref, name, artwork_url')
    .order('at', { ascending: false })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Fila[]).map((f) => ({
    kind: f.kind,
    ref: f.ref,
    name: f.name,
    artworkUrl: f.artwork_url,
  }))
}

/**
 * Planta semillas. Idempotente: volver a elegir lo mismo no duplica ni falla —
 * `ignoreDuplicates` termina en `on conflict do nothing`, igual que los
 * corazones. Se usa al terminar el onboarding y desde ajustes si algún día se
 * permite reelegir.
 */
export async function guardarSemillas(semillas: Semilla[]): Promise<void> {
  if (!semillas.length) return
  const { data } = await getSupabase().auth.getUser()
  const me = data.user?.id
  if (!me) throw new Error('Sesión requerida')
  const { error } = await getSupabase()
    .from('semillas')
    .upsert(
      semillas.map((s) => ({
        owner_id: me,
        kind: s.kind,
        ref: s.ref,
        name: s.name,
        artwork_url: s.artworkUrl,
      })),
      { onConflict: 'owner_id,kind,ref', ignoreDuplicates: true },
    )
  if (error) throw new Error(error.message)
}

/** Compatibilidad con onboarding pendiente guardado por versiones anteriores. */
const CLAVE_ONBOARDING = 'onboarding_pendiente'

export async function esOnboardingPendiente(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(CLAVE_ONBOARDING)) === '1'
  } catch {
    return false
  }
}

/** Terminó el paseo —lo eligió o lo saltó—: que no vuelva a aparecer. */
export async function completarOnboarding(): Promise<void> {
  await AsyncStorage.removeItem(CLAVE_ONBOARDING)
}
