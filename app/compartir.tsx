import { useState } from 'react'
import { Text, View, useWindowDimensions } from 'react-native'
import { useRouter } from 'expo-router'
import { volver } from '../src/lib/volver'
import { compartirCancion, copiarEnlaceCancion, linkDe } from '../src/lib/compartir'
import { useColorPortada } from '../src/lib/colorPortada'
import { cancionACompartir, soltarCancionACompartir } from '../src/state/compartir'
import { avisar } from '../src/state/aviso'
import { Hoja, usePisoHoja } from '../src/ui/Hoja'
import { BotonHoja, EncabezadoHoja } from '../src/ui/EncabezadoHoja'
import { FilaAccion, GrupoAjustes } from '../src/ui/Ajustes'
import { Vacio } from '../src/ui/Vacio'
import { ICON_COLOR, IconCopiar, IconImage, IconMessage, IconMusic, IconShare } from '../src/ui/icons'
import { TarjetaHistoria } from '../src/ui/TarjetaHistoria'
import { CancionCompartida } from '../src/ui/CancionCompartida'
import { ScrollArea } from '../src/ui/ScrollArea'
import { compartirHistoria, datosDeTarjeta } from '../src/ui/CompartirHistoria'
import { ALTO, ANCHO } from '../src/ui/geometriaTarjetaHistoria'
import { ES_WEB } from '../src/ui/Glass'

/* La previa y las acciones comparten un scroll acotado para ventanas bajas y texto grande. */
const PREVIA_MAXIMA = 240
const PREVIA_PARTE = 0.26

export default function Compartir() {
  const router = useRouter()
  const piso = usePisoHoja(24)
  const { height } = useWindowDimensions()

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
  /* La transformación conserva el diseño de 1080×1920 que se exporta. */
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
        velo={false}
        sobre={`${track.title} · ${track.artist}`}
        izquierda={<BotonHoja tipo="cerrar" onPress={cerrar} />}
      />

      <ScrollArea style={{ maxHeight: Math.max(180, height - 160 - piso) }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: piso, gap: 20 }}>
        <View style={{ alignItems: 'center', gap: 8 }}>
          <CancionCompartida song={{ ...track, kind: 'track' }} />
          <Text className="text-muted-foreground text-center text-footnote">En el chat y al abrir el link</Text>
        </View>

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
            copyText={ES_WEB ? enlace : undefined}
            rotulo="Copiar el link"
            icono={<IconCopiar size={17} color={ICON_COLOR.muted} />}
            busy={ocupado}
            ultima
            onPress={() =>
              void accion(async () => {
                const copiado = await copiarEnlaceCancion(track)
                avisar(copiado ? 'Link copiado.' : `Compartí el link ${enlace}`)
                if (!ES_WEB) cerrar()
              })
            }
          />
        </GrupoAjustes>
      </ScrollArea>
    </Hoja>
  )
}
