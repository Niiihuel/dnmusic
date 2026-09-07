import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

// Chrome propio sin cuenta, extensiones ni conexión con la sesión del usuario.
const chrome = process.env.CHROME_BIN ?? '/run/current-system/sw/bin/google-chrome'
test('CSS real en Chrome: hover/foco habilitados y scrolls más anchos sin flechas', { skip: !existsSync(chrome), timeout: 30000 }, async t => {
  const dir = mkdtempSync(join(tmpdir(), 'dn-controles-'))
  const proc = spawn(chrome, ['--headless=new', '--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4', '--no-sandbox', '--disable-gpu', '--disable-background-networking', '--disable-extensions', '--disable-sync', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${dir}`, 'about:blank'], { stdio: 'ignore', detached: process.platform !== 'win32' })
  let ws
  t.after(async () => {
    ws?.close()
    // Registrar antes de terminarlo; signalCode también indica que ya salió.
    const terminado = proc.exitCode !== null || proc.signalCode !== null
      ? Promise.resolve() : new Promise(resolve => proc.once('exit', resolve))
    try {
      // El grupo es exclusivo de este fixture, incluidos los procesos de Chrome.
      if (process.platform !== 'win32' && proc.pid) process.kill(-proc.pid, 'SIGTERM')
      else proc.kill()
    } catch (error) { if (error.code !== 'ESRCH') throw error }
    await terminado
    // Los auxiliares pueden terminar de vaciar Default después del proceso raíz.
    await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  })
  const portFile = join(dir, 'DevToolsActivePort')
  for (let i = 0; !existsSync(portFile) && i < 200; i++) await new Promise(r => setTimeout(r, 50))
  assert.ok(existsSync(portFile), 'Chrome aislado inicia')
  const port = readFileSync(portFile, 'utf8').split('\n')[0]
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  const page = pages.find(p => p.type === 'page' && p.url === 'about:blank')
  assert.ok(page, 'usa exclusivamente la página del proceso de prueba')
  ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
  let seq = 0
  const pending = new Map()
  ws.onmessage = e => {
    const message = JSON.parse(e.data)
    if (!message.id) return
    const p = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) p.reject(Error(message.error.message))
    else p.resolve(message.result)
  }
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })) })
  const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true }); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails)); return r.result.value }
  const css = readFileSync('global.css', 'utf8')
  const html = `<style>${css}</style><style>body{background:#121212;color:white}button,[role=button],a{display:inline-block;margin:12px;padding:12px;border:0;border-radius:12px;background-color:#181818;color:white} .viewport{height:80px;width:160px;overflow:auto}.content{height:500px}.hidden-native{scrollbar-width:none}</style>
    <button id="active">Icono</button><button id="disabled" disabled>Icono</button><div id="aria" role="button" aria-disabled="true">Icono</div><div aria-disabled="true"><button id="child">Icono</button></div>
    <button id="busy" aria-busy="true">Icono</button><button id="backdrop" data-dn-hover="none">Cerrar</button><button id="primary" data-dn-hover="inverse">Guardar</button><svg id="decorative" width="24" height="24"><circle r="10"/></svg><a id="link" href="#">Abrir</a><div id="role-link" role="link" tabindex="0">Enlace RN sin href</div>
    <div id="outer" role="button">Fila<button id="inner">Menú</button></div>
    <div id="native" class="viewport"><div class="content"></div></div><div id="hidden" class="viewport hidden-native"><div class="content"></div></div>
    <div class="dn-scroll-area"><div id="custom" class="dn-scrollbar"><div id="thumb" class="dn-scrollbar-thumb"></div></div></div>`
  await send('Page.enable')
  const { frameTree } = await send('Page.getFrameTree')
  await send('Page.setDocumentContent', { frameId: frameTree.frame.id, html })
  for (let i = 0; i < 100 && !await evaluate('!!document.getElementById("active")'); i++) await new Promise(r => setTimeout(r, 20))
  assert.equal(await evaluate('!!document.getElementById("active")'), true, await evaluate('document.documentElement.outerHTML.slice(-700)'))
  await send('DOM.enable'); await send('CSS.enable')
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'hover' }, { name: 'pointer', value: 'fine' }] })
  const { root } = await send('DOM.getDocument')
  const ids = {}
  for (const id of ['active', 'disabled', 'aria', 'child', 'busy', 'backdrop', 'primary', 'decorative', 'link', 'role-link', 'outer', 'inner']) ids[id] = (await send('DOM.querySelector', { nodeId: root.nodeId, selector: `#${id}` })).nodeId
  assert.equal(await evaluate('matchMedia("(hover: hover) and (pointer: fine)").matches'), true)
  const style = (id, prop, pseudo = '') => evaluate(`getComputedStyle(document.getElementById(${JSON.stringify(id)}), ${JSON.stringify(pseudo)})[${JSON.stringify(prop)}]`)
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
  assert.equal(await style('native', 'scrollbarColor'), 'auto')
  assert.equal(await style('native', 'width', '::-webkit-scrollbar'), '14px')
  assert.equal(await style('native', 'display', '::-webkit-scrollbar-button'), 'none')
  assert.equal(await style('native', 'height', '::-webkit-scrollbar-button'), '0px')
  assert.equal(await style('hidden', 'scrollbarWidth'), 'none', 'respeta indicadores ocultos por RN web')
  assert.equal(await style('custom', 'width'), '14px')
  assert.equal(await style('thumb', 'width'), '8px')
})
