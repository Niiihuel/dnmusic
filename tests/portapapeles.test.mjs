import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

function cargar(path, imports, globals = {}) {
  const { outputText } = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const exports = {}
  vm.runInNewContext(outputText, { ...globals, exports, require(id) {
    assert.ok(id in imports, `Import no simulado: ${id}`)
    return imports[id]
  } })
  return exports
}

function portapapeles(os, globals = {}, native = {}) {
  const estados = []
  const api = cargar('src/lib/portapapeles.ts', {
    'react-native': { Platform: { OS: os } },
    '../state/copia': { iniciarCopia: texto => ok => estados.push({ texto, ok }) },
    'expo-clipboard': native,
  }, globals)
  return { ...api, estados }
}

test('Linux y Windows usan el puente nativo y confirman sólo después de la escritura', async () => {
  for (const os of ['linux', 'win32']) {
    let completar
    const escritos = []
    const h = portapapeles('web', {
      dnmusicEscritorio: { portapapeles: { copiar(texto) {
        escritos.push(texto)
        return new Promise(resolve => { completar = resolve })
      } } },
      navigator: { clipboard: { writeText() { assert.fail(`${os}: no usa permisos web`) } } },
    })
    const pendiente = h.copiarAlPortapapeles('https://dnmusic.test/lista/compartida?colaborar=1')
    assert.deepEqual(escritos, ['https://dnmusic.test/lista/compartida?colaborar=1'])
    assert.deepEqual(h.estados, [])
    completar(true)
    assert.equal(await pendiente, true)
    assert.deepEqual(h.estados, [{ texto: escritos[0], ok: true }])
  }
})

test('un fallo del puente de escritorio nunca se confirma como copia exitosa', async () => {
  for (const copiar of [async () => false, async () => { throw Error('clipboard bloqueado') }]) {
    const h = portapapeles('web', {
      dnmusicEscritorio: { portapapeles: { copiar } },
      navigator: { clipboard: { writeText() { assert.fail('no oculta un fallo nativo') } } },
    })
    assert.equal(await h.copiarAlPortapapeles('link'), false)
    assert.equal(h.estados.at(-1).ok, false)
  }
})

test('en navegador y clientes antiguos la API web recibe el texto en el mismo gesto', async () => {
  for (const dnmusicEscritorio of [undefined, { version() {} }]) {
    let gestando = true
    const escritos = []
    const h = portapapeles('web', { dnmusicEscritorio, navigator: { clipboard: { async writeText(texto) {
      assert.equal(gestando, true)
      escritos.push(texto)
    } } } })
    const pendiente = h.copiarAlPortapapeles('link')
    gestando = false
    assert.equal(await pendiente, true)
    assert.deepEqual(escritos, ['link'])
  }
})

test('respaldo web selecciona el enlace completo, limpia el campo y restaura el foco', async () => {
  const hechos = []
  class Element { isConnected = true; focus() { hechos.push('restaurar') } }
  const h = portapapeles('web', {
    navigator: { clipboard: { async writeText() { throw Error('denegado') } } },
    HTMLElement: Element,
    document: {
      activeElement: new Element(), body: { appendChild() { hechos.push('agregar') } },
      createElement() { return { style: {}, setAttribute() {}, focus() {}, select() {},
        setSelectionRange(inicio, fin) { hechos.push([inicio, fin]) }, remove() { hechos.push('quitar') } } },
      execCommand(comando) { assert.equal(comando, 'copy'); hechos.push('copiar'); return true },
    },
  })
  assert.equal(await h.copiarAlPortapapeles('invitación'), true)
  assert.deepEqual(hechos, ['agregar', [0, 10], 'copiar', 'quitar', 'restaurar'])
})

test('iOS y Android conservan el resultado real del módulo nativo y permiten reintentar', async () => {
  for (const os of ['ios', 'android']) {
    const escritos = []
    let respuesta = true
    const h = portapapeles(os, {}, { async setStringAsync(texto) {
      escritos.push(texto)
      if (respuesta instanceof Error) throw respuesta
      return respuesta
    } })
    assert.equal(await h.copiarAlPortapapeles('enlace'), true)
    respuesta = false
    assert.equal(await h.copiarAlPortapapeles('otro'), false)
    respuesta = Error('módulo no disponible')
    assert.equal(await h.copiarAlPortapapeles('fallo'), false)
    respuesta = true
    assert.equal(await h.copiarAlPortapapeles('reintento'), true)
    assert.deepEqual(escritos, ['enlace', 'otro', 'fallo', 'reintento'])
  }
})

test('todos los enlaces compartidos usan la misma copia y iOS recibe la hoja nativa', async () => {
  for (const os of ['web', 'ios']) {
    const escritos = [], hojas = []
    const compartir = cargar('src/lib/compartir.ts', {
      'react-native': { Platform: { OS: os }, Share: { share: async contenido => hojas.push(contenido.message) } },
      '../state/aviso': { avisar() {} },
      './portapapeles': { copiarAlPortapapeles: async texto => { escritos.push(texto); return true } },
      '../services/compartidos': { publicarCancion: async () => {} },
    })
    const listas = cargar('src/lib/compartirLista.ts', { './compartir': compartir })
    const jams = cargar('src/lib/invitarJam.ts', { './compartir': compartir })
    await compartir.compartirCancion({ videoId: 'propia:abc', title: 'Tema', artist: '' })
    await compartir.compartirPerfil('nihuel')
    await listas.compartirLista('lista', 'Lista')
    await listas.invitarAColaborar('lista', 'Lista')
    await jams.invitarAlJam('ABC123')
    assert.deepEqual(escritos, [
      compartir.linkDe('cancion', 'propia:abc'), compartir.linkDe('perfil', 'nihuel'),
      listas.linkDeLista('lista'), listas.linkParaColaborar('lista'), jams.linkDeJam('ABC123'),
    ])
    assert.equal(hojas.length, os === 'ios' ? 5 : 0)
    if (os === 'ios') hojas.forEach((mensaje, i) => assert.ok(mensaje.includes(escritos[i])))
  }
})
