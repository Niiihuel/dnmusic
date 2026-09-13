import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import vm from 'node:vm'

const sourceText = readFileSync('app/profile/editar/index.tsx', 'utf8')
const source = ts.createSourceFile('editor.tsx', sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const jsx = (type, props) => ({ type, props })
function nodes(n) {
  if (!n || typeof n !== 'object') return []
  if (Array.isArray(n)) return n.flatMap(nodes)
  return [n, ...nodes(n.props?.children)]
}
function fixture(nombre = 'Escritorio', os = 'web') {
  const fn = source.statements.find(n => ts.isFunctionDeclaration(n) && n.name.text === nombre)
  const code = ts.transpileModule(`export ${fn.getText(source)}`, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
  const states = [], exports = {}
  let cursor = 0
  vm.runInNewContext(code, {
    exports, require: () => ({ jsx, jsxs: jsx }), LATERAL_W: 210, MAX_W: 560,
    useState(initial) { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], v => { states[i] = typeof v === 'function' ? v(states[i]) : v }] },
    ...Object.fromEntries(['Shell', 'SafeAreaView', 'View', 'Panel', 'CabeceraLateral', 'BotonLateral', 'BotonVolver', 'ScrollView', 'Text', 'Pressable', 'CollapsedSidebar', 'PreviaPlegable', 'IconUser', 'IconEye', 'IconEyeOff', 'IconCollapseLeft', 'IconCollapseRight', 'IconBack', 'IconChevronRight', 'KeyboardAvoidingView', 'AjustesCompactos', 'FilaSocial'].map(n => [n, n])),
    ICON_COLOR: { foreground: 'white', muted: 'gray' }, Platform: { OS: os },
  })
  const previa = { type: 'PerfilBorrador', props: { nombre: 'Cambio pendiente' } }
  const sections = [
    { id: 'identidad', titulo: 'Identidad', icono: 'Persona', bloques: { type: 'CamposIdentidad' } },
    { id: 'mosaico', titulo: 'Mosaico', icono: 'Grilla', bloques: { type: 'CamposMosaico' } },
  ]
  let vueltas = 0
  const render = props => { cursor = 0; return nodes(exports[nombre]({ secciones: sections, cuenta: { type: 'Cuenta' }, previa, espacioBarra: 140, onVolver: () => vueltas++, ...props })) }
  const width = value => render().find(n => n.type === 'SafeAreaView').props.onLayout({ nativeEvent: { layout: { width: value } } })
  const control = (ui, label) => ui.find(n => n.props?.label === label || n.props?.accessibilityLabel === label || n.props?.titulo === label)
  return { render, width, control, previa, sections, vueltas: () => vueltas }
}

test('editor 1440: ambos laterales pliegan sin perder sección, borrador ni regreso', () => {
  const f = fixture(); f.width(1440)
  let ui = f.render()
  f.control(ui, 'Mosaico').props.onPress()
  f.control(ui, 'Contraer secciones del perfil').props.onPress()
  f.control(ui, 'Ocultar vista previa').props.onPress()
  ui = f.render()
  assert.equal(ui.find(n => n.props?.testID === 'editor-secciones').props.style.width, 64)
  assert.equal(ui.find(n => n.props?.testID === 'editor-previa-lateral').props.style.width, 64)
  assert.ok(ui.some(n => n.type === 'CamposMosaico'))
  assert.ok(!ui.includes(f.previa))
  f.control(ui, 'Volver al perfil').props.onPress()
  assert.equal(f.vueltas(), 1)
  f.control(ui, 'Mostrar vista previa').props.onExpand()
  f.control(ui, 'Mostrar secciones del perfil').props.onExpand()
  ui = f.render()
  assert.ok(ui.includes(f.previa))
  assert.ok(f.control(ui, 'Mosaico').props.accessibilityState.selected)
  assert.equal(ui.filter(n => n.props?.label === 'Volver al perfil').length, 1)
})

test('editor 780–1020: la previa pasa al contenido sin duplicarse y conserva plegado al ampliar', () => {
  const f = fixture(); f.width(1440)
  f.control(f.render(), 'Ocultar vista previa').props.onPress()
  for (const ancho of [780, 900, 1019]) {
    f.width(ancho)
    const ui = f.render()
    assert.equal(ui.some(n => n.props?.testID === 'editor-previa-lateral'), false)
    const inline = ui.find(n => n.type === 'PreviaPlegable')
    assert.equal(inline.props.abierta, false)
    assert.equal(inline.props.children, f.previa)
  }
  f.render().find(n => n.type === 'PreviaPlegable').props.onCambiar()
  f.width(1440)
  assert.equal(f.render().find(n => n.props?.testID === 'editor-previa-lateral').props.style.width, 350)
  assert.equal(f.render().filter(n => n === f.previa).length, 1)
})

test('secciones usan iconos directos y la misma geometría de filas que Inicio', () => {
  const f = fixture(); f.width(1440)
  for (const label of ['Identidad', 'Mosaico']) {
    const fila = f.control(f.render(), label)
    assert.match(fila.props.className, /h-\[30px\].*gap-2\.5.*rounded-md/)
    assert.equal(fila.props.children[0].props.size, 16)
    assert.notEqual(fila.props.children[0].type, 'View', 'sin caja de fondo por icono')
  }
})

test('previa móvil plegada no monta cosméticos; expandir conserva el contenido recibido', () => {
  const f = fixture('PreviaPlegable')
  let abierta = false
  const props = () => ({ abierta, onCambiar: () => { abierta = !abierta }, children: f.previa })
  let ui = f.render(props())
  assert.ok(!ui.includes(f.previa))
  f.control(ui, 'Mostrar vista previa').props.onPress()
  ui = f.render(props())
  assert.ok(ui.includes(f.previa))
  f.control(ui, 'Ocultar vista previa').props.onPress()
  assert.ok(!f.render(props()).includes(f.previa))
  assert.match(sourceText, /PreviaPlegable abierta=\{previaMovil\}/)
})


test('iOS abre Identidad desde el menú y vuelve sin perder la barra ni los cambios recibidos', () => {
  const f = fixture('Movil', 'ios')
  const barra = { type: 'BarraCambiosPerfil', props: { visible: true } }
  const render = () => f.render({ pisoVisible: 80, children: barra })
  let ui = render()
  assert.equal(ui.some(n => n.type === 'CamposIdentidad'), false, 'el formulario no se monta sobre el menú')
  for (const label of ['Identidad', 'Mosaico']) {
    const fila = f.control(ui, label)
    assert.equal(fila.type, 'FilaSocial', 'el toque de navegación lo maneja la fila nativa')
    const contenedor = ui.find(n => n.type === 'View' && n.props?.children?.[0]?.props?.size === 16 && nodes(n).includes(fila))
    assert.ok(contenedor, 'el icono se conserva fuera del control de texto')
  }
  f.control(ui, 'Identidad').props.onPress()
  ui = render()
  assert.ok(ui.some(n => n.type === 'CamposIdentidad'))
  assert.ok(ui.includes(barra))
  assert.equal(ui.find(n => n.type === 'ScrollView').props.contentContainerStyle.paddingBottom, 220)
  assert.equal(f.control(ui, 'Mosaico'), undefined)
  f.sections[0].bloques = { type: 'CamposIdentidad', props: { nombre: 'Cambio pendiente' } }
  f.control(ui, 'Volver a editar perfil').props.onPress()
  ui = render()
  assert.equal(f.vueltas(), 0, 'volver de Identidad no abandona la sesión de edición')
  assert.ok(ui.includes(barra))
  assert.equal(ui.some(n => n.type === 'CamposIdentidad'), false)
  f.control(ui, 'Identidad').props.onPress()
  assert.equal(render().find(n => n.type === 'CamposIdentidad').props.nombre, 'Cambio pendiente')
  f.control(render(), 'Volver a editar perfil').props.onPress()
  f.control(render(), 'Volver al perfil').props.onPress()
  assert.equal(f.vueltas(), 1)
})

test('filas de apariencia y campos aceptan iconos directos sin cambiar el estilo predeterminado', () => {
  for (const [path, name, props] of [
    ['src/ui/Ajustes.shared.tsx', 'FilaAjuste', { rotulo: 'Tipografía', onPress() {} }],
    ['src/ui/Ajustes.shared.tsx', 'FilaInterruptor', { rotulo: 'Perfil público', activo: true, onCambiar() {} }],
    ['src/ui/EditorDeCampo.tsx', 'FilaCampo', { cual: 'nombre', editor: { valor: 'Ana', cambiar() {} } }],
  ]) {
    const file = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const fn = file.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name)
    const code = ts.transpileModule(`export ${fn.getText(file).replace(/^export /, '')}`, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
    const exports = {}
    vm.runInNewContext(code, {
      exports, require: () => ({ jsx, jsxs: jsx }), ICON_COLOR: { muted: 'gray' }, TITULO_CAMPO: { nombre: 'Nombre' }, useAjustesCompactos: () => false,
      /* `false` = la fila escucha el toque, que es lo que hace en web y en
         Android. En iOS lo escucha el `Toggle` del sistema y la fila deja de
         ser un Pressable; ver `src/ui/Interruptor.ios.tsx`. */
      INTERRUPTOR_PROPIO: false, Platform: { OS: 'web' }, EntradaTexto: 'EntradaTexto',
      ...Object.fromEntries(['View', 'Text', 'TextInput', 'Pressable', 'IconoAjuste', 'IconChevronRight', 'Interruptor', 'Globito'].map(n => [n, n])),
    })
    const icono = { type: 'IconPalette', props: { size: 16 } }
    assert.ok(nodes(exports[name]({ ...props, icono })).some(n => n.type === 'IconoAjuste'))
    const planos = nodes(exports[name]({ ...props, icono, iconoPlano: true }))
    assert.ok(planos.includes(icono))
    assert.equal(planos.some(n => n.type === 'IconoAjuste'), false)
  }
})


test('detalle del perfil limita la lectura y compacta sólo los controles de escritorio', () => {
  const f = fixture(); f.width(1440)
  const ui = f.render()
  assert.ok(ui.find(n => n.props?.style?.maxWidth === 560))
  assert.ok(ui.some(n => n.type === 'AjustesCompactos'))
  const movil = fixture('Movil').render({ pisoVisible: 80, children: null })
  assert.equal(movil.some(n => n.type === 'AjustesCompactos'), false)
})
