import { Image, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import QRCode from 'react-native-qrcode-svg'
import { conAlfa } from '../lib/colorPortada'
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
  VELO_COLORES,
  VELO_PARADAS,
} from './geometriaTarjetaHistoria'

export type DatosTarjeta = {
  titulo: string
  artista: string
  /** La carátula ya resuelta, lista para `<Image>`. */
  arte: string | null
  /** El link de la canción: es lo que codifica el código escaneable. */
  enlace: string
  /** El color de la portada, si se pudo leer. Tiñe el fondo. */
  tinte?: string | null
}

/**
 * La tarjeta de 1080×1920 que se comparte, dibujada con vistas.
 *
 * Se usa en dos lugares y por eso es un componente y no un bloque adentro de la
 * captura: el teléfono la monta fuera de pantalla para fotografiarla, y la hoja
 * de compartir la muestra **a escala** como vista previa. Que las dos sean el
 * mismo componente es lo que hace que la previa no mienta.
 *
 * La anatomía y el porqué de cada medida están en `geometriaTarjetaHistoria.ts`.
 */
export function TarjetaHistoria({
  datos,
  onArteListo,
}: {
  datos: DatosTarjeta
  /** Avisa que la carátula terminó de cargar: antes de eso la foto sale vacía. */
  onArteListo?: () => void
}) {
  const { titulo, artista, arte, enlace, tinte } = datos
  return (
    <View
      style={{ width: ANCHO, height: ALTO, backgroundColor: FONDO, overflow: 'hidden' }}
    >
      {arte ? (
        <Image
          source={{ uri: arte }}
          onLoad={onArteListo}
          onError={onArteListo}
          style={[
            StyleSheet.absoluteFill,
            { transform: [{ scale: FONDO_ESCALA }], opacity: FONDO_OPACIDAD },
          ]}
          blurRadius={45}
        />
      ) : null}

      {/* El color de la tapa, si se pudo leer, como un baño sobre el desenfoque.
          Sin él la tarjeta sigue funcionando: el tinte es un lujo, nunca un
          requisito (ver `lib/colorPortada`). */}
      {tinte ? (
        <LinearGradient
          colors={[conAlfa(tinte, 0.55), conAlfa(tinte, 0.12), conAlfa(tinte, 0.45)]}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFill}
        />
      ) : null}

      <LinearGradient
        colors={VELO_COLORES}
        locations={VELO_PARADAS}
        style={StyleSheet.absoluteFill}
      />

      {/* La firma, arriba a la izquierda: de dónde salió esto. */}
      <View
        style={{
          position: 'absolute',
          left: MARGEN,
          top: SELLO_Y,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <SelloApp />
        <Text
          style={{ color: TEXTO, fontSize: NOMBRE_TAM, fontWeight: '700', marginLeft: 22 }}
        >
          dnmusic
        </Text>
      </View>

      <View
        style={{
          position: 'absolute',
          left: MARGEN,
          top: TAPA_Y,
          width: TAPA,
          height: TAPA,
          borderRadius: TAPA_RADIO,
          backgroundColor: '#181818',
          shadowColor: '#000',
          shadowOpacity: 0.55,
          shadowRadius: 60,
          shadowOffset: { width: 0, height: 28 },
        }}
      >
        {arte ? (
          <Image source={{ uri: arte }} style={{ width: TAPA, height: TAPA, borderRadius: TAPA_RADIO }} />
        ) : (
          /* Sin carátula, el sello grande y apagado: una canción propia sin
             tapa no puede salir como un cuadrado negro. */
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', opacity: 0.14 }}>
            <SelloApp lado={TAPA * 0.32} />
          </View>
        )}
      </View>

      {/* Título y artista contra el mismo borde que la tapa. */}
      <View style={{ position: 'absolute', left: MARGEN, top: TITULO_Y, width: TAPA }}>
        <Text
          numberOfLines={2}
          style={{
            color: TEXTO,
            fontSize: TITULO_TAM,
            lineHeight: TITULO_INTERLINEA,
            fontWeight: '800',
            letterSpacing: -0.5,
          }}
        >
          {titulo}
        </Text>
        <Text
          numberOfLines={1}
          style={{ color: TEXTO_SUAVE, fontSize: ARTISTA_TAM, marginTop: ARTISTA_SALTO }}
        >
          {artista}
        </Text>
      </View>

      {/* El código: la foto vuelve a ser un link. */}
      <View
        style={{
          position: 'absolute',
          left: MARGEN,
          top: QR_Y,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <View
          style={{
            width: QR_LADO,
            height: QR_LADO,
            borderRadius: QR_RADIO,
            backgroundColor: PLACA,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <QRCode
            value={enlace}
            size={QR_LADO - QR_MARGEN * 2}
            color={FONDO}
            backgroundColor={PLACA}
            ecl="M"
          />
        </View>
        <View style={{ marginLeft: 34 }}>
          <Text style={{ color: TEXTO, fontSize: LEYENDA_TAM, fontWeight: '600' }}>{LEYENDA}</Text>
          <Text style={{ color: TEXTO_TENUE, fontSize: LEYENDA_TAM_CHICO, marginTop: 8 }}>
            {LEYENDA_PIE}
          </Text>
        </View>
      </View>
    </View>
  )
}

/** El cuadradito con el play: el ícono de la app, dibujado. */
function SelloApp({ lado = SELLO_LADO }: { lado?: number }) {
  const escala = lado / SELLO_LADO
  return (
    <View
      style={{
        width: lado,
        height: lado,
        borderRadius: SELLO_RADIO * escala,
        backgroundColor: PLACA,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: 0,
          height: 0,
          marginLeft: 7 * escala,
          borderTopWidth: 16 * escala,
          borderBottomWidth: 16 * escala,
          borderLeftWidth: 26 * escala,
          borderTopColor: 'transparent',
          borderBottomColor: 'transparent',
          borderLeftColor: FONDO,
        }}
      />
    </View>
  )
}
