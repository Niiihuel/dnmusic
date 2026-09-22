import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import babel from '@babel/core'
import traverseModule from '@babel/traverse'

const tema = 'app/profile/tema.tsx'
const vitrina = 'app/profile/vitrina.tsx'
const encuadre = 'app/perfil/encuadrar.tsx'
function funciones(archivo, nombres, contexto) {
  const source = ts.createSourceFile(archivo, readFileSync(archivo, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const encontradas = new Map()
  const visitar = node => {
    if (ts.isFunctionDeclaration(node) && nombres.includes(node.name?.text)) encontradas.set(node.name.text, node.getText(source))
    ts.forEachChild(node, visitar)
  }
  visitar(source)
  assert.equal(encontradas.size, nombres.length)
  const { outputText } = ts.transpileModule([...encontradas.values()].join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } })
  return vm.runInNewContext(`${outputText}\n({${nombres.join(',')}})`, { exports: {}, ...contexto })
}
const copia = value => JSON.parse(JSON.stringify(value))

test('Restablecer tema recupera selección, color y acabado sin persistir ni cambiar tema global', () => {
  const resultado = {}
  const inicial = { id: 'degradado', paradas: ['#112233', '#334455'], patron: 'puntos' }
  const { restablecer } = funciones(tema, ['restablecer', 'elegir'], {
    global: false, edicion: { ocupado: false }, enVuelo: { current: false }, inicial, aMano: true, delPerfil: true,
    setElegido: value => { resultado.tema = value }, setPaleta: value => { resultado.paleta = value },
    setAcabado: value => { resultado.acabado = value }, setColorAMano: value => { resultado.color = value },
    setError: value => { resultado.error = value },
    actualizarBorrador: () => assert.fail('El tema de perfil no escribe en otra pieza'),
    saveMyProfile: () => assert.fail('Restablecer no guarda'),
  })
  restablecer()
  assert.deepEqual(resultado, { tema: inicial, paleta: true, acabado: 'degradado', color: '#112233', error: null })
})

test('tema de vitrina conserva su edición inmediata del borrador y Listo no persiste perfil', async () => {
  const temaNuevo = { id: 'verde' }, cambios = [], vueltas = []
  const { elegir, guardar } = funciones(tema, ['elegir', 'guardar'], {
    global: false, edicion: { ocupado: false }, enVuelo: { current: false }, delPerfil: false,
    setError() {}, setElegido() {}, actualizarBorrador: fn => cambios.push(fn({ estilo: { fuente: null, tema: null } })),
    volver: (_router, destino) => vueltas.push(destino), router: {},
    saveMyProfile: () => assert.fail('El selector de pieza no guarda el perfil'),
  })
  elegir(temaNuevo); await guardar()
  assert.deepEqual(copia(cambios), [{ estilo: { fuente: null, tema: temaNuevo } }])
  assert.deepEqual(vueltas, ['/profile/vitrina'])
})

test('error al guardar tema conserva el draft; éxito pide salida tras desactivar la guarda', async () => {
  const elegido = { id: 'azul' }, resultado = {}, enVuelo = { current: false }
  let fallar = true
  const { guardar } = funciones(tema, ['guardar'], {
    global: false, edicion: { ocupado: false }, elegido, enVuelo, perfil: {}, delPerfil: true, cambiado: true,
    setGuardando: v => { resultado.ocupado = v }, setError: v => { resultado.error = v },
    saveMyProfile: async patch => { assert.deepEqual(copia(patch), { tema: elegido }); if (fallar) throw new Error('sin conexión'); return patch },
    setMyProfile: value => { resultado.perfil = value }, avisar() {}, mensajeError: e => e.message,
    setSalir: value => { resultado.salir = value }, volver: () => assert.fail('Navegar aquí abriría la guarda antes del próximo render'),
  })
  await guardar()
  assert.equal(resultado.error, 'sin conexión'); assert.equal(resultado.salir, undefined)
  assert.equal(resultado.ocupado, false); assert.equal(enVuelo.current, false)
  fallar = false; await guardar()
  assert.equal(resultado.error, null); assert.equal(resultado.salir, true)
})

test('Restablecer vitrina recupera contenido, presentación y estilo del snapshot', () => {
  const inicial = { id: 'pieza', kind: 'texto', ancho: 'mitad', contenido: { kind: 'texto', texto: 'original' }, estilo: { tema: null, fondo: null, fuente: null }, parentId: null }
  let actual = { ...inicial, ancho: 'entero', contenido: { kind: 'texto', texto: 'nuevo' } }, error = 'falló'
  const { restablecer } = funciones(vitrina, ['restablecer'], {
    inicial, enVuelo: { current: false }, subiendo: false,
    actualizarBorrador: patch => { actual = { ...actual, ...patch } }, setError: value => { error = value },
  })
  restablecer()
  assert.deepEqual(actual, inicial); assert.equal(error, null)
})

test('guardar vitrina no elimina su borrador en error y bloquea escrituras duplicadas', async () => {
  const resultado = {}, enVuelo = { current: false }
  let rechazar, llamadas = 0
  const { guardar } = funciones(vitrina, ['guardar'], {
    global: false, user: { id: 'u' }, borrador: { id: 'pieza', ancho: 'mitad' }, contenido: { texto: 'draft' }, estilo: {},
    completa: true, cambiado: true, enVuelo, subiendo: false, nueva: false, kind: 'texto',
    payloadDe: c => c, updateShowcase: () => { llamadas++; return new Promise((_, reject) => { rechazar = reject }) },
    setGuardando: v => { resultado.ocupado = v }, setError: v => { resultado.error = v },
    mensajeError: e => e.message, limpiarBorrador: () => assert.fail('El draft debe sobrevivir al fallo'),
    setSalida: () => assert.fail('No se debe salir al fallar'),
  })
  const pendiente = guardar(); await guardar()
  assert.equal(llamadas, 1)
  rechazar(new Error('falló')); await pendiente
  assert.equal(resultado.error, 'falló'); assert.equal(resultado.ocupado, false)
})

test('tema global selecciona en memoria y Listo vuelve al editor sin persistir', async () => {
  const cambios = [], rutas = []
  const { elegir, guardar } = funciones(tema, ['elegir', 'guardar'], {
    global: true, edicion: { ocupado: false }, delPerfil: true, perfil: {}, cambiado: true,
    enVuelo: { current: false }, setError() {}, setElegido() {},
    actualizarPerfilEdicion: patch => cambios.push(copia(patch)),
    router: { dismissTo: ruta => rutas.push(ruta) },
    saveMyProfile: () => assert.fail('La hoja global no persiste'),
  })
  elegir({ id: 'azul' }); await guardar()
  assert.deepEqual(cambios, [{ tema: { id: 'azul' } }])
  assert.deepEqual(rutas, ['/profile/editar'])
})

test('vitrina global entrega borrador y navega sin invocar los servicios', async () => {
  const calls = []
  const draft = { id: 'a', kind: 'texto', contenido: { kind: 'texto', texto: 'Pendiente' } }
  const { guardar } = funciones(vitrina, ['guardar', 'listo'], {
    global: true, edicion: { ocupado: false }, enVuelo: { current: false }, subiendo: false, user: { id: 'yo' },
    borrador: draft, temporal: 'tmp', inicial: draft, borradorVitrinaCompleto: () => true,
    ponerVitrinaEdicion: (...args) => { calls.push(args); return 'a' },
    volver: () => calls.push('volver'), router: {},
    updateShowcase: () => assert.fail('Listo no escribe'), addShowcase: () => assert.fail('Listo no crea'),
  })
  await guardar()
  assert.equal(calls[0][0], 'yo'); assert.equal(calls[0][1], draft)
  assert.equal(calls[1], 'volver')
})

test('Centrar encuadre sólo actualiza los shared values de la vista previa', () => {
  const shared = value => ({ value, set(next) { this.value = next } })
  const x = shared(.3), y = shared(.2), escalaPedida = shared(2), giro = shared(90), fino = shared(7)
  const inicial = { x: .1, y: -.2, escala: 1.5, rotacion: 93 }
  const { centrar } = funciones(encuadre, ['centrar', 'ponerEncuadre', 'partirRotacion', 'normalizarGiro'], {
    enVuelo: { current: false }, x, y, escalaPedida, giro, fino, inicial, setError() {},
    saveMyProfile: () => assert.fail('Centrar no debe escribir en la base'),
    escribirEnBorrador: () => assert.fail('El encuadre debe confirmarse antes de tocar la vitrina'),
  })
  centrar()
  assert.deepEqual([x.value, y.value, escalaPedida.value, giro.value, fino.value], [0, 0, 1, 0, 0])
})

test('la guarda de encuadre se compila a worklet y redondear puede correr en UI', () => {
  const { ast } = babel.transformFileSync(encuadre, { ast: true, code: false, caller: { name: 'metro', platform: 'ios', supportsStaticESM: true, isDev: false } })
  let detectada = false, redondearEnUI = false
  traverseModule.default(ast, {
    AssignmentExpression(path) {
      const { left, right } = path.node
      if (left.type !== 'MemberExpression') return
      if (left.property.name === '__closure') {
        const nombres = right.properties?.map(p => p.key.name) ?? []
        if (nombres.includes('inicioX') && nombres.includes('redondear')) detectada = true
      }
      if (left.property.name === '__workletHash' && left.object.name?.toLowerCase().includes('redondear')) redondearEnUI = true
    },
  })
  assert.ok(detectada, 'comparación de cambios compilada en el hilo UI')
  // El nombre interno generado cambia por versión; la directiva debe seguir presente.
  const source = readFileSync(encuadre, 'utf8')
  assert.ok(redondearEnUI || /function redondear\([^)]*\)[^{]*\{\s*'worklet'/.test(source))
})


test('Descartar limpia el borrador sólo al confirmar y mantiene la acción original de navegación', () => {
  let pendiente = null, interceptar, descartes = 0
  const acciones = []
  const { useSalidaConCambios } = funciones('src/ui/useSalidaConCambios.tsx', ['useSalidaConCambios'], {
    require: () => ({ jsx: (type, props) => ({ type, props }) }), Confirmar: 'Confirmar',
    useState: () => [pendiente, value => { pendiente = value }], useEffect() {}, Platform: { OS: 'ios' },
    useNavigation: () => ({ dispatch: action => acciones.push(action) }),
    usePreventRemove: (_activo, fn) => { interceptar = fn },
  })
  const action = { type: 'GO_BACK', source: 'editor' }
  useSalidaConCambios(true, false, () => descartes++)
  interceptar({ data: { action } })
  let dialogo = useSalidaConCambios(true, false, () => descartes++)
  dialogo.props.onCancelar()
  assert.equal(descartes, 0); assert.equal(acciones.length, 0)
  interceptar({ data: { action } })
  dialogo = useSalidaConCambios(true, false, () => descartes++)
  dialogo.props.onConfirmar()
  assert.equal(descartes, 1); assert.equal(acciones[0], action)
})
