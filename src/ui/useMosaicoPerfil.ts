import { usePerfilEdicion } from '../state/perfilEdicion'
import { cargarMosaicoEdicion, cambioMosaicosEdicion, editarMosaicoEdicion, guardarMosaicosEdicion, mosaicoDeEdicion, restablecerMosaicosEdicion, useMosaicosEdicion } from '../state/mosaicoEdicion'
import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react'
import { listShowcases, removeShowcase, reorderShowcases, setShowcaseAncho, type Showcase } from '../services/showcases'
import { mensajeError } from '../lib/mensajeError'
import { mismoMosaico, persistirMosaico, reconciliarMosaico } from './mosaicoBorrador'

type Estado = { clave: string; base: Showcase[]; actual: Showcase[] }

/** Vive en la pantalla, fuera de las ramas móvil/escritorio y de las pestañas. */
function useMosaicoLocal(ownerId: string | null, parentId: string | null, recarga: number, onCambio: () => void) {
  const clave = JSON.stringify([ownerId, parentId])
  const [estado, setEstado] = useState<Estado | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const enVuelo = useRef(false)
  const incierto = useRef(false)
  const version = useRef(0)
  const ambito = useRef<string | null>(clave)
  useEffect(() => {
    ambito.current = clave
    return () => { ambito.current = null }
  }, [clave])
  const datos = estado?.clave === clave ? estado : null
  const cambiado = !!datos && !mismoMosaico(datos.base, datos.actual)

  useEffect(() => {
    if (!ownerId || enVuelo.current) return
    let vivo = true
    const turno = ++version.current
    listShowcases(ownerId, parentId).then(nuevas => {
      if (!vivo || enVuelo.current || turno !== version.current) return
      setEstado(prev => ({ clave, base: nuevas, actual: prev?.clave === clave
        ? reconciliarMosaico(prev.base, prev.actual, nuevas) : nuevas }))
      setError(null)
    }).catch(e => {
      if (vivo && !enVuelo.current && turno === version.current) setError(mensajeError(e))
    })
    return () => { vivo = false }
  }, [ownerId, parentId, recarga, clave])

  const editar = useCallback((accion: SetStateAction<Showcase[] | null>) => {
    if (enVuelo.current) return
    setEstado(prev => {
      if (!prev) return prev
      const actual = typeof accion === 'function' ? accion(prev.actual) : accion
      return actual ? { ...prev, actual } : prev
    })
  }, [])

  async function restablecer() {
    if (enVuelo.current || !ownerId) return
    if (!incierto.current && datos) {
      setEstado({ ...datos, actual: datos.base }); setError(null)
      return
    }
    // Después de un fallo parcial, Restablecer muestra lo que sí quedó en el servidor.
    enVuelo.current = true; setGuardando(true)
    version.current++
    try {
      const nuevas = await listShowcases(ownerId, parentId)
      if (ambito.current !== clave) return
      setEstado({ clave, base: nuevas, actual: nuevas }); setError(null); incierto.current = false
    } catch (e) {
      if (ambito.current === clave) setError(`No se pudo recuperar el mosaico guardado. ${mensajeError(e)}`)
    } finally { enVuelo.current = false; if (ambito.current === clave) setGuardando(false) }
  }

  async function guardar() {
    if (enVuelo.current || !datos || !ownerId) return
    enVuelo.current = true; setGuardando(true); setError(null)
    version.current++
    try {
      await persistirMosaico(datos.base, datos.actual, {
        ancho: setShowcaseAncho, ordenar: reorderShowcases, quitar: removeShowcase,
      })
      if (ambito.current !== clave) return
      setEstado({ ...datos, base: datos.actual }); incierto.current = false
      onCambio()
    } catch (e) {
      incierto.current = true
      let nuevas: Showcase[] | null = null
      try { nuevas = await listShowcases(ownerId, parentId) } catch { /* Se conserva el objetivo para reintentar. */ }
      if (ambito.current !== clave) return
      if (nuevas) setEstado({ clave, base: nuevas, actual: reconciliarMosaico(datos.base, datos.actual, nuevas, true) })
      setError(`No se pudieron guardar todos los cambios. Algunos pueden haberse aplicado; podés reintentar Guardar o recuperar lo guardado con Restablecer. ${mensajeError(e)}`)
    } finally { enVuelo.current = false; if (ambito.current === clave) setGuardando(false) }
  }

  return { vitrinas: datos?.actual ?? null, editar, cambiado, guardando, error, guardar, restablecer,
    descartar: () => { setEstado(prev => prev ? { ...prev, actual: prev.base } : prev); setError(null) } }
}

/** El borrador global sobrevive a volver al editor y a navegar entre subspaces. */
export function useMosaicoPerfil(ownerId: string | null, parentId: string | null, recarga: number, onCambio: () => void) {
  const edicion = usePerfilEdicion()
  const global = !!ownerId && edicion.ownerId === ownerId
  const local = useMosaicoLocal(global ? null : ownerId, parentId, recarga, onCambio)
  const mosaicos = useMosaicosEdicion(global ? ownerId : null)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  useEffect(() => {
    if (!global || !ownerId) return
    let vivo = true
    cargarMosaicoEdicion(ownerId, parentId).then(() => { if (vivo) setErrorCarga(null) })
      .catch(e => { if (vivo) setErrorCarga(mensajeError(e)) })
    return () => { vivo = false }
  }, [global, ownerId, parentId, recarga])
  if (!global || !ownerId) return { ...local, enEdicionGlobal: false }
  const ambito = mosaicoDeEdicion(mosaicos, parentId)
  const editar = (accion: SetStateAction<Showcase[] | null>) => {
    if (edicion.ocupado) return
    editarMosaicoEdicion(ownerId, parentId, actual => (typeof accion === 'function' ? accion(actual) : accion) ?? actual)
  }
  return { vitrinas: ambito?.actual ?? null, editar, cambiado: cambioMosaicosEdicion(mosaicos),
    guardando: edicion.ocupado || mosaicos.ocupado, error: errorCarga,
    guardar: () => guardarMosaicosEdicion(ownerId), restablecer: async () => restablecerMosaicosEdicion(ownerId),
    descartar: () => restablecerMosaicosEdicion(ownerId), enEdicionGlobal: true }
}
export type MosaicoPerfil = ReturnType<typeof useMosaicoPerfil>
