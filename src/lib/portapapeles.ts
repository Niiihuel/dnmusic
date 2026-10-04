import { Platform } from 'react-native'
import { iniciarCopia } from '../state/copia'

/**
 * Escritorio usa IPC nativo porque Chromium puede bloquear app://.
 * Web usa clipboard con respaldo DOM; iOS y Android usan expo-clipboard.
 */
export async function copiarAlPortapapeles(texto: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    const terminar = iniciarCopia(texto)
    const ok = await copiarWeb(texto)
    terminar(ok)
    return ok
  }
  try {
    // Perezoso y a prueba de fallos: si el binario no trae el módulo, no se
    // rompe nada —quien llama igual ofrece la hoja de compartir—.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Clipboard = require('expo-clipboard') as {
      setStringAsync: (t: string) => Promise<boolean>
    }
    return await Clipboard.setStringAsync(texto)
  } catch {
    return false
  }
}

async function copiarWeb(texto: string): Promise<boolean> {
  const escritorio = (globalThis as {
    dnmusicEscritorio?: { portapapeles?: { copiar: (texto: string) => Promise<boolean> } }
  }).dnmusicEscritorio
  if (escritorio?.portapapeles?.copiar) {
    try {
      return await escritorio.portapapeles.copiar(texto)
    } catch {
      return false
    }
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto)
      return true
    }
  } catch {
    // Sin permiso o contexto no seguro: sigue al plan B.
  }
  if (typeof document === 'undefined') return false
  const foco = document.activeElement
  let ta: HTMLTextAreaElement | undefined
  try {
    ta = document.createElement('textarea')
    ta.value = texto
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '0'
    ta.style.left = '0'
    ta.style.opacity = '0'
    ta.style.fontSize = '16px'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    ta.setSelectionRange(0, texto.length)
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    ta?.remove()
    if (foco instanceof HTMLElement && foco.isConnected) foco.focus({ preventScroll: true })
  }
}
