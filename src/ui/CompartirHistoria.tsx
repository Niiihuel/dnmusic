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
import { ES_WEB } from './Glass'

/**
 * La canción que suena, hecha imagen para una historia de Instagram.
 *
 * Una tarjeta de 1080×1920 —el formato exacto de una historia— con el mismo
 * lenguaje de la pantalla «Sonando»: la carátula pone el único color, estirada
 * y desenfocada de fondo con un velo encima, la tapa entera al medio, y el
 * título y el artista debajo. Abajo firma la app, chiquito, como firman las
 * tarjetas de Spotify.
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
/** Lado de la tapa central y su posición. Proporciones de la pantalla «Sonando». */
const TAPA = 880
const TAPA_X = (ANCHO - TAPA) / 2
const TAPA_Y = 400

type Pedido = { track: PlaylistTrack | null }

const store = createStore<Pedido>({ track: null })

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
        backgroundColor: '#121212',
        overflow: 'hidden',
      }}
    >
      {arte ? (
        <Image
          source={{ uri: arte }}
          onLoad={() => setTapaDe(track.id)}
          onError={() => setTapaDe(track.id)}
          style={[
            StyleSheet.absoluteFill,
            { transform: [{ scale: 1.3 }], opacity: 0.55 },
          ]}
          blurRadius={40}
        />
      ) : null}
      <LinearGradient
        colors={['rgba(0,0,0,0.72)', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.92)']}
        style={StyleSheet.absoluteFill}
      />

      {arte ? (
        <Image
          source={{ uri: arte }}
          style={{
            position: 'absolute',
            left: TAPA_X,
            top: TAPA_Y,
            width: TAPA,
            height: TAPA,
            borderRadius: 48,
            backgroundColor: '#181818',
          }}
        />
      ) : (
        <View
          style={{
            position: 'absolute',
            left: TAPA_X,
            top: TAPA_Y,
            width: TAPA,
            height: TAPA,
            borderRadius: 48,
            backgroundColor: '#181818',
          }}
        />
      )}

      <View
        style={{
          position: 'absolute',
          left: TAPA_X,
          top: TAPA_Y + TAPA + 88,
          width: TAPA,
          alignItems: 'center',
          gap: 20,
        }}
      >
        <Text
          numberOfLines={2}
          style={{
            color: '#FFFFFF',
            fontSize: 64,
            fontWeight: '700',
            textAlign: 'center',
            lineHeight: 76,
          }}
        >
          {track.title}
        </Text>
        <Text
          numberOfLines={1}
          style={{ color: '#B3B3B3', fontSize: 44, textAlign: 'center' }}
        >
          {track.artist}
        </Text>
      </View>

      <Text
        style={{
          position: 'absolute',
          bottom: 96,
          alignSelf: 'center',
          color: '#B3B3B3',
          fontSize: 34,
          fontWeight: '600',
          letterSpacing: 8,
          textTransform: 'uppercase',
        }}
      >
        dnmusic
      </Text>
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

async function dibujarYDescargar(track: PlaylistTrack) {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = ANCHO
    canvas.height = ALTO
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Sin canvas')

    ctx.fillStyle = '#121212'
    ctx.fillRect(0, 0, ANCHO, ALTO)

    const fuente = artworkSource(track.artworkPath, track.artworkUrl, 1000)
    const arte = fuente ? await cargarImagen(conCors(fuente)).catch(() => null) : null

    if (arte) {
      /* El ambiente: la tapa estirada a todo el cuadro, desenfocada, al 55%,
         con la misma escala 1.3 que usa la pantalla para que el desenfoque no
         deje bordes lavados. */
      const escala = Math.max(ANCHO / arte.width, ALTO / arte.height) * 1.3
      const w = arte.width * escala
      const h = arte.height * escala
      ctx.save()
      ctx.filter = 'blur(80px) saturate(1.4)'
      ctx.globalAlpha = 0.55
      ctx.drawImage(arte, (ANCHO - w) / 2, (ALTO - h) / 2, w, h)
      ctx.restore()
    }

    // El velo, de tres paradas como el de «Sonando».
    const velo = ctx.createLinearGradient(0, 0, 0, ALTO)
    velo.addColorStop(0, 'rgba(0,0,0,0.72)')
    velo.addColorStop(0.5, 'rgba(0,0,0,0.45)')
    velo.addColorStop(1, 'rgba(0,0,0,0.92)')
    ctx.fillStyle = velo
    ctx.fillRect(0, 0, ANCHO, ALTO)

    // La tapa entera, con sombra y esquinas redondeadas.
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.55)'
    ctx.shadowBlur = 56
    ctx.shadowOffsetY = 22
    ctx.fillStyle = '#181818'
    ctx.beginPath()
    ctx.roundRect(TAPA_X, TAPA_Y, TAPA, TAPA, 48)
    ctx.fill()
    ctx.restore()
    if (arte) {
      ctx.save()
      ctx.beginPath()
      ctx.roundRect(TAPA_X, TAPA_Y, TAPA, TAPA, 48)
      ctx.clip()
      ctx.drawImage(arte, TAPA_X, TAPA_Y, TAPA, TAPA)
      ctx.restore()
    }

    // Título y artista, centrados y con recorte por ancho, no por caracteres.
    ctx.textAlign = 'center'
    ctx.fillStyle = '#FFFFFF'
    ctx.font =
      '700 64px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    ctx.fillText(acotar(ctx, track.title, TAPA), ANCHO / 2, TAPA_Y + TAPA + 88 + 64)
    ctx.fillStyle = '#B3B3B3'
    ctx.font = '400 44px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    ctx.fillText(acotar(ctx, track.artist, TAPA), ANCHO / 2, TAPA_Y + TAPA + 88 + 64 + 76)

    // La firma.
    ctx.fillStyle = '#B3B3B3'
    ctx.font = '600 34px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    const marca = 'D N M U S I C'
    ctx.fillText(marca, ANCHO / 2, ALTO - 96)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png'),
    )
    if (!blob) throw new Error('No se pudo exportar')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `historia-${track.title.replace(/[^\p{L}\p{N} .-]/gu, '').trim() || 'cancion'}.png`
    a.click()
    URL.revokeObjectURL(a.href)
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
