import { useState } from 'react'
import { Text, View, useWindowDimensions } from 'react-native'
import { useRouter } from 'expo-router'
import { volver } from '../src/lib/volver'
import { compartirCancion, linkDe } from '../src/lib/compartir'
import { copiarAlPortapapeles } from '../src/lib/portapapeles'
import { useColorPortada } from '../src/lib/colorPortada'
import { cancionACompartir, soltarCancionACompartir } from '../src/state/compartir'
import { avisar } from '../src/state/aviso'
import { Hoja, usePisoHoja } from '../src/ui/Hoja'
import { BotonHoja, EncabezadoHoja } from '../src/ui/EncabezadoHoja'
import { FilaAccion, GrupoAjustes } from '../src/ui/Ajustes'
import { Vacio } from '../src/ui/Vacio'
import { ICON_COLOR, IconCopiar, IconImage, IconMessage, IconMusic, IconShare } from '../src/ui/icons'
import { TarjetaHistoria } from '../src/ui/TarjetaHistoria'
import { compartirHistoria, datosDeTarjeta } from '../src/ui/CompartirHistoria'
import { ALTO, ANCHO } from '../src/ui/tarjetaHistoria'
import { ES_WEB } from '../src/ui/Glass'

/**
 * El alto de la previa.
 *
 * Se mide contra la ventana y no con un número fijo: la hoja tiene que entrar
 * entera —previa, leyenda y las cuatro acciones— sin que la última quede debajo
 * del borde. Un cuarto de la altura deja lugar para todo eso en un teléfono
 * chico y no desperdicia el de uno grande.
 */
const PREVIA_MAXIMA = 240
const PREVIA_PARTE = 0.26

/**
 * Compartir una canción: qué se manda y a dónde.
 *
 * Antes esto no existía. El menú tenía dos filas —«Compartir», que abría la
 * hoja del sistema con el link, y «Compartir historia», que se quedaba unos
 * segundos pensando y de golpe abría **otra** hoja del sistema con una imagen
 * que nadie había visto. Que la imagen saliera linda o rota se descubría
 * recién en Instagram, con la historia ya a medio publicar.
 *
 * Acá se ve primero. La previa es **el mismo componente** que se fotografía
 * (`TarjetaHistoria`), a escala: lo que se ve es exactamente lo que sale. Y las
 * dos formas de pasar la canción dejan de ser dos filas sueltas de un menú
 * largo para ser lo que son: las opciones de una misma decisión.
 *
 * La canción llega por `state/compartir` y no por la URL, como en «Agregar a
 * una lista»: tiene diez campos y pasarla en la ruta la vuelve ilegible.
 */
export default function Compartir() {
  const router = useRouter()
  const piso = usePisoHoja(24)
  const { height } = useWindowDimensions()
  /* Se lee una vez: la hoja vive lo que dura decidir y la canción no cambia. */
  const [track] = useState(() => cancionACompartir())
  const [ocupado, setOcupado] = useState(false)
  const tinte = useColorPortada(track?.artworkUrl ?? null)

  const cerrar = () => {
    soltarCancionACompartir()
    volver(router, '/')
  }

  if (!track) {
    return (
      <Hoja medida="contenido" titulo="Compartir" onCerrar={cerrar}>
        <EncabezadoHoja titulo="Compartir" izquierda={<BotonHoja tipo="cerrar" onPress={cerrar} />} />
        <View style={{ paddingBottom: piso }}>
          <Vacio
            compacto
            icono={<IconMusic size={20} color={ICON_COLOR.muted} />}
            titulo="No hay nada para compartir"
            detalle="Volvé a abrir el menú de una canción."
          />
        </View>
      </Hoja>
    )
  }

  const enlace = linkDe('cancion', track.videoId)
  const datos = datosDeTarjeta(track, tinte)
  /* La previa se achica proporcionalmente: la tarjeta mide 1080×1920 de verdad
     y lo que cambia es la lupa, nunca el diseño. */
  const alto = Math.min(PREVIA_MAXIMA, Math.round(height * PREVIA_PARTE))
  const escala = alto / ALTO

  async function accion(hacer: () => void | Promise<void>) {
    if (ocupado) return
    setOcupado(true)
    try {
      await hacer()
    } finally {
      setOcupado(false)
    }
  }

  return (
    <Hoja medida="contenido" titulo="Compartir" onCerrar={cerrar}>
      <EncabezadoHoja
        titulo="Compartir"
        sobre={`${track.title} · ${track.artist}`}
        izquierda={<BotonHoja tipo="cerrar" onPress={cerrar} />}
      />

      <View style={{ paddingHorizontal: 16, paddingBottom: piso, gap: 20 }}>
        {/* La previa, centrada y a escala. La caja mide lo que se ve; la
            tarjeta adentro conserva su tamaño real y se encoge con transform,
            que es lo único que no le cambia una medida al diseño. */}
        <View style={{ alignItems: 'center' }}>
          <View
            accessible
            accessibilityLabel={`Vista previa de la historia de ${track.title}, de ${track.artist}`}
            style={{
              width: ANCHO * escala,
              height: alto,
              borderRadius: 18,
              overflow: 'hidden',
              backgroundColor: '#0B0B0B',
            }}
          >
            <View
              pointerEvents="none"
              style={{
                width: ANCHO,
                height: ALTO,
                transform: [{ scale: escala }],
                transformOrigin: 'top left',
              }}
            >
              <TarjetaHistoria datos={datos} />
            </View>
          </View>
          <Text className="text-muted-foreground pt-3 text-center text-footnote leading-[18px]">
            Quien la vea puede escanear el código y escuchar la canción.
          </Text>
        </View>

        <GrupoAjustes>
          <FilaAccion
            rotulo="Enviar por chat"
            icono={<IconMessage size={17} color={ICON_COLOR.muted} />}
            busy={ocupado}
            onPress={() => router.push('/compartir-contactos')}
          />
          <FilaAccion
            rotulo={ES_WEB ? 'Descargar la historia' : 'Compartir la historia'}
            icono={<IconImage size={17} color={ICON_COLOR.muted} />}
            busy={ocupado}
            onPress={() =>
              void accion(() => {
                compartirHistoria(track, tinte)
                cerrar()
              })
            }
          />
          <FilaAccion
            rotulo="Compartir el link"
            icono={<IconShare size={17} color={ICON_COLOR.muted} />}
            busy={ocupado}
            onPress={() =>
              void accion(async () => {
                await compartirCancion(track)
                cerrar()
              })
            }
          />
          <FilaAccion
            rotulo="Copiar el link"
            icono={<IconCopiar size={17} color={ICON_COLOR.muted} />}
            busy={ocupado}
            ultima
            onPress={() =>
              void accion(async () => {
                const copiado = await copiarAlPortapapeles(enlace)
                avisar(copiado ? 'Link copiado.' : `Compartí el link ${enlace}`)
                cerrar()
              })
            }
          />
        </GrupoAjustes>
      </View>
    </Hoja>
  )
}
