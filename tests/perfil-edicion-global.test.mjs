import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const compile = path => ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
function fixture() {
  let perfil = { userId: 'u1', username: 'ana', displayName: 'Ana', bio: null, fuente: null, tema: null, marco: null, marcoPerfil: null, efecto: null, placa: null, avatarPath: null, bannerPath: 'original.jpg', avatarEncuadre: null, bannerEncuadre: null, visibility: 'privado' }
  const state = {}, exports = {}
  new Function('exports','require', compile('src/state/store.ts'))(state, () => ({ useSyncExternalStore: (_s, get) => get() }))
  new Function('exports','require', compile('src/state/perfilEdicion.ts'))(exports, id => {
    if (id === './store') return state
    if (id === './session') return { useMyProfile: () => perfil }
    if (id === 'react') return { useMemo: fn => fn(), useEffect: fn => fn() }
    throw Error(id)
  })
  return { api: exports, get perfil() { return perfil }, guardar: next => { perfil = next } }
}

test('identidad, tipografía, privacidad y cosméticos se acumulan al entrar/salir de hojas', () => {
  const f = fixture(), s = f.api
  s.iniciarPerfilEdicion(f.perfil)
  s.actualizarPerfilEdicion({ displayName: 'Ana nueva' })
  s.useIniciarPerfilEdicion() // Entrar a Tipografía no reinicia el borrador.
  s.actualizarPerfilEdicion({ fuente: 'mono' })
  s.useIniciarPerfilEdicion() // Entrar a Decoraciones conserva los anteriores.
  s.actualizarPerfilEdicion({ marco: 'discord:avatar', marcoPerfil: 'discord:card' })
  s.actualizarPerfilEdicion({ visibility: 'publico' })
  assert.equal(f.perfil.displayName, 'Ana', 'La sesión pública todavía contiene lo guardado')
  assert.equal(s.usePerfilBorrador().displayName, 'Ana nueva')
  assert.deepEqual(s.cambiosParaGuardar(s.usePerfilBorrador(), s.getPerfilEdicion().cambios), {
    displayName: 'Ana nueva', visibility: 'publico', fuente: 'mono', marco: 'discord:avatar', marcoPerfil: 'discord:card',
  })
  s.restablecerPerfilEdicion()
  assert.deepEqual(s.getPerfilEdicion().cambios, {})
  assert.deepEqual(s.usePerfilBorrador(), f.perfil)
})

test('quitar medios conserva null de encuadre, envía vacío de ruta y omite campos intactos', () => {
  const f = fixture(), s = f.api
  s.iniciarPerfilEdicion({ ...f.perfil, bannerEncuadre: { x: 1, y: 0, escala: 2 }, fuente: 'mono' })
  s.actualizarPerfilEdicion({ bannerPath: null, bannerEncuadre: null, fuente: null })
  assert.deepEqual(s.cambiosParaGuardar(s.usePerfilBorrador(), s.getPerfilEdicion().cambios), {
    bannerPath: '', bannerEncuadre: null, fuente: null,
  })
  s.actualizarPerfilEdicion({ bannerPath: 'original.jpg' })
  assert.equal('bannerPath' in s.getPerfilEdicion().cambios, false)
})

test('guardar bloquea cambios y reset; un fallo conserva todo para reintentar y éxito limpia', () => {
  const f = fixture(), s = f.api
  s.iniciarPerfilEdicion(f.perfil)
  s.actualizarPerfilEdicion({ bio: 'Mi música', fuente: 'mono' })
  const patch = s.getPerfilEdicion().cambios
  s.ocuparPerfilEdicion(true)
  s.actualizarPerfilEdicion({ bio: 'Carrera' }); s.restablecerPerfilEdicion()
  assert.deepEqual(s.getPerfilEdicion().cambios, patch)
  s.ocuparPerfilEdicion(false) // Falló la red: no se confirma ni limpia.
  assert.deepEqual(s.getPerfilEdicion().cambios, patch)
  const next = { ...f.perfil, ...patch }
  f.guardar(next); s.confirmarPerfilEdicion(next)
  assert.deepEqual(s.getPerfilEdicion().cambios, {})
  assert.equal(s.usePerfilBorrador().bio, 'Mi música')
})

test('cambiar de cuenta descarta el borrador anterior y rechaza confirmaciones tardías', () => {
  const f = fixture(), s = f.api
  s.iniciarPerfilEdicion(f.perfil); s.actualizarPerfilEdicion({ fuente: 'mono' })
  const nueva = { ...f.perfil, userId: 'u2', username: 'bea' }
  f.guardar(nueva); s.iniciarPerfilEdicion(nueva)
  s.actualizarPerfilEdicion({ bio: 'Bea' })
  s.confirmarPerfilEdicion({ ...nueva, userId: 'u1' }); s.terminarPerfilEdicion('u1')
  assert.equal(s.getPerfilEdicion().ownerId, 'u2')
  assert.deepEqual(s.getPerfilEdicion().cambios, { bio: 'Bea' })
  s.terminarPerfilEdicion('u2')
  assert.equal(s.getPerfilEdicion().ownerId, null)
})


test('escucha opcional conserva false al guardar y restablece el opt-in del borrador', () => {
  const f = fixture(), s = f.api
  f.guardar({ ...f.perfil, compartirEscucha: false })
  s.iniciarPerfilEdicion(f.perfil)
  s.actualizarPerfilEdicion({ compartirEscucha: true })
  assert.deepEqual(s.cambiosParaGuardar(s.usePerfilBorrador(), s.getPerfilEdicion().cambios), { compartirEscucha: true })
  s.restablecerPerfilEdicion()
  assert.equal(s.usePerfilBorrador().compartirEscucha, false)
  const compartido = { ...f.perfil, compartirEscucha: true }
  f.guardar(compartido); s.confirmarPerfilEdicion(compartido)
  s.actualizarPerfilEdicion({ compartirEscucha: false })
  assert.deepEqual(s.cambiosParaGuardar(s.usePerfilBorrador(), s.getPerfilEdicion().cambios), { compartirEscucha: false })
})
