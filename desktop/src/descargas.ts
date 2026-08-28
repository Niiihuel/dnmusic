import { dialog, type BrowserWindow } from 'electron'
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Bajar una lista de canciones **a una carpeta del disco**, desde el escritorio.
 *
 * El teléfono guarda las canciones para escucharlas sin señal *adentro* de la
 * app; en la compu tiene más sentido lo otro: tener los archivos, en una
 * carpeta, para hacer con ellos lo que uno quiera. Por eso esto no toca el
 * almacenamiento de la app —que en el bundle web ni existe— sino que escribe
 * `.m4a` sueltos donde la persona elija.
 *
 * El reparto es el mismo que el del resolutor: **el renderer arma la lista**
 * —con las URLs firmadas de Storage, que salen con su sesión— y **el proceso
 * principal baja los bytes y los escribe**, que es lo único que el sandbox no
 * lo deja hacer. Acá no hay llaves de Supabase: las URLs ya vienen firmadas.
 */

export type ArchivoPedido = { url: string; nombre: string }

export type ResultadoDescarga =
  | { cancelado: true }
  | { cancelado?: false; carpeta: string; guardados: number; fallidos: number }

/** Saca de un nombre lo que ningún sistema de archivos banca, sin dejarlo vacío. */
function nombreSeguro(nombre: string): string {
  const limpio = nombre
    .replace(/[/\\?%*:|"<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180)
  return limpio || 'cancion.m4a'
}

export async function descargarArchivos(
  ventana: BrowserWindow | null,
  opciones: { archivos: ArchivoPedido[]; carpetaSugerida?: string },
  alProgreso: (p: { hechos: number; total: number; nombre: string }) => void,
): Promise<ResultadoDescarga> {
  const total = opciones.archivos.length
  if (total === 0) return { cancelado: true }

  const elegido = ventana
    ? await dialog.showOpenDialog(ventana, {
        title: 'Elegí dónde guardar las canciones',
        properties: ['openDirectory', 'createDirectory'],
      })
    : await dialog.showOpenDialog({
        title: 'Elegí dónde guardar las canciones',
        properties: ['openDirectory', 'createDirectory'],
      })
  if (elegido.canceled || !elegido.filePaths[0]) return { cancelado: true }

  // Una subcarpeta con el nombre de la lista: no desparramar 40 archivos sueltos
  // sobre la carpeta que la persona eligió.
  const carpeta = opciones.carpetaSugerida
    ? join(elegido.filePaths[0], nombreSeguro(opciones.carpetaSugerida))
    : elegido.filePaths[0]
  await mkdir(carpeta, { recursive: true })

  let hechos = 0
  let guardados = 0
  let fallidos = 0
  for (const a of opciones.archivos) {
    try {
      const res = await fetch(a.url)
      if (!res.ok) throw new Error(String(res.status))
      const buf = Buffer.from(await res.arrayBuffer())
      await writeFile(join(carpeta, nombreSeguro(a.nombre)), buf)
      guardados++
    } catch {
      // Una que falla no voltea la tanda: se cuenta y se sigue con las demás.
      fallidos++
    }
    hechos++
    alProgreso({ hechos, total, nombre: a.nombre })
  }

  return { carpeta, guardados, fallidos }
}
