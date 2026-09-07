import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import ts from 'typescript'
import { BASE_DISCORD, FUENTE_DISCORD, normalizarDiscord, contarCatalogo, urlDiscord, skuDiscord } from '../scripts/decoraciones/discord-normalizar.mjs'

const fecha = { actualizado: '2026-08-27' }
const sku = (n) => `120000000000000${String(n).padStart(4, '0')}`
const id = (n) => `discord:${sku(n)}`
const cdn = (name) => `https://cdn.discordapp.com/assets/content/${name}`
const avatar = (n = 1) => ({ type: 0, sku_id: sku(n), asset: `a_${String(n).padStart(32, '0')}` })
const efecto = (n = 2) => ({ type: 1, sku_id: sku(n), title: 'Efecto', thumbnailPreviewSrc: cdn('preview'), reducedMotionSrc: cdn('reduced'), effects: [{ src: cdn('intro'), loop: false, duration: 2000, start: 50, loopDelay: 400, zIndex: 101, width: 450, height: 880, position: { x: -2, y: 4 }, randomizedSources: [{ src: cdn('other') }] }] })
const producto = (n, items = [avatar(n)], type = items[0].type) => ({ sku_id: sku(n), name: `Producto ${n}`, type, items })
const coleccion = (products, n = 90) => ({ sku_id: sku(n), name: `Colección ${n}`, styles: { background_colors: [0, 0xffffff] }, catalog_banner_url: cdn('banner'), products })
const normalizar = (products) => normalizarDiscord([coleccion(products)], fecha)
const snapshot = JSON.parse(readFileSync(new URL('../src/data/discord-catalogo.json', import.meta.url), 'utf8'))

// Ejecuta el servicio y el store reales compilados con TypeScript ya instalado.
// Solo reemplaza los hooks de React y la frontera de carga del JSON.
function servicio(catalogo = snapshot, fallos = 0) {
  const efectos = [], hooks = { useEffect: (f) => efectos.push(f), useCallback: (f) => f, useSyncExternalStore: (_subscribe, get) => get() }
  let cargas = 0
  function compilar(ruta, require) {
    const { outputText } = ts.transpileModule(readFileSync(new URL(ruta, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } })
    const exports = {}
    new Function('require', 'exports', outputText)(require, exports)
    return exports
  }
  const store = compilar('../src/state/store.ts', () => hooks)
  const api = compilar('../src/services/discordCatalogo.ts', (path) => {
    if (path === 'react') return hooks
    if (path === '../state/store') return store
    if (path === '../data/discord-catalogo.json') {
      cargas++
      if (cargas <= fallos) throw new Error('Fallo de carga simulado')
      return catalogo
    }
    throw new Error(`Import inesperado: ${path}`)
  })
  return { api, cargas: () => cargas, efectos: () => efectos.splice(0).forEach((f) => f()) }
}

test('snapshot completo, sin precios, sin duplicados y con referencias resolubles', () => {
  assert.deepEqual(contarCatalogo(snapshot), BASE_DISCORD)
  const { api } = servicio()
  assert.equal(api.validarCatalogoDiscord(snapshot), snapshot)
  assert.equal(new Set(snapshot.piezas.map((p) => p.id)).size, snapshot.piezas.length)
  assert.equal(snapshot.piezas.filter((p) => p.disponible === false).length, 9)
  assert.equal(snapshot.paquetes.filter((p) => p.alternativas).length, 2)
  assert.equal(snapshot.fuente, FUENTE_DISCORD)
  assert.doesNotMatch(JSON.stringify(snapshot), /"(?:prices|amount|currency|google_sku_ids|premium_type)":/)
})

test('conserva todos los ítems de un producto, incluso variantes de un grupo', () => {
  const c = normalizar([producto(1, [avatar(1), avatar(3)]), producto(8, [avatar(4), avatar(5)], 2000)])
  assert.deepEqual(c.piezas.map((p) => p.id), [id(1), id(3), id(4), id(5)])
  assert.equal(new Set(c.piezas.map((p) => p.nombre)).size, 4)
})

test('deduplica SKUs entre colecciones y completa referencias parciales sin perder membresías', () => {
  const referencia = { type: 1, sku_id: sku(2), id: sku(222) }
  const c = normalizarDiscord([coleccion([producto(1), producto(2, [referencia])]), coleccion([producto(1), producto(2, [efecto()])], 91)], fecha)
  assert.equal(c.piezas.length, 2)
  const p = c.piezas.find((p) => p.id === id(2))
  assert.equal(p.efectos.length, 1)
  assert.notEqual(p.disponible, false)
  assert.deepEqual(p.coleccionIds, [id(90), id(91)])
})

test('rechaza SKUs repetidos con recursos distintos, no sobrescribe la variante', () => {
  assert.throws(() => normalizar([producto(1), producto(1, [{ ...avatar(), asset: `a_${'f'.repeat(32)}` }])]), /duplicado conflictivo/)
})

test('conserva tiempos, posición, movimiento reducido y fuentes aleatorias', () => {
  const p = normalizar([producto(2, [efecto()])]).piezas[0]
  assert.equal(p.reducedMotionSrc, cdn('reduced'))
  assert.deepEqual(p.efectos[0], { src: cdn('intro'), loop: false, duration: 2000, start: 50, loopDelay: 400, zIndex: 101, width: 450, height: 880, position: { x: -2, y: 4 }, randomizedSources: [cdn('other')] })
  assert.equal(p.staticPreview, undefined, 'reducedMotion no garantiza una imagen inmóvil')
})

test('prioriza assets explícitos y codifica rutas de placas sin aceptar traversal', () => {
  const a = { ...avatar(), assets: { static_image_url: cdn('static'), animated_image_url: cdn('animated') } }
  const placa = { type: 2, sku_id: sku(3), asset: 'nameplates/woody’s_badge/123/', palette: 'cobalt' }
  const c = normalizar([producto(1, [a]), producto(3, [placa])])
  assert.equal(c.piezas[0].preview, cdn('animated'))
  assert.equal(c.piezas[0].staticPreview, cdn('static'))
  assert.match(c.piezas[1].videoSrc, /woody%E2%80%99s_badge\/123\/asset.webm$/)
  assert.throws(() => normalizar([producto(3, [{ ...placa, asset: 'nameplates/../bad/' }])]), /asset de placa/)
})

test('conserva las capas de marco y todas las medidas', () => {
  const frame = { type: 3, sku_id: sku(3), layers: [{ id: sku(33), type: 'rail', order: 'back', anchor: 'center', responsive: true }], inner_width: 1200, overflow_top: 200, overflow_bottom: 90, overflow_horizontal: 56 }
  const p = normalizar([producto(3, [frame])]).piezas[0]
  assert.deepEqual([p.innerWidth, p.overflowTop, p.overflowBottom, p.overflowHorizontal], [1200, 200, 90, 56])
  assert.deepEqual(p.capas, frame.layers)
  assert.throws(() => normalizar([producto(3, [{ ...frame, layers: [...frame.layers, ...frame.layers] }])]), /capas duplicadas/)
})

test('preserva alternativas de paquetes y valida toda la selección antes de aplicar', async () => {
  const bundle = producto(10, [avatar(1), avatar(3), efecto()], 1000)
  const c = normalizar([producto(1), producto(3), producto(2, [efecto()]), bundle])
  assert.deepEqual(c.paquetes[0].alternativas, { marco: [id(1), id(3)] })
  const { api } = servicio(c)
  assert.equal(api.seleccionPaqueteDiscord(id(10)), null, 'sin catálogo no hay cambios parciales')
  await api.cargarCatalogoDiscord()
  assert.deepEqual(api.seleccionPaqueteDiscord(id(10), { marco: id(3) }), { marco: id(3), efecto: id(2) })
  assert.equal(api.seleccionPaqueteDiscord(id(10), { marco: id(99) }), null)
  assert.equal(api.seleccionPaqueteDiscord(id(10), { placa: id(1) }), null)
  assert.deepEqual(c.paquetes[0].piezas, { marco: id(1), efecto: id(2) }, 'no muta el paquete compartido')
})

test('paquete incompleto se rechaza; referencia legítima sin recursos queda visible e inaplicable', async () => {
  const bundle = producto(10, [avatar()], 1000)
  bundle.bundled_products = [{ sku_id: sku(2), type: 1, name: 'Faltante' }]
  assert.throws(() => normalizar([bundle]), /paquete incompleto/)
  const c = normalizar([producto(10, [avatar(), { type: 1, sku_id: sku(2), id: sku(222) }], 1000)])
  assert.equal(c.piezas.find((p) => p.tipo === 'efecto').disponible, false)
  assert.equal(c.paquetes[0].disponible, false)
  const { api } = servicio(c)
  await api.cargarCatalogoDiscord()
  assert.equal(api.seleccionPaqueteDiscord(id(10)), null)
})

test('rechaza URLs externas, HTTP, credenciales y SKUs corruptos o imprecisos', () => {
  for (const url of ['http://cdn.discordapp.com/a', 'https://cdn.discordapp.com.evil.test/a', 'https://evil.test/?cdn.discordapp.com', 'https://user@cdn.discordapp.com/a', 'https://cdn.discordapp.com:444/a', 'https://cdn.discordapp.com/a#x', 'https://cdn.discordapp.com\\@evil.test/a']) {
    assert.throws(() => urlDiscord(url))
    assert.throws(() => normalizar([producto(1, [{ ...avatar(), assets: { animated_image_url: url } }])]))
  }
  for (const value of [1200000000000000001, '123', '0120000000000000001', '18446744073709551616', 'invalid']) assert.throws(() => skuDiscord(value))
  assert.equal(urlDiscord('https://media.discordapp.net/a'), 'https://media.discordapp.net/a')
})

test('rechaza estructura, fechas, tipos y animaciones corruptas', () => {
  for (const value of [null, {}, [], [null]]) assert.throws(() => normalizarDiscord(value, fecha))
  assert.throws(() => normalizarDiscord([coleccion([producto(1)])], { actualizado: '2026-02-30' }))
  assert.throws(() => normalizar([producto(2, [{ ...efecto(), effects: [] }])]), /effects vacío/)
  assert.throws(() => normalizar([producto(2, [{ ...efecto(), effects: [{ ...efecto().effects[0], duration: -1 }] }])]), /duration/)
  assert.throws(() => normalizar([producto(2, [{ ...efecto(), type: 8 }])]))
  assert.throws(() => normalizar([producto(2, [{ type: 1, sku_id: sku(2) }])]), /SKU/)
})

test('carga perezosa, promesa compartida, caché e índice síncrono', async () => {
  const s = servicio()
  assert.equal(s.cargas(), 0)
  assert.equal(s.api.piezaDiscordDe(snapshot.piezas[0].id), null)
  const uno = s.api.cargarCatalogoDiscord(), dos = s.api.cargarCatalogoDiscord()
  assert.equal(uno, dos)
  assert.equal(s.api.useCatalogoDiscord(false).cargando, true)
  assert.equal(await uno, await dos)
  assert.equal(s.cargas(), 1)
  assert.equal(await s.api.cargarCatalogoDiscord(), snapshot)
  assert.equal(s.api.piezaDiscordDe(snapshot.piezas[0].id), snapshot.piezas[0])
  assert.equal(s.api.piezaDiscordDe('imagen:local'), null)
  assert.equal(s.cargas(), 1)
})

test('fallo compartido permite reintentar y limpia el error', async () => {
  const s = servicio(snapshot, 1)
  const uno = s.api.cargarCatalogoDiscord(), dos = s.api.cargarCatalogoDiscord()
  const resultados = await Promise.allSettled([uno, dos])
  assert.ok(resultados.every((r) => r.status === 'rejected'))
  assert.match(s.api.useCatalogoDiscord(false).error, /simulado/)
  assert.equal(s.api.useCatalogoDiscord(false).cargando, false)
  await s.api.cargarCatalogoDiscord()
  assert.equal(s.cargas(), 2)
  assert.equal(s.api.useCatalogoDiscord(false).error, null)
})

test('hooks inactivos e IDs ajenos no cargan; ID Discord carga desde el efecto', async () => {
  const s = servicio()
  s.api.useCatalogoDiscord(false)
  for (const id of [null, undefined, 'local', 'imagen:ruta', 'discord:invalid']) assert.equal(s.api.usePiezaDiscord(id), null)
  s.efectos()
  await Promise.resolve()
  assert.equal(s.cargas(), 0)
  assert.equal(s.api.usePiezaDiscord(snapshot.piezas[0].id), null)
  assert.equal(s.cargas(), 0, 'no inicia carga durante render')
  s.efectos()
  await s.api.cargarCatalogoDiscord()
  assert.equal(s.cargas(), 1)
  assert.equal(s.api.usePiezaDiscord(snapshot.piezas[0].id), snapshot.piezas[0])
})

test('el cliente rechaza snapshots corruptos y paquetes con referencias inválidas', () => {
  const { api } = servicio()
  for (const editar of [
    (c) => { c.version = 2 },
    (c) => { c.piezas.push(c.piezas[0]) },
    (c) => { c.piezas[0].preview = 'https://evil.test/asset.png' },
    (c) => { c.paquetes[0].piezas.marco = id(999) },
    (c) => { c.piezas.find((p) => p.efectos).efectos[0].randomizedSources = ['https://evil.test/a'] },
  ]) {
    const c = structuredClone(snapshot)
    editar(c)
    assert.throws(() => api.validarCatalogoDiscord(c))
  }
})

test('el importador no reemplaza el snapshot ante JSON corrupto o un recorte inesperado', () => {
  const original = readFileSync(new URL('../src/data/discord-catalogo.json', import.meta.url))
  const dir = mkdtempSync(join(tmpdir(), 'dnmusic-discord-test-'))
  try {
    const archivo = join(dir, 'collectibles.json')
    for (const contenido of ['{bad', JSON.stringify([coleccion([producto(1)])])]) {
      writeFileSync(archivo, contenido)
      const result = spawnSync(process.execPath, ['scripts/decoraciones/importar-discord.mjs', '--fecha', fecha.actualizado, '--archivo', archivo], { encoding: 'utf8' })
      assert.equal(result.status, 1)
      assert.deepEqual(readFileSync(new URL('../src/data/discord-catalogo.json', import.meta.url)), original)
    }
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

/** Ejecuta las funciones reales de la UI; evita montar el mosaico ajeno a este flujo. */
function funcionesUI(ruta, nombres, dependencias) {
  const source = readFileSync(ruta, 'utf8')
  const ast = ts.createSourceFile(ruta, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const funciones = ast.statements.filter((n) => ts.isFunctionDeclaration(n) && nombres.includes(n.name?.text))
  assert.equal(funciones.length, nombres.length)
  const codigo = funciones.map((n) => n.getText(ast)).join('\n') + `\nexport { ${nombres.join(', ')} }`
  const { outputText } = ts.transpileModule(codigo, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } })
  const exports = {}
  const jsx = (type, props) => ({ type, props })
  new Function('exports', 'require', ...Object.keys(dependencias), outputText)(exports, () => ({ jsx, jsxs: jsx }), ...Object.values(dependencias))
  return exports
}
function nodosUI(nodo, tipo) {
  if (!nodo || typeof nodo !== 'object') return []
  if (Array.isArray(nodo)) return nodo.flatMap((n) => nodosUI(n, tipo))
  return [...(nodo.type === tipo ? [nodo] : []), ...nodosUI(nodo.props?.children, tipo)]
}

test('cabecera sin tarjeta conserva la fuente y propaga pausa/reanudación a placa y marco en ambas orientaciones', () => {
  const identidad = funcionesUI('src/ui/PerfilPublico.tsx', ['Identidad', 'FotoDeHeroe'], {
    View: 'View', Text: 'Text', PlacaDeNombre: 'Placa', Avatar: 'Avatar', Marco: 'Marco', aireDelMarco: () => 8,
  })
  let anchoCabecera = 0
  const cabecera = funcionesUI('src/ui/TarjetaPerfil.tsx', ['CabeceraPerfil'], {
    useState: () => [anchoCabecera, (valor) => { anchoCabecera = valor }],
    View: 'View', FuentePerfil: 'FuentePerfil', Identidad: identidad.Identidad, TarjetaPerfil: 'TarjetaPerfil', esDiscord: (id) => typeof id === 'string' && id.startsWith('discord:'),
  })
  const perfil = { username: 'nihuel', fuente: 'caveat', marco: id(1), placa: id(3), efecto: null, marcoPerfil: null, avatarPath: null }
  for (const banda of [false, true]) for (const ancho of [320, 960]) for (const animado of [false, true, false]) {
    let arbol = cabecera.CabeceraPerfil({ perfil, banda, centrado: !banda, animado })
    arbol.props.children.props.onLayout({ nativeEvent: { layout: { width: ancho } } })
    arbol = cabecera.CabeceraPerfil({ perfil, banda, centrado: !banda, animado })
    assert.equal(arbol.type, 'FuentePerfil')
    assert.equal(arbol.props.fuente, 'caveat')
    const props = nodosUI(arbol, identidad.Identidad)[0].props
    assert.equal(props.banda, banda && ancho >= 720)
    assert.equal(nodosUI(arbol, 'TarjetaPerfil').length, 0)
    assert.equal(props.animado, animado)
    const cuerpo = identidad.Identidad(props)
    assert.equal(nodosUI(cuerpo, 'Placa')[0].props.animado, animado)
    const foto = nodosUI(cuerpo, identidad.FotoDeHeroe)[0]
    assert.equal(foto.props.animado, animado)
    assert.equal(nodosUI(identidad.FotoDeHeroe(foto.props), 'Marco')[0].props.animado, animado)
  }
})

test('guard conserva la acción original, permite cancelar y bloquea durante guardado; limpia beforeunload', () => {
  let estado = null, limpiar, efecto, prevencion
  const actions = [], listeners = new Map()
  const hook = funcionesUI('src/ui/useSalidaConCambios.tsx', ['useSalidaConCambios'], {
    useState: () => [estado, (valor) => { estado = valor }],
    useEffect: (fn) => { efecto = fn },
    useNavigation: () => ({ dispatch: (a) => actions.push(a) }),
    usePreventRemove: (activo, callback) => { prevencion = { activo, callback } },
    Platform: { OS: 'web' }, Confirmar: 'Confirmar',
    window: { addEventListener: (n, f) => listeners.set(n, f), removeEventListener: (n, f) => { if (listeners.get(n) === f) listeners.delete(n) } },
  })
  function render(cambiado, ocupado = false) {
    const arbol = hook.useSalidaConCambios(cambiado, ocupado)
    limpiar?.(); limpiar = efecto()
    return arbol
  }
  render(false)
  assert.equal(prevencion.activo, false)
  assert.equal(listeners.size, 0)
  render(true)
  assert.equal(prevencion.activo, true)
  let bloqueado = false
  listeners.get('beforeunload')({ preventDefault: () => { bloqueado = true } })
  assert.equal(bloqueado, true)
  // React Navigation usa propiedades Symbol para no volver a bloquear la misma salida.
  const accion = { type: 'GO_BACK', [Symbol('visited')]: new Set(['editor']) }
  prevencion.callback({ data: { action: accion } })
  assert.equal(render(true).props.visible, true)
  render(true).props.onCancelar()
  assert.equal(render(true).props.visible, false)
  assert.equal(actions.length, 0)
  prevencion.callback({ data: { action: accion } })
  render(true).props.onConfirmar()
  assert.equal(actions[0], accion)
  render(false, true)
  assert.equal(prevencion.activo, true)
  prevencion.callback({ data: { action: accion } })
  assert.equal(render(false, true).props.visible, false)
  render(false)
  assert.equal(listeners.size, 0)
  render(true); limpiar()
  assert.equal(listeners.size, 0)
})
