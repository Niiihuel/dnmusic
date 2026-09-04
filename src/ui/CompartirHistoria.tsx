import { useEffect, useRef, useState } from 'react'
import { Image, StyleSheet, Text, View } from 'react-native'
import { captureRef } from 'react-native-view-shot'
import * as Sharing from 'expo-sharing'
import { LinearGradient } from 'expo-linear-gradient'
import type { PlaylistTrack } from '../services/playlists'
import { artworkSource } from '../lib/artwork'
import { proxiedImage } from '../services/music'
import { avisar } from '../state/aviso'
import { createStore, useStore } from '../state/store'
import { formatClock } from './SeekBar'
import { ES_WEB } from './Glass'

/**
 * La canción que suena, hecha imagen para una historia de Instagram.
 *
 * Una tarjeta de 1080×1920 —el formato exacto de una historia— con el mismo
 * lenguaje de la pantalla «Sonando»: la carátula pone el único color, estirada
 * y desenfocada de fondo con un velo encima, la tapa entera al medio con su
 * sombra, y debajo el título, el artista y **una barra de reproducción** —el
 * gesto que hace que la tarjeta se lea como música y no como una foto suelta,
 * el mismo recurso de las tarjetas de Spotify y Apple Music—. Abajo firma la
 * app con su sello, chiquito.
 *
 * **En el teléfono** se dibuja una vista fuera de pantalla, se captura y se
 * abre la hoja de compartir del sistema: Instagram aparece ahí y ofrece
 * «Agregar a tu historia». No hay integración directa con el esquema de
 * `instagram-stories://` a propósito — exige claves de pasteboard que
 * requieren módulo nativo propio; la hoja del sistema hace lo mismo con un
 * toque más.
 *
 * **En la web** no hay hoja que valga: se dibuja la misma tarjeta en un canvas
 * y se descarga como PNG, lista para subir desde el teléfono o el Instagram
 * web.
 */

const ANCHO = 1080
const ALTO = 1920
/** Lado de la tapa central y su posición. */
const TAPA = 820
const TAPA_X = (ANCHO - TAPA) / 2
const TAPA_Y = 300
/** La barra finge una reproducción a poco más de un tercio: se lee «sonando». */
const AVANCE = 0.38
const FONDO = '#0B0B0B'

type Pedido = { track: PlaylistTrack | null }

const store = createStore<Pedido>({ track: null })

/** El reloj de la barra, coherente consigo mismo: el transcurrido es una
 *  fracción real de la duración, no un número inventado. */
function tiempos(durationMs: number): { ido: string; total: string } {
  return { ido: formatClock(durationMs * AVANCE), total: formatClock(durationMs) }
}

/** Compartir esta canción como historia. El camino depende de la plataforma. */
export function compartirHistoria(track: PlaylistTrack) {
  if (ES_WEB) {
    void dibujarYDescargar(track)
    return
  }
  store.set({ track })
}

/* ── Nativo: la vista fuera de pantalla y su captura ──────────────────────── */

/**
 * Va montado una sola vez en el layout, como `MotorAudio`. No dibuja nada
 * visible: cuando alguien pide compartir, arma la tarjeta fuera de la
 * pantalla, espera la carátula, captura y abre la hoja del sistema.
 */
export function CompartirHistoria() {
  const track = useStore(store, (s) => s.track)
  const ref = useRef<View>(null)
  /*
   * La captura no puede correr antes de que la carátula haya cargado: saldría
   * la tarjeta con el recuadro vacío. Se guarda **de qué canción** cargó la
   * tapa: «todavía no está» es «lo cargado no es de esta», sin ningún efecto
   * que resetee — mismo criterio que las URLs firmadas del motor.
   */
  const [tapaDe, setTapaDe] = useState<string | null>(null)
  const tapaLista = track !== null && tapaDe === track.id
  const arte = track ? artworkSource(track.artworkPath, track.artworkUrl, 1000) : null

  useEffect(() => {
    if (!track || (arte && !tapaLista)) return
    /* Un respiro para que la vista termine de acomodarse antes de la foto. */
    const t = setTimeout(() => {
      void (async () => {
        try {
          const uri = await captureRef(ref, { format: 'png', quality: 1, result: 'tmpfile' })
          if (!(await Sharing.isAvailableAsync())) {
            avisar('Este aparato no deja compartir imágenes.')
            return
          }
          await Sharing.shareAsync(uri, {
            mimeType: 'image/png',
            dialogTitle: `${track.title} — ${track.artist}`,
          })
        } catch (e) {
          /* Cerrar la hoja sin elegir nada también rechaza: eso no es un error. */
          const texto = e instanceof Error ? e.message : ''
          if (!/cancel/i.test(texto)) avisar('No se pudo armar la historia.', true)
        } finally {
          store.set({ track: null })
        }
      })()
    }, 80)
    return () => clearTimeout(t)
  }, [track, arte, tapaLista])

  if (!track) return null

  const { ido, total } = tiempos(track.durationMs)

  return (
    <View
      ref={ref}
      collapsable={false}
      /* Fuera de la pantalla, no invisible: con `opacity: 0` u `display: none`
         la captura sale negra en iOS. */
      style={{
        position: 'absolute',
        left: -ANCHO * 2,
        top: 0,
        width: ANCHO,
        height: ALTO,
        backgroundColor: FONDO,
        overflow: 'hidden',
      }}
    >
      {arte ? (
        <Image
          source={{ uri: arte }}
          onLoad={() => setTapaDe(track.id)}
          onError={() => setTapaDe(track.id)}
          style={[StyleSheet.absoluteFill, { transform: [{ scale: 1.35 }], opacity: 0.6 }]}
          blurRadius={45}
        />
      ) : null}
      {/* Velo pesado abajo: la mitad de arriba deja ver el color de la tapa, la
          de abajo se oscurece para que el título y la barra se lean. */}
      <LinearGradient
        colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0.30)', 'rgba(0,0,0,0.78)', 'rgba(0,0,0,0.96)']}
        locations={[0, 0.42, 0.78, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* El rótulo que enmarca la tarjeta: «esto es lo que suena». */}
      <Text
        style={{
          position: 'absolute',
          top: 188,
          alignSelf: 'center',
          color: 'rgba(255,255,255,0.72)',
          fontSize: 30,
          fontWeight: '700',
          letterSpacing: 7,
        }}
      >
        AHORA SUENA
      </Text>

      {/* La tapa, con sombra suave. */}
      <View
        style={{
          position: 'absolute',
          left: TAPA_X,
          top: TAPA_Y,
          width: TAPA,
          height: TAPA,
          borderRadius: 44,
          backgroundColor: '#181818',
          shadowColor: '#000',
          shadowOpacity: 0.5,
          shadowRadius: 48,
          shadowOffset: { width: 0, height: 24 },
        }}
      >
        {arte ? (
          <Image
            source={{ uri: arte }}
            style={{ width: TAPA, height: TAPA, borderRadius: 44 }}
          />
        ) : null}
      </View>

      {/* Título, artista, barra y reloj: un bloque que fluye, así una o dos
          líneas de título no descolocan la barra. */}
      <View
        style={{
          position: 'absolute',
          left: TAPA_X,
          top: TAPA_Y + TAPA + 92,
          width: TAPA,
          alignItems: 'center',
        }}
      >
        <Text
          numberOfLines={2}
          style={{
            color: '#FFFFFF',
            fontSize: 66,
            fontWeight: '800',
            textAlign: 'center',
            lineHeight: 76,
            letterSpacing: -0.5,
          }}
        >
          {track.title}
        </Text>
        <Text
          numberOfLines={1}
          style={{ color: '#B8B8B8', fontSize: 42, textAlign: 'center', marginTop: 20 }}
        >
          {track.artist}
        </Text>

        <View style={{ width: TAPA, marginTop: 56 }}>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.24)' }}>
            <View
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: TAPA * AVANCE,
                height: 8,
                borderRadius: 4,
                backgroundColor: '#FFFFFF',
              }}
            />
            <View
              style={{
                position: 'absolute',
                left: TAPA * AVANCE - 13,
                top: -9,
                width: 26,
                height: 26,
                borderRadius: 13,
                backgroundColor: '#FFFFFF',
                shadowColor: '#000',
                shadowOpacity: 0.4,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 2 },
              }}
            />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 22 }}>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 30 }}>{ido}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 30 }}>{total}</Text>
          </View>
        </View>
      </View>

      {/* El sello: el cuadradito con el play y el nombre, como el ícono de la
          app. Es la firma que dice de dónde salió la tarjeta. */}
      <View
        style={{
          position: 'absolute',
          bottom: 104,
          left: 0,
          right: 0,
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <View
          style={{
            width: 62,
            height: 62,
            borderRadius: 17,
            backgroundColor: '#FFFFFF',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View
            style={{
              width: 0,
              height: 0,
              marginLeft: 6,
              borderTopWidth: 15,
              borderBottomWidth: 15,
              borderLeftWidth: 24,
              borderTopColor: 'transparent',
              borderBottomColor: 'transparent',
              borderLeftColor: FONDO,
            }}
          />
        </View>
        <Text style={{ color: '#FFFFFF', fontSize: 44, fontWeight: '800', marginLeft: 22 }}>
          dnmusic
        </Text>
      </View>
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

async function dibujarYDescargar(track: PlaylistTrack) {
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
         misma escala 1.35 que la vista nativa para que el desenfoque no deje
         bordes lavados. */
      const escala = Math.max(ANCHO / arte.width, ALTO / arte.height) * 1.35
      const w = arte.width * escala
      const h = arte.height * escala
      ctx.save()
      ctx.filter = 'blur(80px) saturate(1.35)'
      ctx.globalAlpha = 0.6
      ctx.drawImage(arte, (ANCHO - w) / 2, (ALTO - h) / 2, w, h)
      ctx.restore()
    }

    // El velo, pesado abajo, como el nativo.
    const velo = ctx.createLinearGradient(0, 0, 0, ALTO)
    velo.addColorStop(0, 'rgba(0,0,0,0.55)')
    velo.addColorStop(0.42, 'rgba(0,0,0,0.30)')
    velo.addColorStop(0.78, 'rgba(0,0,0,0.78)')
    velo.addColorStop(1, 'rgba(0,0,0,0.96)')
    ctx.fillStyle = velo
    ctx.fillRect(0, 0, ANCHO, ALTO)

    // El rótulo de arriba.
    ctx.save()
    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(255,255,255,0.72)'
    ctx.font = '700 30px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    ctx.letterSpacing = '7px'
    ctx.fillText('AHORA SUENA', ANCHO / 2, 210)
    ctx.restore()

    // La tapa, con sombra y esquinas redondeadas.
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.5)'
    ctx.shadowBlur = 56
    ctx.shadowOffsetY = 24
    ctx.fillStyle = '#181818'
    caminoRedondo(ctx, TAPA_X, TAPA_Y, TAPA, TAPA, 44)
    ctx.fill()
    ctx.restore()
    if (arte) {
      ctx.save()
      caminoRedondo(ctx, TAPA_X, TAPA_Y, TAPA, TAPA, 44)
      ctx.clip()
      ctx.drawImage(arte, TAPA_X, TAPA_Y, TAPA, TAPA)
      ctx.restore()
    }

    // Título y artista, centrados y recortados por ancho.
    const tituloY = TAPA_Y + TAPA + 92 + 66
    ctx.textAlign = 'center'
    ctx.fillStyle = '#FFFFFF'
    ctx.font = '800 66px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    ctx.fillText(acotar(ctx, track.title, TAPA), ANCHO / 2, tituloY)
    ctx.fillStyle = '#B8B8B8'
    ctx.font = '400 42px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    ctx.fillText(acotar(ctx, track.artist, TAPA), ANCHO / 2, tituloY + 74)

    // La barra de reproducción: pista, relleno y perilla.
    const barraY = tituloY + 168
    ctx.fillStyle = 'rgba(255,255,255,0.24)'
    caminoRedondo(ctx, TAPA_X, barraY, TAPA, 8, 4)
    ctx.fill()
    ctx.fillStyle = '#FFFFFF'
    caminoRedondo(ctx, TAPA_X, barraY, TAPA * AVANCE, 8, 4)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(TAPA_X + TAPA * AVANCE, barraY + 4, 13, 0, Math.PI * 2)
    ctx.fill()

    // El reloj a los costados de la barra.
    const { ido, total } = tiempos(track.durationMs)
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.font = '400 30px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(ido, TAPA_X, barraY + 56)
    ctx.textAlign = 'right'
    ctx.fillText(total, TAPA_X + TAPA, barraY + 56)

    // El sello de la app: el cuadradito con el play y el nombre, centrados.
    const selloY = ALTO - 128
    ctx.textAlign = 'left'
    ctx.font = '800 44px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    const nombre = 'dnmusic'
    const anchoNombre = ctx.measureText(nombre).width
    const cuadro = 62
    const sep = 22
    const totalAncho = cuadro + sep + anchoNombre
    const inicio = (ANCHO - totalAncho) / 2
    // El cuadro blanco redondeado.
    ctx.fillStyle = '#FFFFFF'
    caminoRedondo(ctx, inicio, selloY - cuadro / 2, cuadro, cuadro, 17)
    ctx.fill()
    // El triángulo de play, negro, centrado en el cuadro.
    ctx.fillStyle = FONDO
    const cx = inicio + cuadro / 2 + 4
    const cy = selloY
    ctx.beginPath()
    ctx.moveTo(cx - 12, cy - 15)
    ctx.lineTo(cx - 12, cy + 15)
    ctx.lineTo(cx + 14, cy)
    ctx.closePath()
    ctx.fill()
    // El nombre.
    ctx.fillStyle = '#FFFFFF'
    ctx.textBaseline = 'middle'
    ctx.fillText(nombre, inicio + cuadro + sep, selloY)
    ctx.textBaseline = 'alphabetic'

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('No se pudo exportar')
    /* La URL se guarda aparte y se revoca en el tick siguiente. Revocarla en
       la misma vuelta que el click deja al navegador bajando algo que ya no
       existe —Chrome suele llegar, otros no—, y leerla de vuelta de `a.href`
       para revocarla es pedirle al DOM el valor que uno ya tenía. */
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `historia-${track.title.replace(/[^\p{L}\p{N} .-]/gu, '').trim() || 'cancion'}.png`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
    avisar('Historia descargada: subila a Instagram desde ahí.')
  } catch {
    avisar('No se pudo armar la historia.', true)
  }
}

/** Recorta con «…» para que entre en `max` píxeles de ancho. */
function acotar(ctx: CanvasRenderingContext2D, texto: string, max: number): string {
  if (ctx.measureText(texto).width <= max) return texto
  let corte = texto
  while (corte.length > 1 && ctx.measureText(`${corte}…`).width > max) {
    corte = corte.slice(0, -1)
  }
  return `${corte.trimEnd()}…`
}
