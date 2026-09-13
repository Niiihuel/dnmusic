import { useEffect, useRef, useState } from 'react'
import { AppState, Platform } from 'react-native'
import { usePathname } from 'expo-router'
import type { PlaylistTrack } from '../services/playlists'
import { getPlaybackState } from '../state/playback'
import { getSession, useUser } from '../state/session'
import { useDrawer, useEnChat, useKeyboardH, useTab } from '../state/shell'
import { compartirHistoria, historiaEnCurso } from './CompartirHistoria'

const OFERTA_MS = 8000
type Oferta = { track: PlaylistTrack; contexto: string }

/** iOS notifica después de capturar y no entrega un archivo: ofrecemos una tarjeta propia. */
export function useOfertaCaptura() {
  const ruta = usePathname()
  const tab = useTab()
  const user = useUser()
  const teclado = useKeyboardH()
  const drawer = useDrawer()
  const enChat = useEnChat()
  const [oferta, setOferta] = useState<Oferta | null>(null)
  const actual = useRef<Oferta | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reproductor = ruta === '/playing'
  const permitida = !!user && !teclado && !drawer && (reproductor || (ruta === '/' && !enChat && (tab === 'inicio' || tab === 'listas' || tab === 'buscar')))
  const contexto = permitida ? `${user!.id}:${ruta}:${reproductor ? 'playing' : tab}` : ''

  function cerrar() {
    actual.current = null
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setOferta(null)
  }

  useEffect(() => {
    if (Platform.OS === 'web' || !contexto) return
    let sub: { remove: () => void } | undefined
    const app = AppState.addEventListener('change', estado => { if (estado !== 'active') cerrar() })
    try {
      // Binarios anteriores pueden no incluir el módulo; no pedimos acceso a Fotos.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ScreenCapture = require('expo-screen-capture') as {
        addScreenshotListener: (fn: () => void) => { remove: () => void }
      }
      sub = ScreenCapture.addScreenshotListener(() => {
        const session = getSession()
        if (AppState.currentState !== 'active' || session.access?.status !== 'approved' || session.user?.id !== user?.id || historiaEnCurso()) return
        const state = getPlaybackState()
        const track = state.manual ?? (state.index >= 0 ? state.tracks[state.index] : null)
        if (!track) return
        // Congelada al gesto: cambiar de canción no cambia lo que el usuario va a compartir.
        const siguiente = { track: { ...track }, contexto }
        actual.current = siguiente
        setOferta(siguiente)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(cerrar, OFERTA_MS)
      })
    } catch {
      // Web, cliente antiguo o Android sin permiso: conserva el compartir manual.
    }
    return () => { sub?.remove(); app.remove(); cerrar() }
  }, [contexto, user?.id])

  function compartir() {
    const pendiente = actual.current
    const session = getSession()
    if (!pendiente || pendiente.contexto !== contexto || AppState.currentState !== 'active' || session.access?.status !== 'approved' || session.user?.id !== user?.id) {
      cerrar()
      return
    }
    cerrar()
    compartirHistoria(pendiente.track)
  }

  return { oferta: oferta?.contexto === contexto ? oferta.track : null, cerrar, compartir, reproductor }
}
