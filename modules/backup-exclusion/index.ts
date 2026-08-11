import { requireOptionalNativeModule } from 'expo'

/**
 * Sacar una carpeta de la copia de seguridad de iCloud.
 *
 * Es **opcional** por lo mismo que `remote-commands`: en web no existe, y
 * tampoco en un development client compilado antes de que este módulo existiera.
 * Con `requireNativeModule` la app reventaría al arrancar en los dos casos.
 *
 * Que falte no rompe las descargas: los archivos se guardan igual y suenan
 * igual. Lo único que pasa es que entran en la copia de iCloud, que es un
 * problema de la cuenta de quien usa la app y no de la app. Ver el Swift.
 */
type BackupExclusion = {
  /** `true` si quedó marcada. */
  excluir: (uri: string) => boolean
}

const modulo = requireOptionalNativeModule<BackupExclusion>('BackupExclusion')

/** Marca la carpeta. Devuelve `false` si el módulo no está en el binario. */
export function excluirDeCopias(uri: string): boolean {
  try {
    return modulo?.excluir(uri) ?? false
  } catch {
    return false
  }
}
