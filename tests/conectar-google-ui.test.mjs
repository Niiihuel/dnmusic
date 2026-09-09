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
    '../lib/supabase': { getSupabase: () => ({}) }, './Social': { AccionSocial: 'Action' }, './GoogleIcon': { GoogleIcon: 'Google' }, './Ajustes': { GrupoAjustes: 'Group' }, './Button': { GhostButton: 'Ghost' },
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
test('Cuenta presenta Google, bloquea doble click y confirma la identidad conectada', async () => {
  let done
  const h=montar({id:'legacy'},()=>new Promise(r=>{done=r}))
  const action=nodes(h.render(),'Action')[0]
  assert.equal(action.props.label,'Conectar con Google'); assert.equal(action.props.icono.type,'Google')
  action.props.onPress(); action.props.onPress(); await tick()
  assert.deepEqual(h.calls,['legacy']);assert.equal(nodes(h.render(),'Action')[0].props.disabled,true)
  done({id:'legacy',identities:[{provider:'google',identity_data:{email:'test@example.test'}}]});await tick()
  assert.equal(nodes(h.render(),'Action').length,0)
  assert.ok(nodes(h.render(),'Text').some(n=>n.props.children==='Google conectado'))
})
test('Cuenta ya conectada no ofrece otro login ni expone datos ajenos', () => {
  const h=montar({id:'legacy',identities:[{provider:'google',identity_data:{email:'test@example.test'}}]})
  assert.equal(nodes(h.render(),'Action').length,0)
  assert.ok(nodes(h.render(),'Text').some(n=>n.props.children==='test@example.test'))
})
test('error de vinculación se muestra sin confirmar éxito', async () => {
  const h=montar({id:'legacy'},()=>{throw {code:'identity_already_exists'}})
  nodes(h.render(),'Action')[0].props.onPress();await tick()
  assert.equal(nodes(h.render(),'Action')[0].props.disabled,false)
  assert.match(nodes(h.render(),'Text').find(n=>n.props.accessibilityRole==='alert').props.children,/otra cuenta/)
})
