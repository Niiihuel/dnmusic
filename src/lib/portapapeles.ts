import { Platform } from 'react-native'
import { iniciarCopia } from '../state/copia'

/**
 * Copiar texto al portapapeles, de verdad y en todos lados.
 *
 * En el navegador —y sobre todo en la app de escritorio, que corre en un
 * contexto donde `navigator.clipboard` a veces no existe o está capado— el
 * camino moderno puede fallar sin avisar. Por eso, cuando no está, cae a un
 * textarea oculto con `execCommand('copy')`, que anda hasta en Electron sin
 * https. En el teléfono va por expo-clipboard.
 *
 * Devuelve si quedó copiado, para que quien llama decida qué decir.
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
    await Clipboard.setStringAsync(texto)
    return true
  } catch {
    return false
  }
}

async function copiarWeb(texto: string): Promise<boolean> {
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
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    const ok = document.execCommand('copy')
    return ok
  } catch {
    return false
  } finally {
    ta?.remove()
    if (foco instanceof HTMLElement && foco.isConnected) foco.focus({ preventScroll: true })
  }
}
