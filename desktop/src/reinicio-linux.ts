import { accessSync, constants, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { posix } from 'node:path'
import { spawnSync } from 'node:child_process'

export type PlanReinicioLinux = { lanzador: string | null; systemd: string | null }
const { isAbsolute, join } = posix

function ejecutable(ruta: string): boolean {
  try { accessSync(ruta, constants.X_OK); return statSync(ruta).isFile() } catch { return false }
}

export function planReinicioLinux(env = process.env, existe = ejecutable, nixos?: boolean): PlanReinicioLinux {
  if (nixos === undefined) {
    try { nixos = /^ID=nixos$/m.test(readFileSync('/etc/os-release', 'utf8')) } catch { nixos = false }
  }
  const envuelto = nixos || /\/appimage-run\/[a-f0-9]{64}(?:\/squashfs-root)?$/.test(env.APPDIR ?? '')
  if (!envuelto) return { lanzador: null, systemd: null }
  // No ejecutamos el texto de un .desktop ni entradas relativas de PATH.
  const directorios = [join(homedir(), '.nix-profile/bin'), '/run/current-system/sw/bin', ...(env.PATH ?? '').split(':')]
    .filter(p => isAbsolute(p) && !p.includes('\0'))
  const encontrar = (nombre: string) => directorios.map(p => join(p, nombre)).find(existe)
  const lanzador = encontrar('appimage-run')
  const systemd = encontrar('systemd-run')
  if (!lanzador || !systemd) throw new Error('No se puede preparar el reinicio seguro: falta appimage-run o systemd-run. Abrí la app desde su acceso directo después de actualizar.')
  return { lanzador, systemd }
}

/** Código fijo: PID, comando y archivo son argumentos, nunca código de shell. */
export const ESPERAR_Y_ABRIR = 'n=0; while kill -0 "$1" 2>/dev/null; do n=$((n+1)); [ "$n" -lt 300 ] || exit 75; sleep 0.1; done; exec "$2" "$3"'

export function argumentosReinicioLinux(plan: PlanReinicioLinux, destino: string, pid: number, env = process.env): string[] {
  if (!plan.lanzador || !plan.systemd || !isAbsolute(destino) || destino.includes('\0') || !Number.isSafeInteger(pid) || pid <= 0) {
    throw new Error('Destino de reinicio Linux inválido')
  }
  const args = ['--user', '--quiet', '--collect', '--service-type=exec', '--property=TimeoutStopSec=5s',
    '--property=UnsetEnvironment=APPDIR APPIMAGE APPIMAGE_EXIT_AFTER_INSTALL APPIMAGE_DEBUG_EXEC LD_LIBRARY_PATH LD_PRELOAD ELECTRON_RUN_AS_NODE']
  // El gestor de sesión no hereda APPDIR/LD_LIBRARY_PATH ni las variables del
  // instalador anterior. Sólo necesita la conexión al escritorio del usuario.
  for (const key of ['DISPLAY', 'WAYLAND_DISPLAY', 'XAUTHORITY', 'XDG_RUNTIME_DIR', 'XDG_CACHE_HOME', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'DBUS_SESSION_BUS_ADDRESS']) {
    if (env[key] && !env[key]!.includes('\0')) args.push(`--setenv=${key}=${env[key]}`)
  }
  args.push('--', '/bin/sh', '-c', ESPERAR_Y_ABRIR, 'dnmusic-reinicio', String(pid), plan.lanzador, destino)
  return args
}

/** Type=exec confirma que el supervisor arrancó antes de permitir el cierre. */
export function programarReinicioLinux(plan: PlanReinicioLinux, destino: string): void {
  const resultado = spawnSync(plan.systemd!, argumentosReinicioLinux(plan, destino, process.pid), {
    encoding: 'utf8', timeout: 10_000, shell: false,
  })
  if (resultado.error || resultado.status !== 0) {
    throw new Error(`No se pudo preparar el reinicio de la sesión: ${resultado.error?.message ?? resultado.stderr.trim()}`)
  }
}
