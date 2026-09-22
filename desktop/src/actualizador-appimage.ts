import { app } from 'electron'
import { AppImageUpdater } from 'electron-updater'
import type { InstallOptions } from 'electron-updater/out/BaseUpdater'
import { planReinicioLinux, programarReinicioLinux, type PlanReinicioLinux } from './reinicio-linux'

/** Conserva descarga/verificación/reemplazo del updater; cambia sólo el relanzamiento. */
export class ActualizadorAppImage extends AppImageUpdater {
  private reinicio: PlanReinicioLinux | null = null

  protected override doInstall(options: InstallOptions): boolean {
    // Resolver el lanzador ANTES de que electron-updater reemplace el archivo.
    this.reinicio = options.isForceRunAfter ? planReinicioLinux() : null
    return super.doInstall(options)
  }

  protected override spawnLog(destino: string): Promise<boolean> {
    if (!this.reinicio) throw new Error('No se preparó el reinicio de AppImage')
    if (this.reinicio.lanzador) {
      // Un hijo detached de appimage-run sigue dentro de bubblewrap y puede
      // morir con su padre. El gestor de usuario lo lanza fuera de ese entorno.
      programarReinicioLinux(this.reinicio, destino)
    } else {
      // Electron espera el cierre real y la liberación del single-instance lock.
      app.relaunch({ execPath: destino, args: [] })
    }
    // No hacer async: un error síncrono debe llegar a BaseUpdater.install y
    // evitar que quitAndInstall cierre la app después de un fallo del lanzador.
    return Promise.resolve(true)
  }
}
