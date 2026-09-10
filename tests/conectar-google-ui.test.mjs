import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const tick = () => new Promise(r => setImmediate(r))
function montar(user, connect) {
  let cursor = 0
  const state = [], calls = []
  const jsx = (type, props) => ({ type, props })
  const deps = {
    react: { useEffect() {}, useRef(v) { const i = cursor++; state[i] ??= { current: v }; return state[i] }, useState(v) { const i = cursor++; if (!(i in state)) state[i] = typeof v === 'function' ? v() : v; return [state[i], x => { state[i] = x }] } },
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': { Text: 'Text', View: 'View' },
    '../services/auth': { conectarGoogle: async id => { calls.push(id); return connect ? connect() : null }, cancelarGoogle: async () => calls.push('cancel') },
    '../lib/supabase': { getSupabase: () => ({}) }, './GoogleIcon': { GoogleIcon: 'Google' },
    './Ajustes': { GrupoAjustes: 'Group', FilaAccion: 'Accion', FilaDato: 'Dato' },
  }
  const exports = {}
  const source = ts.transpileModule(readFileSync('src/ui/ConectarGoogle.tsx','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function('exports','require',source)(exports, k => { assert.ok(k in deps,k); return deps[k] })
  return { calls, render() { cursor=0; return exports.ConectarGoogle({ user }) } }
}
function nodes(tree, type) {
  if (!tree || typeof tree !== 'object') return []
  if (Array.isArray(tree)) return tree.flatMap(x => nodes(x,type))
  return [...(tree.type===type ? [tree] : []), ...nodes(tree.props?.children,type)]
}
const conectar = ui => nodes(ui,'Accion').find(n=>n.props.rotulo==='Conectar con Google')
test('Cuenta presenta Google, bloquea doble click y confirma la identidad conectada', async () => {
  let done
  const h=montar({id:'legacy'},()=>new Promise(r=>{done=r}))
  const fila=conectar(h.render())
  assert.ok(fila); assert.equal(fila.props.icono.type,'Google')
  fila.props.onPress(); fila.props.onPress(); await tick()
  // Ocupada, la fila no acepta otro toque: `FilaAccion` no llama con `busy`.
  assert.deepEqual(h.calls,['legacy']);assert.equal(conectar(h.render()).props.busy,true)
  assert.ok(nodes(h.render(),'Accion').some(n=>n.props.rotulo==='Cancelar'),'se puede salir de la espera')
  done({id:'legacy',identities:[{provider:'google',identity_data:{email:'test@example.test'}}]});await tick()
  assert.equal(conectar(h.render()),undefined)
  assert.ok(nodes(h.render(),'Dato').some(n=>n.props.rotulo==='Google conectado'))
})
test('Cuenta ya conectada no ofrece otro login ni expone datos ajenos', () => {
  const h=montar({id:'legacy',identities:[{provider:'google',identity_data:{email:'test@example.test'}}]})
  assert.equal(conectar(h.render()),undefined)
  assert.ok(nodes(h.render(),'Dato').some(n=>n.props.valor==='test@example.test'))
})
test('error de vinculación se muestra sin confirmar éxito', async () => {
  const h=montar({id:'legacy'},()=>{throw {code:'identity_already_exists'}})
  conectar(h.render()).props.onPress();await tick()
  assert.equal(conectar(h.render()).props.busy,false)
  // El error va al pie de su bloque, no en un cartel suelto debajo.
  assert.match(nodes(h.render(),'Group')[0].props.error,/otra cuenta/)
})
