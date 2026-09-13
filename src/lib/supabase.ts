import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { Platform } from 'react-native'
import { getRandomValues } from 'expo-crypto'

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

type StorageAuth = {
  getItem: (clave: string) => Promise<string | null>
  setItem: (clave: string, valor: string) => Promise<void>
  removeItem: (clave: string) => Promise<void>
}

/**
 * Los dos lugares donde puede estar la sesión en el escritorio, y cuál gana.
 *
 * El lugar bueno es el archivo protegido del proceso principal
 * (`desktop/src/auth-storage.ts`). El de Chromium queda como **copia de
 * respaldo, y solo se escribe cuando el otro no pudo guardar** — en Windows
 * pasa: el antivirus o OneDrive agarran el archivo de `%APPDATA%` justo cuando
 * se lo reemplaza.
 *
 * De esa regla sale la precedencia, que antes estaba al revés y era el bug:
 * **si hay copia de respaldo, esa es la sesión más nueva**, porque su sola
 * existencia significa que el archivo se quedó atrás. Leyendo primero el
 * archivo se servía una sesión vieja; Supabase la encontraba vencida, la
 * intentaba renovar con un refresh token ya gastado, recibía un 400 y la
 * borraba por muerta. Entrabas, y a los segundos estabas de vuelta en el login.
 *
 * Al leer se aprovecha para reintentar el guardado protegido: cuando sale bien,
 * la copia desaparece y vuelve a haber un solo lugar. Se intenta una vez por
 * clave y por corrida, porque `getSession()` se llama en cada pedido y esto no
 * puede convertirse en una escritura por lectura.
 */
function storageAuthEscritorio(): StorageAuth | undefined {
  if (Platform.OS !== 'web') return undefined
  const puente = (globalThis as { dnmusicEscritorio?: { authStorage?: StorageAuth } }).dnmusicEscritorio
    ?.authStorage
  if (!puente) return undefined

  const local = () => {
    try { return globalThis.localStorage } catch { return undefined }
  }
  const leerRespaldo = (clave: string) => {
    try { return local()?.getItem(clave) ?? null } catch { return null }
  }
  const borrarRespaldo = (clave: string) => {
    try { local()?.removeItem(clave) } catch {}
  }
  const rescatadas = new Set<string>()

  return {
    async getItem(clave) {
      const respaldo = leerRespaldo(clave)
      if (respaldo !== null) {
        if (!rescatadas.has(clave)) {
          rescatadas.add(clave)
          try {
            await puente.setItem(clave, respaldo)
            borrarRespaldo(clave)
          } catch {
            // Sigue vigente la copia: el archivo protegido todavía no acepta escrituras.
          }
        }
        return respaldo
      }
      try {
        return await puente.getItem(clave)
      } catch {
        return null
      }
    },
    async setItem(clave, valor) {
      try {
        await puente.setItem(clave, valor)
        borrarRespaldo(clave)
        rescatadas.delete(clave)
        return
      } catch (errorNativo) {
        try {
          const respaldo = local()
          if (!respaldo) throw errorNativo
          respaldo.setItem(clave, valor)
          /* Guardada de nuevo la copia, vuelve a tener sentido reintentar el
             rescate la próxima vez que alguien la lea. */
          rescatadas.delete(clave)
          return
        } catch {
          throw errorNativo
        }
      }
    },
    async removeItem(clave) {
      let errorNativo: unknown = null
      try { await puente.removeItem(clave) } catch (error) { errorNativo = error }
      rescatadas.delete(clave)
      try {
        const respaldo = local()
        if (!respaldo && errorNativo) throw errorNativo
        respaldo?.removeItem(clave)
      } catch {
        if (errorNativo) throw errorNativo
      }
    },
  }
}

export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase no está configurado: falta .env.local con las EXPO_PUBLIC_SUPABASE_*')
  }
  if (!client) {
    // Hermes no siempre trae crypto. Proveer sólo azar nativo: no simular un SubtleCrypto incompleto.
    if (Platform.OS !== 'web' && !globalThis.crypto?.getRandomValues) {
      const cryptoNativo = globalThis.crypto ?? ({} as Crypto)
      Object.defineProperty(cryptoNativo, 'getRandomValues', { value: getRandomValues, configurable: true })
      if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: cryptoNativo, configurable: true })
    }
    client = createClient(url as string, anonKey as string, {
      auth: {
        // Electron persiste la sesión en un archivo cifrado del perfil de la
        // app y migra una sesión anterior de localStorage. El navegador conserva
        // su almacenamiento normal; iOS y Android usan AsyncStorage.
        storage: storageAuthEscritorio() ?? (Platform.OS === 'web' ? undefined : AsyncStorage),
        persistSession: true,
        autoRefreshToken: true,
        flowType: 'pkce',
        // La validación del callback exige el flowId que selecciona su verificador.
        // auth-js lo devuelve, pero sólo lo transporta en la URL con esta opción.
        experimental: { appendPkceFlowIdToRedirects: true },
        // El callback validado intercambia sólo el código de una transacción iniciada acá.
        detectSessionInUrl: false,
      },
    })
  }
  return client
}
