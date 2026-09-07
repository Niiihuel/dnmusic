/** Normalizador puro: no hace peticiones ni necesita credenciales. */
export const FUENTE_DISCORD = 'https://raw.githubusercontent.com/aamiaa/discord-api-diff/main/collectibles.json'
export const TIPOS_DISCORD = ['marco', 'efecto', 'placa', 'marcoPerfil']
export const BASE_DISCORD = { colecciones: 101, marco: 704, efecto: 369, placa: 279, marcoPerfil: 55, paquetes: 256 }
const CDN = 'https://cdn.discordapp.com'
const HOSTS = new Set(['cdn.discordapp.com', 'media.discordapp.net'])
const SKU = /^[1-9]\d{16,19}$/
const fail = (message) => { throw new Error(`Catálogo Discord: ${message}`) }
const objeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const texto = (v, campo) => typeof v === 'string' && v.trim() ? v.trim() : fail(`${campo} vacío o inválido`)
export function skuDiscord(v) {
  if (typeof v !== 'string' || !SKU.test(v) || BigInt(v) > 18446744073709551615n) fail(`SKU inválido: ${String(v)}`)
  return v
}
const idDiscord = (v) => `discord:${skuDiscord(v)}`
export function urlDiscord(v) {
  if (typeof v !== 'string' || !v.startsWith('https://') || /[\s\\]/.test(v)) fail('URL CDN inválida')
  let u
  try { u = new URL(v) } catch { fail('URL CDN inválida') }
  if (!HOSTS.has(u.hostname) || u.username || u.password || u.port || u.hash) fail(`URL fuera del CDN permitido: ${v}`)
  return v
}
const urlOpcional = (v) => v == null ? undefined : urlDiscord(v)
const numero = (v, campo, min = 0) => typeof v === 'number' && Number.isFinite(v) && v >= min ? v : fail(`${campo} inválido`)
const booleano = (v, campo) => typeof v === 'boolean' ? v : fail(`${campo} inválido`)
const lista = (v, campo) => Array.isArray(v) ? v : fail(`${campo} debe ser una lista`)
const limpiar = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))
const color = (v) => Number.isInteger(v) && v >= 0 && v <= 0xffffff ? `#${v.toString(16).padStart(6, '0')}` : fail('color inválido')
const estable = (v) => JSON.stringify(v, function (_k, value) {
  return objeto(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value
})

function efectoDe(e) {
  if (!objeto(e)) fail('capa de efecto inválida')
  return limpiar({
    src: urlDiscord(e.src), loop: booleano(e.loop, 'loop'),
    duration: numero(e.duration, 'duration'), start: numero(e.start, 'start'),
    loopDelay: numero(e.loopDelay, 'loopDelay'), zIndex: numero(e.zIndex, 'zIndex', -Infinity),
    position: e.position == null ? undefined : { x: numero(e.position.x, 'position.x', -Infinity), y: numero(e.position.y, 'position.y', -Infinity) },
    width: e.width == null ? undefined : numero(e.width, 'width', 1),
    height: e.height == null ? undefined : numero(e.height, 'height', 1),
    randomizedSources: e.randomizedSources == null || e.randomizedSources.length === 0 ? undefined :
      lista(e.randomizedSources, 'randomizedSources').map((s) => urlDiscord(typeof s === 'string' ? s : s?.src)),
  })
}
function capaDe(c) {
  if (!objeto(c)) fail('capa de marco inválida')
  for (const [k, options] of Object.entries({ type: ['staple', 'border', 'rail'], order: ['front', 'back'], anchor: ['top', 'bottom', 'center'] })) {
    if (!options.includes(c[k])) fail(`capa.${k} desconocido: ${c[k]}`)
  }
  return { id: skuDiscord(c.id), type: c.type, order: c.order, anchor: c.anchor, responsive: c.responsive == null ? false : booleano(c.responsive, 'responsive') }
}
function piezaDe(item) {
  if (!objeto(item) || !Number.isInteger(item.type) || !TIPOS_DISCORD[item.type]) fail('tipo de pieza desconocido')
  const p = { id: idDiscord(item.sku_id), tipo: TIPOS_DISCORD[item.type] }
  if (item.assets != null && !objeto(item.assets)) fail('assets inválido')
  const assets = item.assets ?? {}
  const staticUrl = urlOpcional(assets.static_image_url)
  const animatedUrl = urlOpcional(assets.animated_image_url)
  const videoUrl = urlOpcional(assets.video_url)
  if (item.type === 0) {
    if (item.asset != null && !/^(?:a_)?[a-f0-9]{32}$/.test(item.asset)) fail('asset de avatar inválido')
    p.asset = item.asset
    p.preview = animatedUrl ?? (item.asset ? `${CDN}/avatar-decoration-presets/${item.asset}.png?size=240&passthrough=true` : undefined)
    p.staticPreview = staticUrl ?? (item.asset ? `${CDN}/avatar-decoration-presets/${item.asset}.png?size=240&passthrough=false` : undefined)
  } else if (item.type === 1) {
    p.preview = urlOpcional(item.thumbnailPreviewSrc)
    p.staticPreview = urlOpcional(item.staticFrameSrc)
    p.reducedMotionSrc = urlOpcional(item.reducedMotionSrc)
    if (item.effects == null) {
      skuDiscord(item.id) // Referencia parcial legítima del archivo upstream.
    } else if (!lista(item.effects, 'effects').length) fail('effects vacío')
    p.efectos = item.effects == null ? undefined : item.effects.map(efectoDe)
    p.animationType = item.animationType == null ? undefined : numero(item.animationType, 'animationType')
  } else if (item.type === 2) {
    if (item.asset != null && (!/^nameplates\/(?:[^/\\%?#\s]+\/)+$/.test(item.asset) || item.asset.split('/').some((s) => s === '.' || s === '..'))) fail('asset de placa inválido')
    p.asset = item.asset
    const ruta = item.asset?.split('/').map(encodeURIComponent).join('/')
    p.staticPreview = staticUrl ?? (item.asset ? `${CDN}/assets/collectibles/${ruta}static.png` : undefined)
    p.preview = animatedUrl ?? p.staticPreview
    p.videoSrc = videoUrl ?? (item.asset ? `${CDN}/assets/collectibles/${ruta}asset.webm` : undefined)
    p.palette = item.palette == null ? undefined : texto(item.palette, 'palette')
  } else {
    p.capas = item.layers == null ? undefined : lista(item.layers, 'layers').map(capaDe)
    if (p.capas && new Set(p.capas.map((c) => c.id)).size !== p.capas.length) fail('capas duplicadas')
    for (const [dest, source] of Object.entries({ innerWidth: 'inner_width', overflowTop: 'overflow_top', overflowBottom: 'overflow_bottom', overflowHorizontal: 'overflow_horizontal' })) {
      p[dest] = item[source] == null ? undefined : numero(item[source], source, dest === 'innerWidth' ? 1 : 0)
    }
  }
  p.etiqueta = item.label ?? item.accessibilityLabel
  if (p.etiqueta != null) p.etiqueta = texto(p.etiqueta, 'etiqueta')
  return limpiar(p)
}

/** Une registros parciales del mismo SKU; nunca sobrescribe dos recursos distintos. */
function fusionar(prev, next) {
  if (!prev) return next
  for (const [key, value] of Object.entries(next)) {
    if (prev[key] !== undefined && estable(prev[key]) !== estable(value)) fail(`SKU duplicado conflictivo ${next.id} (${key})`)
  }
  return { ...prev, ...next }
}

export function contarCatalogo(c) {
  return { colecciones: c.colecciones.length, ...Object.fromEntries(TIPOS_DISCORD.map((t) => [t, c.piezas.filter((p) => p.tipo === t).length])), paquetes: c.paquetes.length }
}

/** No descarta piezas rotas silenciosamente: una importación inválida no reemplaza el snapshot. */
export function normalizarDiscord(entrada, { actualizado, fuente = FUENTE_DISCORD, sha256 } = {}) {
  if (typeof actualizado !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(actualizado) || Number.isNaN(Date.parse(actualizado)) || new Date(actualizado).toISOString().slice(0, 10) !== actualizado) fail('actualizado debe ser una fecha YYYY-MM-DD válida')
  if (fuente !== FUENTE_DISCORD) fail('fuente desconocida')
  if (sha256 !== undefined && !/^[a-f0-9]{64}$/.test(sha256)) fail('sha256 inválido')
  const colecciones = new Map(), piezas = new Map(), metadatos = new Map(), paquetes = new Map()
  const productos = [], nombres = new Map()
  for (const c of lista(entrada, 'colecciones')) {
    if (!objeto(c)) fail('colección inválida')
    const colores = c.styles?.background_colors
    if (colores != null) lista(colores, 'background_colors')
    const coleccion = limpiar({ id: idDiscord(c.sku_id), nombre: texto(c.name, 'colección.nombre'), colores: colores?.length ? [color(colores[0]), color(colores[1] ?? colores[0])] : ['#232428', '#111214'], banner: urlOpcional(c.catalog_banner_url ?? c.hero_banner_url) })
    colecciones.set(coleccion.id, fusionar(colecciones.get(coleccion.id), coleccion))
    for (const p of lista(c.products, 'products')) {
      if (!objeto(p)) fail('producto inválido')
      idDiscord(p.sku_id)
      texto(p.name, 'producto.nombre')
      if (p.type === 3000) continue // Créditos Nitro: no son cosméticos.
      if (![0, 1, 2, 3, 1000, 2000].includes(p.type)) fail(`tipo de producto desconocido ${p.type}`)
      if (p.type < 4) nombres.set(p.sku_id, p.name)
      for (const b of p.bundled_products ?? []) {
        skuDiscord(b.sku_id)
        if (!TIPOS_DISCORD[b.type]) fail('tipo de miembro de paquete inválido')
        if (!nombres.has(b.sku_id)) nombres.set(b.sku_id, texto(b.name, 'miembro.nombre'))
      }
      productos.push({ p, coleccion })
    }
  }
  for (const { p, coleccion } of productos) {
    const items = lista(p.items, 'items')
    if (!items.length) fail(`producto sin piezas ${p.sku_id}`)
    const refs = new Map()
    for (const item of items) {
      const pieza = piezaDe(item)
      if (p.type < 4 && item.type !== p.type) fail(`tipo de ítem incompatible con producto ${p.sku_id}`)
      piezas.set(pieza.id, fusionar(piezas.get(pieza.id), pieza))
      const previo = metadatos.get(pieza.id)
      const nombre = nombres.get(item.sku_id) ?? item.title ?? (items.length > 1 && p.type !== 1000 ? `${p.name} · ${item.sku_id}` : p.name)
      const canonico = p.type < 4 && p.sku_id === item.sku_id
      const meta = { nombre: texto(nombre, 'pieza.nombre'), coleccionId: coleccion.id, coleccion: coleccion.nombre, canonico, coleccionIds: [...new Set([...(previo?.coleccionIds ?? []), coleccion.id])] }
      metadatos.set(pieza.id, previo?.canonico && !canonico ? { ...previo, coleccionIds: meta.coleccionIds } : meta)
      refs.set(pieza.id, pieza.tipo)
    }
    if (p.type !== 1000) continue
    for (const b of p.bundled_products ?? []) {
      if (refs.get(idDiscord(b.sku_id)) !== TIPOS_DISCORD[b.type]) fail(`paquete incompleto ${p.sku_id}: ${b.sku_id}`)
    }
    const seleccion = {}, alternativas = {}
    for (const [id, tipo] of refs) {
      seleccion[tipo] ??= id
      ;(alternativas[tipo] ??= []).push(id)
    }
    const multiples = Object.fromEntries(Object.entries(alternativas).filter(([, ids]) => ids.length > 1))
    const paquete = limpiar({ id: idDiscord(p.sku_id), nombre: p.name, coleccionId: coleccion.id, coleccion: coleccion.nombre, piezas: seleccion, alternativas: Object.keys(multiples).length ? multiples : undefined, preview: urlOpcional(p.preview_assets?.fg_static), fondoPreview: urlOpcional(p.preview_assets?.bg_static) })
    const previo = paquetes.get(paquete.id)
    // Una promoción puede repetir el paquete en otra colección.
    if (previo && (estable(previo.piezas) !== estable(paquete.piezas) || estable(previo.alternativas) !== estable(paquete.alternativas))) fail(`paquete duplicado conflictivo ${paquete.id}`)
    if (!previo) paquetes.set(paquete.id, paquete)
  }
  const resultado = []
  for (const pieza of piezas.values()) {
    if (pieza.tipo === 'marco' && !pieza.preview || pieza.tipo === 'placa' && !pieza.preview || pieza.tipo === 'marcoPerfil' && (!pieza.capas?.length || !pieza.innerWidth)) fail(`pieza incompleta ${pieza.id}`)
    if (pieza.tipo === 'efecto' && !pieza.efectos?.length) {
      pieza.disponible = false
      pieza.motivoNoDisponible = 'La fuente solo incluye el identificador; faltan los recursos del efecto.'
    }
    const { canonico: _canonico, coleccionIds, ...meta } = metadatos.get(pieza.id)
    resultado.push({ ...pieza, ...meta, ...(coleccionIds.length > 1 ? { coleccionIds } : {}) })
  }
  for (const paquete of paquetes.values()) {
    if (Object.entries(paquete.piezas).some(([tipo, id]) => (paquete.alternativas?.[tipo] ?? [id]).every((opcion) => piezas.get(opcion)?.disponible === false))) paquete.disponible = false
  }
  if (!resultado.length) fail('catálogo vacío')
  return limpiar({ version: 1, actualizado, fuente, sha256, piezas: resultado, paquetes: [...paquetes.values()], colecciones: [...colecciones.values()] })
}
