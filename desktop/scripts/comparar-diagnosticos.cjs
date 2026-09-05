// Compara informes ya guardados; no hace pedidos a YouTube.
const { readFileSync } = require('node:fs')
const { basename } = require('node:path')
const archivos = process.argv.slice(2)
if (archivos.includes('--help')) {
  console.log('Uso: npm run comparar:youtube -- informe1.json informe2.json [...]')
  process.exit(0)
}
if (archivos.length < 2 || archivos.length > 20) {
  console.error('Indicá entre 2 y 20 informes JSON.')
  process.exit(2)
}
try {
  const filas = archivos.map(archivo => {
    const r = JSON.parse(readFileSync(archivo, 'utf8'))
    if (r.esquema !== 1 || !r.prueba || typeof r.ok !== 'boolean' || !Array.isArray(r.eventos)) {
      throw new Error(`Informe no compatible: ${basename(archivo)}`)
    }
    const formato = r.eventos.find(e => e.etapa === 'formato')
    return {
      archivo: basename(archivo), modo: r.prueba.modo,
      video: r.prueba.videoId ?? '—', cliente: formato?.cliente ?? r.prueba.cliente,
      resultado: r.ok ? 'OK' : r.error?.codigo ?? 'ERROR',
      segundos: (r.duracionMs / 1000).toFixed(2),
      bytes: r.resultado?.bytes ?? '—',
      rangos: r.eventos.filter(e => e.etapa === 'rango' && e.bytes).length,
      reintentos: r.eventos.filter(e => e.etapa === 'reintento').length,
      falloDesde: r.error?.desde ?? '—',
      audio: r.resultado?.validacion?.codec ?? 'sin validar',
      sha256: r.resultado?.sha256 ?? '—',
    }
  })
  console.table(filas)
  console.log('Los tiempos dependen de la red y del caché. Un éxito aislado no determina la causa de otro fallo.')
} catch (e) { console.error(e.message); process.exitCode = 2 }
