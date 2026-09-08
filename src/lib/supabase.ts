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

function storageAuthEscritorio(): StorageAuth | undefined {
  if (Platform.OS !== 'web') return undefined
  const puente = (globalThis as { dnmusicEscritorio?: { authStorage?: StorageAuth } }).dnmusicEscritorio
    ?.authStorage
  if (!puente) return undefined

  const local = () => {
    try { return globalThis.localStorage } catch { return undefined }
  }

  return {
    async getItem(clave) {
      try {
        const nativo = await puente.getItem(clave)
        if (nativo !== null) return nativo
      } catch {
        // Una versión vieja o un almacén dañado todavía puede migrar desde Chromium.
      }
      try {
        const anterior = local()?.getItem(clave) ?? null
        if (anterior !== null) {
          try {
            await puente.setItem(clave, anterior)
            local()?.removeItem(clave)
          } catch {
            // Se conserva la copia anterior si el proceso principal no pudo escribir.
          }
        }
        return anterior
      } catch {
        return null
      }
    },
    async setItem(clave, valor) {
      try {
        await puente.setItem(clave, valor)
        try { local()?.removeItem(clave) } catch {}
        return
      } catch (errorNativo) {
        try {
          const respaldo = local()
          if (!respaldo) throw errorNativo
          respaldo.setItem(clave, valor)
          return
        } catch {
          throw errorNativo
        }
      }
    },
    async removeItem(clave) {
      let errorNativo: unknown = null
      try { await puente.removeItem(clave) } catch (error) { errorNativo = error }
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
        // El callback validado intercambia sólo el código de una transacción iniciada acá.
        detectSessionInUrl: false,
      },
    })
  }
  return client
}
