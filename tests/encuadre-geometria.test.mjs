import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

function cargar(path) {
  const exports = {}
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  new Function('exports', code)(exports)
  return exports
}
const g = cargar('src/ui/Encuadre.tsx')
const cerca = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`)

test('el rebote y halo completo caben dentro del clip en ambas vistas, incluso en escritorio', () => {
  const { margenLetra, ESCALA_MAX_LETRA } = cargar('src/ui/lyricsGeometry.ts')
  for (const w of [160, 320, 390, 768, 1440, 2560]) {
    for (const margen of [12, 20, 24]) {
      const inset = margenLetra(w, margen)
      assert.ok((w - 2 * inset) * ESCALA_MAX_LETRA + 20 <= w)
    }
  }
  const view = readFileSync('src/ui/LyricsView.tsx', 'utf8')
  assert.doesNotMatch(view, /flex-1 px-[56]/)
})

test('se puede mover una foto vertical sin acercar antes: el visor conserva el original', () => {
  const { w, h } = g.cajaOriginal(320, 200, .5)
  assert.deepEqual({ w, h }, { w: 320, h: 640 })
  const pos = g.limitarOriginal(0, .5, 1, 0, 320, 200, w, h, false)
  cerca(pos.y, .5)
  const style = g.estiloEncuadrado(320, { x: 0, y: .5, escala: 1, aspecto: .5 }, 200)
  cerca(style.height, 640)
  cerca(style.top, -120)
})

test('el punto bajo los dedos no salta al ampliar', () => {
  const antes = { x: .1, y: -.2 }, foco = { x: 80, y: 60 }
  const next = g.zoomEnFoco(antes.x, antes.y, 1.25, 2.5, foco.x, foco.y, 320, 200)
  cerca((foco.x - 160 - antes.x * 320) / 1.25, (foco.x - 160 - next.x * 320) / 2.5)
  cerca((foco.y - 100 - antes.y * 200) / 1.25, (foco.y - 100 - next.y * 200) / 2.5)
})

test('rotación, zoom y desplazamiento nunca dejan esquinas vacías; el render respeta la misma geometría', () => {
  for (const aspecto of [.4, .75, 1, 1.5, 3]) for (const rot of [-180, -95, -45, 0, 30, 90, 175]) {
    const w = 320, h = 200, base = g.cajaOriginal(w, h, aspecto)
    const escala = g.escalaOriginal(rot, w, h, base.w, base.h, false)
    const pos = g.limitarOriginal(20, -20, escala, rot, w, h, base.w, base.h, false)
    const rad = -rot * Math.PI / 180
    for (const x of [-w / 2, w / 2]) for (const y of [-h / 2, h / 2]) {
      const dx = x - pos.x * w, dy = y - pos.y * h
      assert.ok(Math.abs(Math.cos(rad) * dx - Math.sin(rad) * dy) <= base.w * escala / 2 + 1e-7)
      assert.ok(Math.abs(Math.sin(rad) * dx + Math.cos(rad) * dy) <= base.h * escala / 2 + 1e-7)
    }
    const style = g.estiloEncuadrado(w, { ...pos, aspecto, rotacion: rot, escala }, h)
    cerca(style.width, base.w * escala)
    cerca(style.left, (w - base.w * escala) / 2 + pos.x * w)
  }
})

test('los encuadres existentes sin aspecto mantienen su representación', () => {
  assert.deepEqual(g.estiloEncuadrado(100, { x: .2, y: -.1, escala: 2 }), {
    position: 'absolute', width: 200, height: 200, left: -30, top: -60,
  })
})

test('resize tiene tolerancia para no oscilar en el punto de encastre', () => {
  const { objetivoResizeMosaico: resize } = cargar('src/ui/mosaicoResize.ts')
  const inicio = { w: 600, h: 300, mosaico: 600, filas: 1 }
  for (const dx of [-143, -138, -133]) {
    assert.equal(resize(inicio, dx, 0, { cols: 1, filas: 1 }).cols, 1)
    assert.equal(resize(inicio, dx, 0, { cols: 2, filas: 1 }).cols, 2)
  }
})
