import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

import { createRequire } from 'node:module'
import ts from 'typescript'
import React from 'react'
import { transform } from 'lightningcss'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
function botonesVidrioHTML() {
  const rn = require('react-native-web'), etiquetas = []
  function cargar(archivo, deps) {
    const exports = {}
    const { outputText } = ts.transpileModule(readFileSync(archivo, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
    } })
    new Function('exports', 'require', outputText)(exports, id => {
      assert.ok(id in deps, id)
      return deps[id]
    })
    return exports
  }
  const control = cargar('src/ui/estadoControl.ts', { 'react-native': rn })
  const { BotonVidrio } = cargar('src/ui/Glass.tsx', {
    'react/jsx-runtime': require('react/jsx-runtime'), 'react-native': rn,
    'react-native-reanimated': { default: {} },
    'expo-glass-effect': { isLiquidGlassAvailable: () => false },
    './estadoControl': control,
    './useConTooltip': { useConTooltip: label => { etiquetas.push(label); return { gestos: {} } } },
  })
  const markup = renderToStaticMarkup(React.createElement('div', null,
    ...['profile', 'list'].map((id, i) => React.createElement('div', { id: `glass-${id}`, key: id, style: { display: 'inline-block' } },
      React.createElement(BotonVidrio, { label: i ? 'Editar lista' : 'Editar perfil', onPress() {}, radius: 22,
        style: { height: 44, paddingHorizontal: 18 }, tint: i ? '#ffffff' : undefined },
      React.createElement(rn.Text, { style: { color: i ? '#121212' : '#ffffff' } }, i ? 'Editar lista' : 'Editar perfil')))),
    React.createElement('div', { id: 'glass-disabled' }, React.createElement(BotonVidrio, { label: 'No disponible', disabled: true, onPress() {}, style: { height: 44 } }, React.createElement(rn.Text, null, 'No disponible'))),
  ))
  assert.deepEqual(etiquetas, ['Editar perfil', 'Editar lista', undefined], 'conserva tooltip y lo omite disabled')
  return { markup, css: rn.StyleSheet.getSheet().textContent }
}

function expandiblesHTML() {
  const exports = {}
  const { outputText } = ts.transpileModule(readFileSync('src/ui/ExpandableButton.web.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  })
  new Function('exports', 'require', outputText)(exports, id => id === '../state/copia' ? { useEstadoCopia: () => 'idle' } : id === './ActionSwap' ? { ActionSwap: ({ children }) => children } : id === './icons' ? { IconCheck: () => null } : require(id))
  return renderToStaticMarkup(React.createElement('div', { id: 'expandibles', style: { display: 'flex', gap: 12 } },
    ...[
      { id: 'expand-toggle', label: 'Notificaciones' },
      { id: 'expand-action', label: 'Compartir el link', onPress() {} },
      { id: 'expand-disabled', label: 'No disponible', onPress() {}, disabled: true },
    ].map(({ id, ...props }) => React.createElement('div', { id, key: id },
      React.createElement(exports.ExpandableButton, { icon: '+', ...props }))),
  ))
}

// Chrome propio sin cuenta, extensiones ni conexión con la sesión del usuario.
const chrome = process.env.CHROME_BIN ?? '/run/current-system/sw/bin/google-chrome'
// One deadline for startup, HTTP, WebSocket and CDP; CI shares CPUs with other tests.
const CHROME_BUDGET_MS = 60_000
const SHUTDOWN_MS = 5_000
const STDERR_LIMIT = 16_384
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

test('CSS real en Chrome: hover/foco habilitados y scrolls más anchos sin flechas', {
  skip: !existsSync(chrome), timeout: CHROME_BUDGET_MS + SHUTDOWN_MS * 2 + 5_000,
}, async t => {
  const dir = mkdtempSync(join(tmpdir(), 'dn-controles-'))
  const started = performance.now(), deadline = started + CHROME_BUDGET_MS
  const proc = spawn(chrome, ['--headless=new', '--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4', '--no-sandbox', '--disable-gpu', '--disable-background-networking', '--disable-extensions', '--disable-sync', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${dir}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'], detached: process.platform !== 'win32' })
  let ws, stderr = '', spawnError, closed = false
  const pending = new Map()
  proc.stderr?.setEncoding('utf8')
  proc.stderr?.on('data', chunk => { stderr = (stderr + chunk).slice(-STDERR_LIMIT) })
  const processClosed = new Promise(resolve => proc.once('close', () => { closed = true; resolve(true) }))
  const processFailed = new Promise((_, reject) => {
    proc.once('error', error => { spawnError = error; reject(error) })
    proc.once('exit', (code, signal) => reject(Error(`Chrome salió antes de terminar (code=${code}, signal=${signal})`)))
  })
  // Cleanup intentionally terminates Chrome, even after all assertions pass.
  processFailed.catch(() => {})
  const diagnostic = stage => [
    `Chrome aislado: ${stage}; elapsed=${Math.round(performance.now() - started)}ms; budget=${CHROME_BUDGET_MS}ms`,
    `executable=${chrome}; pid=${proc.pid ?? 'sin pid'}; exitCode=${proc.exitCode}; signal=${proc.signalCode}; spawnError=${spawnError?.code ?? 'ninguno'}`,
    `stderr (últimos ${STDERR_LIMIT} caracteres):\n${stderr.trim() || '(vacío)'}`,
  ].join('\n')
  const remaining = () => Math.max(1, deadline - performance.now())
  const step = async (operation, stage) => {
    let timer
    try {
      return await Promise.race([
        operation, processFailed,
        new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Se agotó el plazo compartido')), remaining()) }),
      ])
    } catch (cause) {
      throw new Error(diagnostic(stage), { cause })
    } finally { clearTimeout(timer) }
  }
  const signalProcess = signal => {
    try {
      // This process group belongs only to the fixture, never the user's Chrome.
      if (process.platform !== 'win32' && proc.pid) process.kill(-proc.pid, signal)
      else if (proc.pid) proc.kill(signal)
    } catch (error) { if (error.code !== 'ESRCH') throw error }
  }
  const waitClosed = async () => {
    let timer
    try {
      return await Promise.race([processClosed, new Promise(resolve => { timer = setTimeout(() => resolve(false), SHUTDOWN_MS) })])
    } finally { clearTimeout(timer) }
  }
  t.after(async () => {
    ws?.close()
    for (const request of pending.values()) request.reject(Error('Fixture de Chrome finalizado'))
    pending.clear()
    signalProcess('SIGTERM')
    if (!closed && !await waitClosed()) {
      signalProcess('SIGKILL')
      assert.ok(await waitClosed(), diagnostic('no terminó durante la limpieza'))
    }
    // close also covers spawn errors, which do not necessarily emit exit.
    await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  })

  const portFile = join(dir, 'DevToolsActivePort')
  const port = await step((async () => {
    while (performance.now() < deadline) {
      if (spawnError) throw spawnError
      if (proc.exitCode !== null || proc.signalCode !== null) throw Error('Chrome terminó antes de publicar DevToolsActivePort')
      try {
        const value = readFileSync(portFile, 'utf8').split('\n')[0]
        // The file may be observed while Chrome is still writing it.
        if (/^\d+$/.test(value) && Number(value) > 0 && Number(value) <= 65535) return value
      } catch (error) { if (error.code !== 'ENOENT') throw error }
      await sleep(Math.min(50, remaining()))
    }
    throw Error('No se publicó DevToolsActivePort dentro del plazo')
  })(), 'esperando DevToolsActivePort')
  const response = await step(fetch(`http://127.0.0.1:${port}/json/list`, {
    signal: AbortSignal.timeout(Math.ceil(remaining())),
  }), 'consultando páginas de DevTools')
  assert.equal(response.ok, true, diagnostic(`DevTools HTTP ${response.status}`))
  const pages = await step(response.json(), 'leyendo páginas de DevTools')
  const page = pages.find(p => p.type === 'page' && p.url === 'about:blank')
  assert.ok(page, 'usa exclusivamente la página del proceso de prueba')
  ws = new WebSocket(page.webSocketDebuggerUrl)
  await step(new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; ws.onclose = () => reject(Error('DevTools cerró antes de conectar')) }), 'conectando WebSocket de DevTools')
  let seq = 0
  ws.onclose = () => {
    for (const request of pending.values()) request.reject(Error('WebSocket de DevTools cerrado'))
    pending.clear()
  }
  ws.onerror = () => {
    for (const request of pending.values()) request.reject(Error('Error del WebSocket de DevTools'))
    pending.clear()
  }
  ws.onmessage = e => {
    const message = JSON.parse(e.data)
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    if (message.error) request.reject(Error(message.error.message))
    else request.resolve(message.result)
  }
  const send = (method, params = {}) => {
    const id = ++seq
    const reply = new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      try { ws.send(JSON.stringify({ id, method, params })) } catch (error) { reject(error) }
    })
    return step(reply, method).finally(() => pending.delete(id))
  }
  const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true }); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails)); return r.result.value }
  const css = transform({ filename: 'global.css', code: Buffer.from(readFileSync('global.css', 'utf8')), minify: true }).code.toString()
  const vidrio = botonesVidrioHTML()
  const html = `<style>${vidrio.css}</style><style>${css}</style><style>body{background:#121212;color:white}#hitbox,#content-card{background:transparent;border:0}#active,#disabled,#aria,#child,#busy,#backdrop,#primary,#link,#outer,#inner{display:inline-block;margin:12px;padding:12px;border:0;border-radius:12px;background-color:#181818;color:white} .viewport{height:80px;width:160px;overflow:auto}.content{height:500px}.hidden-native{scrollbar-width:none}</style>
    <button id="active" data-dn-hover="normal">Icono</button><button id="disabled" data-dn-hover="normal" disabled>Icono</button><div id="aria" data-dn-hover="normal" role="button" aria-disabled="true">Icono</div><div aria-disabled="true"><button id="child" data-dn-hover="normal">Icono</button></div>
    <button id="busy" data-dn-hover="normal" aria-busy="true">Icono</button><button id="backdrop" data-dn-hover="none">Cerrar</button><button id="primary" data-dn-hover="inverse">Guardar</button><svg id="decorative" width="24" height="24"><circle r="10"/></svg><a id="link" data-dn-hover="normal" href="#">Abrir</a><div id="role-link" data-dn-hover="normal" role="link" tabindex="0">Enlace RN sin href</div>
    <div style="border-radius:8px;background:#303030"><button id="row" data-dn-hover="row">Reproducir canción</button></div>
    <div id="outer" role="button">Fila<button id="inner" data-dn-hover="normal">Menú</button></div>
    <div id="content-row" data-dn-surface="row" style="border-radius:12px"><button id="hitbox">Reproducir canción</button><button data-dn-hover="normal">Opciones</button></div>
    <button id="content-card" data-dn-surface="card"><div id="artwork" data-dn-artwork style="height:80px;width:80px;background:#333;opacity:.8;border-radius:12px"></div><span>Tu radio</span></button>
    <div id="native" class="viewport"><div class="content"></div></div><div id="hidden" class="viewport hidden-native"><div class="content"></div></div>
    <div id="tooltip-glass" data-dn-glass="regular" data-dn-tooltip role="tooltip">Ayuda</div>
    ${vidrio.markup}${expandiblesHTML()}<div class="dn-scroll-area"><div id="custom" class="dn-scrollbar"><div id="thumb" class="dn-scrollbar-thumb"></div></div></div>`
  await send('Page.enable')
  const { frameTree } = await send('Page.getFrameTree')
  await send('Page.setDocumentContent', { frameId: frameTree.frame.id, html })
  for (let i = 0; i < 100 && !await evaluate('!!document.getElementById("active")'); i++) await new Promise(r => setTimeout(r, 20))
  assert.equal(await evaluate('!!document.getElementById("active")'), true, await evaluate('document.documentElement.outerHTML.slice(-700)'))
  await send('DOM.enable'); await send('CSS.enable')
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'hover' }, { name: 'pointer', value: 'fine' }] })
  const { root } = await send('DOM.getDocument')
  const ids = {}
  for (const id of ['active', 'disabled', 'aria', 'child', 'busy', 'backdrop', 'primary', 'decorative', 'link', 'role-link', 'outer', 'inner', 'row', 'content-row', 'hitbox', 'content-card', 'artwork']) ids[id] = (await send('DOM.querySelector', { nodeId: root.nodeId, selector: `#${id}` })).nodeId
  assert.equal(await evaluate('matchMedia("(hover: hover) and (pointer: fine)").matches'), true)
  const style = (id, prop, pseudo = '') => evaluate(`getComputedStyle(document.getElementById(${JSON.stringify(id)}), ${JSON.stringify(pseudo)})[${JSON.stringify(prop)}]`)
  // Headless Chrome may defer its first animation frame until styles are read.
  // Poll the computed result instead of assuming a fixed sleep advanced a transition.
  const settledStyle = async (id, prop, accepts) => {
    const until = Math.min(deadline, performance.now() + 3000)
    let value
    do {
      value = await style(id, prop)
      if (accepts(value)) return value
      await sleep(30)
    } while (performance.now() < until)
    return value
  }
  for (const id of ['active', 'primary', 'link', 'role-link']) {
    const before = await evaluate(`JSON.stringify(document.getElementById('${id}').getBoundingClientRect())`)
    await send('CSS.forcePseudoState', { nodeId: ids[id], forcedPseudoClasses: ['hover'] })
    assert.match(await style(id, 'backgroundImage'), /linear-gradient/, id)
    assert.equal(await evaluate(`JSON.stringify(document.getElementById('${id}').getBoundingClientRect())`), before)
    await send('CSS.forcePseudoState', { nodeId: ids[id], forcedPseudoClasses: ['focus', 'focus-visible'] })
    assert.equal(await style(id, 'outlineWidth'), '2px', id)
    await send('CSS.forcePseudoState', { nodeId: ids[id], forcedPseudoClasses: [] })
  }
  for (const id of ['disabled', 'aria', 'child', 'busy', 'backdrop', 'decorative']) {
    await send('CSS.forcePseudoState', { nodeId: ids[id], forcedPseudoClasses: ['hover'] })
    assert.equal(await style(id, 'backgroundImage'), 'none', id)
  }
  await send('CSS.forcePseudoState', { nodeId: ids.outer, forcedPseudoClasses: ['hover'] })
  await send('CSS.forcePseudoState', { nodeId: ids.inner, forcedPseudoClasses: ['hover'] })
  assert.equal(await style('outer', 'backgroundImage'), 'none', 'la fila no duplica hover del botón interno')
  assert.match(await style('inner', 'backgroundImage'), /linear-gradient/)
  await send('CSS.forcePseudoState', { nodeId: ids.row, forcedPseudoClasses: ['hover'] })
  assert.equal(await style('row', 'backgroundImage'), 'none', 'la reproducción no pinta otro rectángulo dentro de la fila')
  // La fila contiene reproducción y acciones: no son dos cajas de hover.
  await send('CSS.forcePseudoState', { nodeId: ids['content-row'], forcedPseudoClasses: ['hover'] })
  await send('CSS.forcePseudoState', { nodeId: ids.hitbox, forcedPseudoClasses: ['hover'] })
  assert.notEqual(await settledStyle('content-row', 'backgroundColor', value => value !== 'rgba(0, 0, 0, 0)'), 'rgba(0, 0, 0, 0)')
  assert.equal(await style('hitbox', 'backgroundImage'), 'none')
  assert.equal(await style('hitbox', 'backgroundColor'), 'rgba(0, 0, 0, 0)')
  const cardRect = await evaluate('JSON.stringify(document.getElementById("content-card").getBoundingClientRect())')
  await send('CSS.forcePseudoState', { nodeId: ids['content-card'], forcedPseudoClasses: ['hover'] })
  assert.equal(await style('content-card', 'backgroundImage'), 'none')
  assert.equal(await style('artwork', 'opacity'), '1')
  assert.equal(await settledStyle('artwork', 'filter', value => value === 'brightness(1.1)'), 'brightness(1.1)')
  assert.equal(await evaluate('JSON.stringify(document.getElementById("content-card").getBoundingClientRect())'), cardRect)
  await send('CSS.forcePseudoState', { nodeId: ids.row, forcedPseudoClasses: ['focus', 'focus-visible'] })
  assert.equal(await style('row', 'outlineWidth'), '2px', 'reproducción conserva foco accesible')
  for (const id of ['glass-profile', 'glass-list']) {
    const selector = `#${id} [data-dn-hover='glass']`
    const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector })
    assert.ok(nodeId, 'usa el BotonVidrio real, renderizado por RN web')
    const read = property => evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(selector)}))[${JSON.stringify(property)}]`)
    const surface = property => evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(selector)}).parentElement)[${JSON.stringify(property)}]`)
    const medidas = () => evaluate(`(() => { const b = document.querySelector(${JSON.stringify(selector)}); return [b.getBoundingClientRect().width, b.parentElement.getBoundingClientRect().width] })()`)
    const antes = await medidas()
    assert.ok(antes[1] > antes[0], 'reproduce el padding exterior de la captura')
    await send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['hover'] })
    assert.equal(await read('backgroundImage'), 'none', 'no pinta rectángulo interior en perfil/listas')
    assert.equal(await surface('backgroundImage'), 'none', 'no agrega otra capa de hover')
    assert.deepEqual(await medidas(), antes)
    await send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['focus', 'focus-visible'] })
    assert.equal(await read('outlineStyle'), 'none', 'no duplica el foco dentro del botón')
    assert.equal(await surface('outlineWidth'), '2px', 'el foco sigue visible en la superficie completa')
    assert.equal(await surface('borderRadius'), '999px', 'los botones de vidrio conservan el contorno de cápsula')
    await send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] })
    assert.equal(await surface('outlineStyle'), 'none')
  }
  const { nodeId: disabledGlass } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: '#glass-disabled [data-dn-hover]' })
  await send('CSS.forcePseudoState', { nodeId: disabledGlass, forcedPseudoClasses: ['hover', 'focus', 'focus-visible'] })
  assert.equal(await evaluate("getComputedStyle(document.querySelector('#glass-disabled [data-dn-hover]')).backgroundImage"), 'none')
  assert.equal(await evaluate("getComputedStyle(document.querySelector('#glass-disabled [data-dn-hover]').parentElement).outlineStyle"), 'none')
  // El ancho debe crecer con texto real y volver a 44px, sin escalar la etiqueta.
  await send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 850, deviceScaleFactor: 1, mobile: false })
  assert.match(await evaluate("getComputedStyle(document.getElementById('tooltip-glass')).backdropFilter"), /blur\(22px\)/, 'el CSS procesado conserva el desenfoque del tooltip en Chrome')
  assert.equal(await evaluate("getComputedStyle(document.getElementById('active')).boxShadow"), 'none', 'los controles simples no reciben aro')

  const width = id => evaluate(`document.querySelector('#${id} button').getBoundingClientRect().width`)
  const settle = () => new Promise(resolve => setTimeout(resolve, 360))
  assert.equal(await width('expand-toggle'), 44)
  assert.equal(await width('expand-action'), 44)
  const action = (await send('DOM.querySelector', { nodeId: root.nodeId, selector: '#expand-action button' })).nodeId
  await send('CSS.forcePseudoState', { nodeId: action, forcedPseudoClasses: ['hover'] })
  await settle()
  assert.ok(await width('expand-action') > 120, 'hover revela la acción completa')
  await send('CSS.forcePseudoState', { nodeId: action, forcedPseudoClasses: ['focus', 'focus-visible'] })
  await settle()
  assert.ok(await width('expand-action') > 120, 'teclado también revela la acción')
  assert.equal(await evaluate("getComputedStyle(document.querySelector('#expand-action button')).outlineWidth"), '2px')
  const disabled = (await send('DOM.querySelector', { nodeId: root.nodeId, selector: '#expand-disabled button' })).nodeId
  await send('CSS.forcePseudoState', { nodeId: disabled, forcedPseudoClasses: ['hover'] })
  await settle()
  assert.equal(await width('expand-disabled'), 44, 'disabled no expande')
  await evaluate("document.querySelector('#expand-toggle button').dataset.expanded = 'true'")
  await settle()
  assert.ok(await width('expand-toggle') > 120, 'estado expandido conserva ancho intrínseco')
  await send('CSS.forcePseudoState', { nodeId: action, forcedPseudoClasses: [] })
  await settle()
  assert.equal(await width('expand-action'), 44, 'vuelve al círculo sin hueco residual')
  assert.match(await evaluate("getComputedStyle(document.querySelector('#expand-action button')).backdropFilter"), /blur\(22px\)/)
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'prefers-reduced-transparency', value: 'reduce' }] })
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.dn-expandable-label')).transitionDuration"), '0s')
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.dn-expandable')).backdropFilter"), 'none')
  await send('Emulation.setEmulatedMedia', { features: [] })
  assert.equal(await style('native', 'scrollbarColor'), 'auto')
  assert.equal(await style('native', 'width', '::-webkit-scrollbar'), '14px')
  assert.equal(await style('native', 'display', '::-webkit-scrollbar-button'), 'none')
  assert.equal(await style('native', 'height', '::-webkit-scrollbar-button'), '0px')
  assert.equal(await style('hidden', 'scrollbarWidth'), 'none', 'respeta indicadores ocultos por RN web')
  assert.equal(await style('custom', 'width'), '14px')
  assert.equal(await style('thumb', 'width'), '8px')
})
