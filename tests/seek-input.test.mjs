import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const requireDesktop = createRequire(new URL('../desktop/package.json', import.meta.url))
const { JSDOM } = requireDesktop('jsdom')
function setup(t, envivo = false) {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const dom = new JSDOM('<input type="range" min="0" max="1" step="0.001">')
  const frames = new Map(); let id = 0
  const originals = new Map(['requestAnimationFrame', 'cancelAnimationFrame'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]))
  globalThis.requestAnimationFrame = fn => { frames.set(++id, fn); return id }
  globalThis.cancelAnimationFrame = id => frames.delete(id)
  t.after(() => { dom.window.close(); for (const [k,d] of originals) { if (d) Object.defineProperty(globalThis,k,d); else delete globalThis[k] } })
  const exports = {}
  new Function('exports', ts.transpileModule(readFileSync('src/ui/seekInput.web.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(exports)
  const input = dom.window.document.querySelector('input'), calls = [], previews = []
  const state = { progress: 0.2, envivo, onSeek: v => calls.push(v), describe: v => `${Math.round(v*100)}%`, preview: v => previews.push(v) }
  const controller = exports.observeSeekInput(input,state)
  t.after(() => controller.dispose())
  const dispatch = name => input.dispatchEvent(new dom.window.Event(name))
  const move = value => { input.value = String(value); dispatch('input') }
  const frame = () => { const batch = [...frames.values()]; frames.clear(); batch.forEach(fn => fn()) }
  return { dom,input,calls,state,controller,dispatch,move,frame,frames,previews }
}

test('seek: previsualiza sin saltar el audio, confirma una vez y rechaza ticks antiguos', t => {
  const { input,calls,state,controller,dispatch,move } = setup(t)
  dispatch('pointerdown')
  for (let i=21;i<=80;i++) move(i/100)
  assert.deepEqual(calls,[])
  assert.equal(input.style.getPropertyValue('--dn-seek-progress'),'80%')
  controller.sync({...state,progress:0.21})
  controller.follow(0.22)
  assert.equal(input.value,'0.8','el motor no pisa el arrastre')
  dispatch('change'); dispatch('pointerup')
  assert.deepEqual(calls,[0.8],'change + pointerup no duplican el seek')
  controller.sync({...state,progress:0.22}); controller.follow(0.23)
  assert.equal(input.value,'0.8','no retrocede mientras el motor confirma')
  controller.sync({...state,progress:0.8}); controller.follow(0.805)
  assert.equal(input.value,'0.805','recupera el seguimiento fino tras confirmar')
})

test('volumen: agrupa una ráfaga por cuadro y entrega el valor final al soltar', t => {
  const { calls,dispatch,move,frame,frames } = setup(t,true)
  dispatch('pointerdown'); move(0.3); move(0.4); move(0.5)
  assert.equal(frames.size,1); assert.deepEqual(calls,[])
  frame(); assert.deepEqual(calls,[0.5])
  move(0.6); move(0.7); dispatch('pointerup'); dispatch('change'); frame()
  assert.deepEqual(calls,[0.5,0.7]); assert.equal(frames.size,0)
})

test('cancelar no busca; teclado respeta límites; desmontar limpia trabajo pendiente', t => {
  const { dom,input,calls,dispatch,move,controller,frames } = setup(t)
  dispatch('pointerdown'); move(0.8); dispatch('pointercancel')
  assert.equal(input.value,'0.2'); assert.deepEqual(calls,[])
  for (const key of ['End','ArrowRight','Home','ArrowLeft','ArrowUp']) input.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key,cancelable:true}))
  assert.deepEqual(calls,[1,0,0.05])
  t.mock.timers.tick(1000)
  assert.equal(input.value,'0.2','si falla el seek, recupera la posición del motor')
  controller.dispose(); move(0.7); dispatch('change')
  assert.deepEqual(calls,[1,0,0.05]); assert.equal(frames.size,0)
})
