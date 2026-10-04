const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { runInNewContext } = require('node:vm')
const { posix } = require('node:path')
const { planReinicioLinux, argumentosReinicioLinux, ESPERAR_Y_ABRIR } = require('../dist/reinicio-linux')

test('Linux directo no necesita un wrapper; NixOS conserva appimage-run', () => {
  assert.deepEqual(planReinicioLinux({}, () => false, false), { lanzador: null, systemd: null })
  const existe = p => ['/run/current-system/sw/bin/appimage-run', '/run/current-system/sw/bin/systemd-run'].includes(p)
  const esperado = { lanzador: '/run/current-system/sw/bin/appimage-run', systemd: '/run/current-system/sw/bin/systemd-run' }
  assert.deepEqual(planReinicioLinux({}, existe, true), esperado)
  assert.deepEqual(planReinicioLinux({ APPDIR: `/cache/appimage-run/${'a'.repeat(64)}` }, existe, false), esperado)
  assert.deepEqual(planReinicioLinux({ APPDIR: `/cache/appimage-run/${'a'.repeat(64)}/squashfs-root` }, existe, false), esperado)
})

test('no usa PATH relativo ni continúa si falta el lanzador/supervisor', () => {
  const buscadas = []
  assert.throws(() => planReinicioLinux({ PATH: '.:bin:/trusted' }, p => { buscadas.push(p); return p === '/trusted/systemd-run' }, true), /falta appimage-run/)
  assert.ok(buscadas.every(p => posix.isAbsolute(p)))
  assert.throws(() => planReinicioLinux({}, () => false, true), /reinicio seguro/)
})

test('supervisor espera al PID con un plazo; rutas y metacaracteres nunca son código', () => {
  const destino = '/tmp/Mi música $(touch sorpresa).AppImage'
  const plan = { lanzador: '/apps con espacios/appimage-run', systemd: '/usr/bin/systemd-run' }
  const args = argumentosReinicioLinux(plan, destino, 4321, { DISPLAY: ':0', XDG_CACHE_HOME: '/custom/cache', LD_LIBRARY_PATH: '/old/lib', TOKEN: 'secret' })
  assert.ok(args.includes('--user'))
  assert.ok(args.includes('--service-type=exec'))
  assert.ok(args.includes('--collect'))
  assert.ok(args.includes('--setenv=DISPLAY=:0'))
  assert.ok(args.includes('--setenv=XDG_CACHE_HOME=/custom/cache'))
  assert.ok(!args.join(' ').includes('secret'))
  assert.ok(!args.join(' ').includes('/old/lib'))
  assert.deepEqual(args.slice(-7), ['/bin/sh', '-c', ESPERAR_Y_ABRIR, 'dnmusic-reinicio', '4321', plan.lanzador, destino])
  assert.match(ESPERAR_Y_ABRIR, /kill -0 "\$1"/)
  assert.match(ESPERAR_Y_ABRIR, /-lt 300/)
  assert.match(ESPERAR_Y_ABRIR, /exec "\$2" "\$3"/)
  for (const pid of [0, -1, NaN, 1.2]) assert.throws(() => argumentosReinicioLinux(plan, destino, pid), /inválido/)
  assert.throws(() => argumentosReinicioLinux(plan, 'relative.AppImage', 1), /inválido/)
})

function cargar(path, requireMock, extra = {}) {
  const exports = {}
  runInNewContext(readFileSync(path, 'utf8'), { exports, require: requireMock, ...extra })
  return exports
}

test('supervisor no usa shell de spawn y propaga fallo/timeout de systemd sin prometer reinicio', () => {
  const calls = []
  let respuesta = { status: 0, stderr: '' }
  const api = cargar(require.resolve('../dist/reinicio-linux'), id => id === 'node:child_process' ? { spawnSync: (...args) => { calls.push(args); return respuesta } } : require(id), { process: { pid: 123, env: {} } })
  const plan = { lanzador: '/bin/appimage-run', systemd: '/bin/systemd-run' }
  api.programarReinicioLinux(plan, '/tmp/app.AppImage')
  assert.equal(calls[0][0], plan.systemd)
  assert.equal(calls[0][2].shell, false)
  assert.equal(calls[0][2].timeout, 10000)
  respuesta = { status: 1, stderr: 'No user bus' }
  assert.throws(() => api.programarReinicioLinux(plan, '/tmp/app.AppImage'), /No user bus/)
  respuesta = { error: new Error('timeout') }
  assert.throws(() => api.programarReinicioLinux(plan, '/tmp/app.AppImage'), /timeout/)
})

/** Ejecuta doInstall de la dependencia instalada, con disco/procesos falsos. */
function entornoInstalador({ wrapped = true, missing = false, schedulerError = false } = {}) {
  const events = []
  const vendor = cargar(require.resolve('electron-updater/out/AppImageUpdater'), id => {
    if (id === './BaseUpdater') return { BaseUpdater: class {} }
    if (id === 'path') return posix
    if (id === 'fs') return { unlinkSync: p => events.push(['unlink', p]) }
    if (id === 'child_process') return { execFileSync: (cmd, args) => events.push([cmd, ...args]) }
    return {}
  }, { process: { env: { APPIMAGE: '/apps/dnmusic.AppImage' } } })
  const plan = wrapped ? { lanzador: '/bin/appimage-run', systemd: '/bin/systemd-run' } : { lanzador: null, systemd: null }
  const api = cargar(require.resolve('../dist/actualizador-appimage'), id => {
    if (id === 'electron') return { app: { relaunch: options => events.push(['relaunch', options.execPath, ...options.args]) } }
    if (id === 'electron-updater') return vendor
    if (id === './reinicio-linux') return {
      planReinicioLinux: () => { events.push(['prepare']); if (missing) throw new Error('missing launcher'); return plan },
      programarReinicioLinux: (_, path) => { if (schedulerError) throw new Error('scheduler unavailable'); events.push(['schedule', path]) },
    }
    throw Error(id)
  })
  const updater = new api.ActualizadorAppImage()
  updater.installerPath = '/cache/new.AppImage'
  return { events, run: () => updater.doInstall({ isSilent: true, isForceRunAfter: true }) }
}

test('updater reemplaza el archivo verificado y programa reapertura; no lo ejecuta directamente en Nix', () => {
  const f = entornoInstalador()
  assert.equal(f.run(), true)
  assert.deepEqual(f.events, [['prepare'], ['unlink', '/apps/dnmusic.AppImage'], ['mv', '-f', '/cache/new.AppImage', '/apps/dnmusic.AppImage'], ['schedule', '/apps/dnmusic.AppImage']])
})

test('AppImage normal usa relaunch de Electron para esperar la salida de la instancia', () => {
  const f = entornoInstalador({ wrapped: false })
  assert.equal(f.run(), true)
  assert.deepEqual(f.events.at(-1), ['relaunch', '/apps/dnmusic.AppImage'])
})

test('fallo de preparación no toca el binario; fallo del supervisor se propaga síncronamente al updater', () => {
  const f = entornoInstalador({ missing: true })
  assert.throws(f.run, /missing launcher/)
  assert.deepEqual(f.events, [['prepare']])
  const g = entornoInstalador({ schedulerError: true })
  assert.throws(g.run, /scheduler unavailable/)
  assert.ok(!g.events.some(e => e[0] === 'relaunch'))
})
