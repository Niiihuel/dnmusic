const { mintVideoToken } = require('../../dist/potoken.js')
const { ErrorDescargaYouTube } = require('../../dist/descarga-youtube.js')
require('../../dist/resolutor.js').resolverYAportar = async opciones => {
  process.send({ fixture: 'inicio', videoId: opciones.videoId })
  if (opciones.videoId === 'denied00000') throw new ErrorDescargaYouTube(403, 1048576, 60000)
  const token = await mintVideoToken(opciones.videoId)
  if (token !== 'token-de-prueba') throw new Error('Token incorrecto')
  process.send({ fixture: 'fin', videoId: opciones.videoId })
  return { path: opciones.videoId + '.m4a', cached: false, artworkPath: null, durationMs: 4000 }
}
