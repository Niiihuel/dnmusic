import { requireOptionalNativeModule } from 'expo'

/**
 * Los botones de anterior y siguiente de la pantalla bloqueada.
 *
 * Es **opcional** a propósito: `requireOptionalNativeModule` devuelve `null`
 * cuando el módulo no está en el binario, y eso pasa en dos casos que son
 * normales — la web, y cualquier development client compilado antes de que este
 * módulo existiera. Con `requireNativeModule` la app reventaría al arrancar en
 * los dos.
 */
type RemoteCommandsModule = {
  /** Registra los comandos y empieza a avisar. */
  start: () => void
  /** Los suelta. El centro de comandos es de todo el proceso. */
  stop: () => void
  addListener: (
    event: 'onNext' | 'onPrevious',
    listener: () => void,
  ) => { remove: () => void }
}

export const RemoteCommands = requireOptionalNativeModule<RemoteCommandsModule>('RemoteCommands')

/** Si el binario trae el módulo. Sin esto, los botones no existen. */
export const hayComandosRemotos = RemoteCommands !== null
