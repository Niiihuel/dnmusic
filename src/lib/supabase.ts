import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { Platform } from 'react-native'

/**
 * Cliente de Supabase.
 *
 * La anon key no es secreta: queda embebida en el bundle, como en cualquier
 * cliente de Supabase. Lo que protege los datos son las policies de RLS en
 * supabase/schema.sql, no ocultar esta clave.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && anonKey)

/**
 * La anon key, para los pedidos que no pasan por el cliente: una subida con
 * progreso va por `XMLHttpRequest` (storage-js no avisa cuánto subió) y el
 * gateway igual la pide en la cabecera `apikey`.
 */
export const SUPABASE_ANON_KEY = anonKey ?? ''

/**
 * Inicialización perezosa, a propósito: `createClient` con una URL vacía tira
 * en el momento del import y dejaba la app en blanco cuando falta el
 * .env.local, sin chance de renderizar el aviso de configuración.
 */
let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase no está configurado: falta .env.local con las EXPO_PUBLIC_SUPABASE_*')
  }
  if (!client) {
    client = createClient(url as string, anonKey as string, {
      auth: {
        // En web el default (localStorage) ya sirve; en nativo hay que darle
        // AsyncStorage o la sesión no sobrevive al cierre de la app.
        storage: Platform.OS === 'web' ? undefined : AsyncStorage,
        persistSession: true,
        autoRefreshToken: true,
        // Solo tiene sentido en web, donde el token puede volver en la URL.
        detectSessionInUrl: Platform.OS === 'web',
      },
    })
  }
  return client
}
