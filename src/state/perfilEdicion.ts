import { useEffect, useMemo } from 'react'
import type { Profile, saveMyProfile } from '../services/profile'
import { createStore, useStore } from './store'
import { useMyProfile } from './session'

export const CAMPOS_PERFIL = ['username', 'displayName', 'bio', 'avatarPath', 'bannerPath', 'avatarEncuadre', 'bannerEncuadre', 'visibility', 'compartirEscucha', 'fuente', 'tema', 'marco', 'efecto', 'placa', 'marcoPerfil'] as const
export type CambiosPerfil = Partial<Pick<Profile, typeof CAMPOS_PERFIL[number]>>
type Edicion = { ownerId: string | null; base: Profile | null; cambios: CambiosPerfil; ocupado: boolean }
const store = createStore<Edicion>({ ownerId: null, base: null, cambios: {}, ocupado: false })
const seleccionar = (s: Edicion) => s
export const usePerfilEdicion = () => useStore(store, seleccionar)
export const getPerfilEdicion = store.get

/** La sesión pertenece al editor; las hojas sólo modifican su borrador. */
export function iniciarPerfilEdicion(perfil: Profile) {
  if (store.get().ownerId === perfil.userId) return
  store.set({ ownerId: perfil.userId, base: perfil, cambios: {}, ocupado: false })
}
export function actualizarPerfilEdicion(patch: CambiosPerfil) {
  const actual = store.get()
  if (!actual.base || actual.ocupado) return
  const cambios = { ...actual.cambios }
  for (const campo of CAMPOS_PERFIL) {
    if (!(campo in patch)) continue
    const valor = patch[campo]
    if (JSON.stringify(valor ?? null) === JSON.stringify(actual.base[campo] ?? null)) delete cambios[campo]
    else Object.assign(cambios, { [campo]: valor })
  }
  store.set({ cambios })
}
export function ocuparPerfilEdicion(ocupado: boolean) { store.set({ ocupado }) }
export function restablecerPerfilEdicion() { if (!store.get().ocupado) store.set({ cambios: {} }) }
export function confirmarPerfilEdicion(perfil: Profile) {
  if (store.get().ownerId === perfil.userId) store.set({ base: perfil, cambios: {} })
}
export function terminarPerfilEdicion(ownerId: string) {
  if (store.get().ownerId === ownerId) store.set({ ownerId: null, base: null, cambios: {}, ocupado: false })
}
export function usePerfilBorrador() {
  const perfil = useMyProfile()
  const edicion = usePerfilEdicion()
  return useMemo(() => perfil && edicion.ownerId === perfil.userId
    ? { ...perfil, ...edicion.cambios } : perfil, [perfil, edicion.ownerId, edicion.cambios])
}
/** Permite abrir una herramienta por URL y continuar después en Editar perfil. */
export function useIniciarPerfilEdicion(habilitado = true) {
  const perfil = useMyProfile()
  useEffect(() => { if (perfil && habilitado) iniciarPerfilEdicion(perfil) }, [perfil, habilitado])
  return usePerfilBorrador()
}

/** Traduce sólo campos tocados al contrato de la RPC (null y cadena vacía son distintos). */
export function cambiosParaGuardar(perfil: Profile, cambios: CambiosPerfil): Parameters<typeof saveMyProfile>[0] {
  const patch: Parameters<typeof saveMyProfile>[0] = {}
  for (const campo of CAMPOS_PERFIL) {
    if (!(campo in cambios)) continue
    const valor = perfil[campo]
    const nullable = ['avatarEncuadre', 'bannerEncuadre', 'tema', 'fuente'].includes(campo)
    Object.assign(patch, { [campo]: nullable ? valor ?? null : typeof valor === 'string' ? valor.trim() : valor ?? '' })
  }
  return patch
}
