import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const requireDesktop = createRequire(new URL('../desktop/package.json', import.meta.url))
const { JSDOM } = requireDesktop('jsdom')

test('hover compartido: cruza huecos y descendientes sin reiniciar; salida reversible y coordenadas locales', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const dom = new JSDOM('<div data-dn-shared-group><button data-dn-shared-item>A<span>Icono</span></button><div class="gap"></div><button data-dn-shared-item>B</button><button data-dn-shared-item disabled>C</button></div>')
  const saved = new Map(['window', 'Element', 'getComputedStyle', 'ResizeObserver'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  Object.assign(globalThis, { window: dom.window, Element: dom.window.Element,
    getComputedStyle: () => ({ borderRadius: '16px' }), ResizeObserver: class { observe() {} disconnect() {} } })
  t.after(() => { dom.window.close(); for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] } })
  const exports = {}
  new Function('exports', ts.transpileModule(readFileSync('src/ui/sharedHover.web.ts', 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(exports)
  const root = dom.window.document.querySelector('[data-dn-shared-group]')
  const [a,b,c] = root.querySelectorAll('button')
  Object.defineProperties(root, { offsetWidth: {value: 200}, offsetHeight: {value: 200} })
  root.getBoundingClientRect = () => ({left:50,top:100,width:100,height:100})
  a.getBoundingClientRect = () => ({left:55,top:110,width:90,height:20})
  b.getBoundingClientRect = () => ({left:55,top:135,width:90,height:20})
  const changes = []
  const stop = exports.observeSharedHover(root, box => changes.push(box))
  const over = (node, pointerType='mouse') => { const e = new dom.window.Event('pointerover', {bubbles:true}); Object.defineProperty(e, 'pointerType', {value:pointerType}); node.dispatchEvent(e) }
  const leave = () => root.dispatchEvent(new dom.window.Event('pointerleave'))
  over(a)
  assert.deepEqual(changes.at(-1), {x:10,y:20,width:180,height:40,radius:'16px',first:true}, 'deshace el scale de entrada del menú')
  over(a.querySelector('span'))
  over(root.querySelector('.gap'))
  over(c)
  assert.equal(changes.length,1,'ni texto, hueco ni disabled reinician el fondo')
  over(b)
  assert.equal(changes.at(-1).y,70)
  assert.equal(changes.at(-1).first,false,'desliza desde la opción anterior')
  leave()
  assert.equal(changes.at(-1),null)
  t.mock.timers.tick(80)
  over(a)
  assert.equal(changes.at(-1).first,false,'reentrar durante el fade no teletransporta')
  leave()
  t.mock.timers.tick(200)
  over(b)
  assert.equal(changes.at(-1).first,true,'una entrada nueva nace en su destino')
  leave()
  const count=changes.length
  over(a,'touch')
  assert.equal(changes.length,count,'tocar no deja hover pegado')
  stop()
  over(a)
  assert.equal(changes.length,count,'desmontar elimina los listeners')
})

test('superficies: la fila incluye menú y padding; scroll y grupos anidados no duplican el fondo', t => {
  const dom = new JSDOM('<div data-dn-shared-group data-dn-shared-targets="surfaces"><div data-dn-surface="row"><button data-dn-hover="surface">Reproducir<span>Título</span></button><button class="menu">Opciones</button></div><div data-dn-shared-group><button data-dn-shared-item>Otra sección</button></div></div>')
  const saved = new Map(['window', 'Element', 'getComputedStyle', 'ResizeObserver'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]))
  Object.assign(globalThis, { window: dom.window, Element: dom.window.Element, getComputedStyle: () => ({borderRadius:'8px'}), ResizeObserver: class {observe(){} disconnect(){}} })
  t.after(() => { stop(); dom.window.close(); for (const [k,d] of saved) {if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k]} })
  const exports = {}
  new Function('exports', ts.transpileModule(readFileSync('src/ui/sharedHover.web.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(exports)
  const root = dom.window.document.querySelector('[data-dn-shared-targets]'), row=root.querySelector('[data-dn-surface]'), inner=row.querySelector('button'), menu=row.querySelector('.menu')
  Object.defineProperties(root,{offsetWidth:{value:800},offsetHeight:{value:400}})
  root.getBoundingClientRect=()=>({left:100,top:100,width:800,height:400})
  row.getBoundingClientRect=()=>({left:120,top:120,width:360,height:68})
  inner.getBoundingClientRect=()=>({left:126,top:126,width:304,height:56})
  const changes=[]
  const stop=exports.observeSharedHover(root, b=>changes.push(b))
  const over=n=>{const e=new dom.window.Event('pointerover',{bubbles:true});Object.defineProperty(e,'pointerType',{value:'mouse'});n.dispatchEvent(e)}
  over(inner.querySelector('span'))
  assert.deepEqual(changes.at(-1),{x:20,y:20,width:360,height:68,radius:'8px',first:true},'el título selecciona la fila completa, no el hitbox de 304px')
  over(menu)
  assert.equal(changes.length,1,'los tres puntos pertenecen al mismo fondo')
  root.dispatchEvent(new dom.window.Event('scroll'))
  assert.equal(changes.at(-1).immediate,true,'el fondo sigue al scroll sin un resorte atrasado')
  over(root.querySelector('[data-dn-shared-item]'))
  assert.equal(changes.at(-1),null,'entrar a otro grupo apaga el anterior')
})
