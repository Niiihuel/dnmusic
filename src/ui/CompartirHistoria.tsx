import { useEffect, useRef, useState } from 'react'
import { AppState, View } from 'react-native'
import { captureRef, releaseCapture } from 'react-native-view-shot'
import * as Sharing from 'expo-sharing'
import type { PlaylistTrack } from '../services/playlists'
import { artworkSource } from '../lib/artwork'
import { proxiedImage } from '../services/music'
import { avisar } from '../state/aviso'
import { createStore, useStore } from '../state/store'
import { getSession, useUser } from '../state/session'
import { matrizQR } from '../lib/codigoQR'
import { linkDe } from '../lib/compartir'
import { publicarCancion } from '../services/compartidos'
import { ES_WEB } from './Glass'
import { TarjetaHistoria, type DatosTarjeta } from './TarjetaHistoria'
import {
  ALTO,
  ANCHO,
  ARTISTA_SALTO,
  ARTISTA_TAM,
  FONDO,
  FONDO_ESCALA,
  FONDO_OPACIDAD,
  LEYENDA,
  LEYENDA_PIE,
  LEYENDA_TAM,
  LEYENDA_TAM_CHICO,
  MARGEN,
  NOMBRE_TAM,
  PLACA,
  QR_LADO,
  QR_MARGEN,
  QR_RADIO,
  QR_Y,
  SELLO_LADO,
  SELLO_RADIO,
  SELLO_Y,
  TAPA,
  TAPA_RADIO,
  TAPA_Y,
  TEXTO,
  TEXTO_SUAVE,
  TEXTO_TENUE,
  TITULO_INTERLINEA,
  TITULO_TAM,
  TITULO_Y,
  VELO,
} from './geometriaTarjetaHistoria'

/**
 * La canción que suena, hecha imagen para una historia.
 *
 * **En el teléfono** se dibuja la tarjeta fuera de pantalla, se captura y se
 * abre la hoja de compartir del sistema con los destinos instalados compatibles. No hay integración directa con
 * `instagram-stories://` a propósito — exige claves de pasteboard que requieren
 * módulo nativo propio. Cada destino decide qué hacer con la imagen recibida.
 *
 * **En la web** no hay hoja que valga: se pinta la misma tarjeta en un canvas y
 * se descarga como PNG.
 *
 * La tarjeta en sí vive en `TarjetaHistoria.tsx` y sus medidas en
 * `geometriaTarjetaHistoria.ts`, porque la hoja de compartir la muestra como vista
 * previa antes de mandarla: la previa y lo que sale tienen que ser lo mismo.
 */

type Pedido = { id: number; ownerId: string | null; track: PlaylistTrack | null; tinte: string | null }

const store = createStore<Pedido>({ id: 0, ownerId: null, track: null, tinte: null })

/** La preparación y la hoja del sistema comparten una única solicitud. */
export function historiaEnCurso() { return store.get().track !== null }

function cuentaVigente(ownerId: string | null) {
  const session = getSession()
  return !!ownerId && session.user?.id === ownerId && session.access?.status === 'approved'
}

/** Los datos de la tarjeta de una canción: lo mismo para la previa y la captura. */
export function datosDeTarjeta(track: PlaylistTrack, tinte: string | null = null): DatosTarjeta {
  return {
    titulo: track.title,
    artista: track.artist,
    arte: artworkSource(track.artworkPath, track.artworkUrl, 1000),
    enlace: linkDe('cancion', track.videoId),
    tinte,
  }
}

/** Comparte una tarjeta propia; los destinos disponibles los determina iOS o Android. */
export function compartirHistoria(track: PlaylistTrack, tinte: string | null = null) {
  const ownerId = getSession().user?.id ?? null
  if (!ES_WEB && (historiaEnCurso() || AppState.currentState !== 'active' || !cuentaVigente(ownerId))) return false
  void publicarCancion(track).catch(() => {})
  if (ES_WEB) {
    void dibujarYDescargar(track, tinte)
    return true
  }
  store.set({ id: store.get().id + 1, ownerId, track: { ...track }, tinte })
  return true
}

/* ── Nativo: la vista fuera de pantalla y su captura ──────────────────────── */

/**
 * Va montado una sola vez en el layout, como `MotorAudio`. No dibuja nada
 * visible: cuando alguien pide compartir, arma la tarjeta fuera de la pantalla,
 * espera la carátula, captura y abre la hoja del sistema.
 */
export function CompartirHistoria() {
  const { id, ownerId, track, tinte } = useStore(store, (s) => s)
  const userId = useUser()?.id
  const ref = useRef<View>(null)
  const procesando = useRef<number | null>(null)
  // Una tapa nueva de la misma canción también debe esperar su propia carga.
  const [tapaDe, setTapaDe] = useState<number | null>(null)
  const datos = track ? datosDeTarjeta(track, tinte) : null
  const tapaLista = track !== null && tapaDe === id

  useEffect(() => {
    if (!track) return
    const cancelarPendiente = () => {
      if (procesando.current !== id && store.get().id === id) store.set({ track: null, tinte: null })
    }
    if (ownerId !== userId || !cuentaVigente(ownerId)) { cancelarPendiente(); return }
    const sub = AppState.addEventListener('change', estado => { if (estado !== 'active') cancelarPendiente() })
    const limite = setTimeout(() => {
      if (procesando.current !== id && store.get().id === id) {
        cancelarPendiente()
        avisar('No se pudo preparar la imagen. Intentá de nuevo.', true)
      }
    }, 12000)
    return () => { sub.remove(); clearTimeout(limite); cancelarPendiente() }
  }, [id, ownerId, track, userId])

  useEffect(() => {
    if (!track || ownerId !== userId || (datos?.arte && !tapaLista)) return
    let vigente = true
    const t = setTimeout(() => {
      if (procesando.current === id) return
      procesando.current = id
      void (async () => {
        let uri: string | undefined
        try {
          if (!(await Sharing.isAvailableAsync())) {
            avisar('Este aparato no deja compartir imágenes.')
            return
          }
          if (!vigente || AppState.currentState !== 'active' || !cuentaVigente(ownerId)) return
          uri = await captureRef(ref, { format: 'png', quality: 1, result: 'tmpfile' })
          if (!vigente || AppState.currentState !== 'active' || !cuentaVigente(ownerId)) return
          await Sharing.shareAsync(uri, {
            mimeType: 'image/png', UTI: 'public.png',
            dialogTitle: `${track.title} — ${track.artist}`,
          })
        } catch (e) {
          const texto = e instanceof Error ? e.message : ''
          if (vigente && !/cancel/i.test(texto)) avisar('No se pudo armar la historia.', true)
        } finally {
          if (uri) releaseCapture(uri)
          if (store.get().id === id) store.set({ track: null, tinte: null })
          if (procesando.current === id) procesando.current = null
        }
      })()
    }, 80)
    return () => { vigente = false; clearTimeout(t) }
  }, [id, ownerId, track, datos?.arte, tapaLista, userId])

  if (!track || !datos || ownerId !== userId) return null

  return (
    <View
      ref={ref}
      collapsable={false}
      /* Sólo se captura esta tarjeta; nunca la pantalla, el aviso ni los chats. */
      style={{ position: 'absolute', left: -ANCHO * 2, top: 0 }}
    >
      <TarjetaHistoria key={id} datos={datos} onArteListo={() => setTapaDe(id)} />
    </View>
  )
}

/* ── Web: el mismo diseño, pintado en un canvas ───────────────────────────── */

function cargarImagen(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    // Sin esto el canvas queda «tainted» y no se puede exportar.
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('No cargó la carátula'))
    img.src = url
  })
}

/** Las tapas de Google no mandan CORS: van por nuestro proxy, como en la UI. */
function conCors(url: string): string {
  return /googleusercontent\.com|ggpht\.com|ytimg\.com/.test(url) ? proxiedImage(url) : url
}

/** Un rectángulo redondeado como camino, para clip o relleno. */
function caminoRedondo(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

const FUENTE = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

/** Corta con puntos suspensivos lo que no entra en el ancho dado. */
function acotar(ctx: CanvasRenderingContext2D, texto: string, ancho: number): string {
  if (ctx.measureText(texto).width <= ancho) return texto
  let corte = texto
  while (corte.length > 1 && ctx.measureText(`${corte}…`).width > ancho) corte = corte.slice(0, -1)
  return `${corte}…`
}

/** Parte el título en dos líneas como mucho, igual que `numberOfLines={2}`. */
function enDosLineas(ctx: CanvasRenderingContext2D, texto: string, ancho: number): string[] {
  if (ctx.measureText(texto).width <= ancho) return [texto]
  const palabras = texto.split(' ')
  let primera = ''
  let i = 0
  while (i < palabras.length) {
    const intento = primera ? `${primera} ${palabras[i]}` : palabras[i]
    if (ctx.measureText(intento).width > ancho) break
    primera = intento
    i++
  }
  if (!primera) return [acotar(ctx, texto, ancho)]
  return [primera, acotar(ctx, palabras.slice(i).join(' '), ancho)]
}

async function dibujarYDescargar(track: PlaylistTrack, tinte: string | null) {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = ANCHO
    canvas.height = ALTO
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Sin canvas')

    ctx.fillStyle = FONDO
    ctx.fillRect(0, 0, ANCHO, ALTO)

    const fuente = artworkSource(track.artworkPath, track.artworkUrl, 1000)
    const arte = fuente ? await cargarImagen(conCors(fuente)).catch(() => null) : null

    if (arte) {
      /* El ambiente: la tapa estirada a todo el cuadro, desenfocada, con la
         misma escala que la vista nativa para que no queden bordes lavados. */
      const escala = Math.max(ANCHO / arte.width, ALTO / arte.height) * FONDO_ESCALA
      const w = arte.width * escala
      const h = arte.height * escala
      ctx.save()
      ctx.filter = 'blur(80px) saturate(1.35)'
      ctx.globalAlpha = FONDO_OPACIDAD
      ctx.drawImage(arte, (ANCHO - w) / 2, (ALTO - h) / 2, w, h)
      ctx.restore()
    }

    if (tinte) {
      const bano = ctx.createLinearGradient(0, 0, 0, ALTO)
      bano.addColorStop(0, conAlfaCanvas(tinte, 0.55))
      bano.addColorStop(0.5, conAlfaCanvas(tinte, 0.12))
      bano.addColorStop(1, conAlfaCanvas(tinte, 0.45))
      ctx.fillStyle = bano
      ctx.fillRect(0, 0, ANCHO, ALTO)
    }

    const velo = ctx.createLinearGradient(0, 0, 0, ALTO)
    for (const { parada, color } of VELO) velo.addColorStop(parada, color)
    ctx.fillStyle = velo
    ctx.fillRect(0, 0, ANCHO, ALTO)

    // La firma, arriba a la izquierda.
    dibujarSello(ctx, MARGEN, SELLO_Y, SELLO_LADO)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = TEXTO
    ctx.font = `700 ${NOMBRE_TAM}px ${FUENTE}`
    ctx.fillText('dnmusic', MARGEN + SELLO_LADO + 22, SELLO_Y + SELLO_LADO / 2 + NOMBRE_TAM * 0.36)

    // La tapa, con sombra y esquinas redondeadas.
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.55)'
    ctx.shadowBlur = 70
    ctx.shadowOffsetY = 28
    ctx.fillStyle = '#181818'
    caminoRedondo(ctx, MARGEN, TAPA_Y, TAPA, TAPA, TAPA_RADIO)
    ctx.fill()
    ctx.restore()
    if (arte) {
      ctx.save()
      caminoRedondo(ctx, MARGEN, TAPA_Y, TAPA, TAPA, TAPA_RADIO)
      ctx.clip()
      ctx.drawImage(arte, MARGEN, TAPA_Y, TAPA, TAPA)
      ctx.restore()
    } else {
      /* Sin carátula, el sello grande y apagado en vez de un cuadrado negro. */
      ctx.save()
      ctx.globalAlpha = 0.14
      dibujarSello(ctx, MARGEN + TAPA / 2 - TAPA * 0.16, TAPA_Y + TAPA / 2 - TAPA * 0.16, TAPA * 0.32)
      ctx.restore()
    }

    // Título en dos líneas como mucho, y el artista debajo de la última.
    ctx.fillStyle = TEXTO
    ctx.font = `800 ${TITULO_TAM}px ${FUENTE}`
    const lineas = enDosLineas(ctx, track.title, TAPA)
    lineas.forEach((linea, i) => {
      ctx.fillText(linea, MARGEN, TITULO_Y + TITULO_TAM + i * TITULO_INTERLINEA)
    })
    const baseArtista = TITULO_Y + TITULO_TAM + (lineas.length - 1) * TITULO_INTERLINEA + ARTISTA_SALTO + ARTISTA_TAM
    ctx.fillStyle = TEXTO_SUAVE
    ctx.font = `400 ${ARTISTA_TAM}px ${FUENTE}`
    ctx.fillText(acotar(ctx, track.artist, TAPA), MARGEN, baseArtista)

    // El código escaneable: la foto vuelve a ser un link.
    ctx.fillStyle = PLACA
    caminoRedondo(ctx, MARGEN, QR_Y, QR_LADO, QR_LADO, QR_RADIO)
    ctx.fill()
    const matriz = matrizQR(linkDe('cancion', track.videoId))
    if (matriz) {
      const util = QR_LADO - QR_MARGEN * 2
      const modulo = util / matriz.lado
      ctx.fillStyle = FONDO
      for (let fila = 0; fila < matriz.lado; fila++) {
        for (let col = 0; col < matriz.lado; col++) {
          if (!matriz.puntos[fila * matriz.lado + col]) continue
          ctx.fillRect(
            MARGEN + QR_MARGEN + col * modulo,
            QR_Y + QR_MARGEN + fila * modulo,
            /* Un pelo de más: sin esto quedan hilos del fondo entre módulos. */
            modulo + 0.5,
            modulo + 0.5,
          )
        }
      }
    }
    ctx.fillStyle = TEXTO
    ctx.font = `600 ${LEYENDA_TAM}px ${FUENTE}`
    ctx.fillText(LEYENDA, MARGEN + QR_LADO + 34, QR_Y + QR_LADO / 2 - 4)
    ctx.fillStyle = TEXTO_TENUE
    ctx.font = `400 ${LEYENDA_TAM_CHICO}px ${FUENTE}`
    ctx.fillText(LEYENDA_PIE, MARGEN + QR_LADO + 34, QR_Y + QR_LADO / 2 + LEYENDA_TAM_CHICO + 8)

    const enlace = document.createElement('a')
    enlace.download = `${track.title} — ${track.artist}.png`.replace(/[/\\?%*:|"<>]/g, '-')
    enlace.href = canvas.toDataURL('image/png')
    enlace.click()
  } catch {
    avisar('No se pudo armar la historia.', true)
  }
}

/** El sello de la app: el cuadrado blanco con el play. El mismo de la vista. */
function dibujarSello(ctx: CanvasRenderingContext2D, x: number, y: number, lado: number) {
  const escala = lado / SELLO_LADO
  ctx.save()
  ctx.fillStyle = PLACA
  caminoRedondo(ctx, x, y, lado, lado, SELLO_RADIO * escala)
  ctx.fill()
  ctx.fillStyle = FONDO
  ctx.beginPath()
  ctx.moveTo(x + lado / 2 - 11 * escala, y + lado / 2 - 16 * escala)
  ctx.lineTo(x + lado / 2 + 15 * escala, y + lado / 2)
  ctx.lineTo(x + lado / 2 - 11 * escala, y + lado / 2 + 16 * escala)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

/** `#rrggbb` con alfa. Igual que `conAlfa`, sin traerse React al canvas. */
function conAlfaCanvas(hex: string, alfa: number): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim())
  if (!m) return `rgba(31,31,31,${alfa})`
  return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${alfa})`
}
