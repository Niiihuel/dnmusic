import { useState } from 'react'
import { Text, View, useWindowDimensions } from 'react-native'
import { useRouter } from 'expo-router'
import { volver } from '../src/lib/volver'
import { compartirCancion, copiarEnlaceCancion, linkDe } from '../src/lib/compartir'
import { artworkSource } from '../src/lib/artwork'
import { useColorPortada } from '../src/lib/colorPortada'
import { cancionACompartir, soltarCancionACompartir } from '../src/state/compartir'
import { avisar } from '../src/state/aviso'
import { Hoja, usePisoHoja } from '../src/ui/Hoja'
import { BotonHoja, EncabezadoHoja } from '../src/ui/EncabezadoHoja'
import { FilaAccion, GrupoAjustes } from '../src/ui/Ajustes'
import { Vacio } from '../src/ui/Vacio'
import { ICON_COLOR, IconCopiar, IconImage, IconMessage, IconMusic, IconShare } from '../src/ui/icons'
import { TarjetaHistoria } from '../src/ui/TarjetaHistoria'
import { TarjetaMusica } from '../src/ui/TarjetaMusica'
import { ScrollArea } from '../src/ui/ScrollArea'
import { compartirHistoria, datosDeTarjeta } from '../src/ui/CompartirHistoria'
import { ALTO, ANCHO } from '../src/ui/geometriaTarjetaHistoria'
import { ES_WEB } from '../src/ui/Glass'

const PREVIA_MAXIMA = 360
const PREVIA_PARTE = 0.42

export default function Compartir() {
  const router = useRouter()
  const piso = usePisoHoja(24)
  const { height } = useWindowDimensions()

  const [track] = useState(() => cancionACompartir())
  const [ocupado, setOcupado] = useState(false)
  const [vista, setVista] = useState<'opciones' | 'historia'>('opciones')
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
  const alto = Math.min(PREVIA_MAXIMA, Math.round(height * PREVIA_PARTE))
  const escala = alto / ALTO
  const historia = vista === 'historia'
  const titulo = historia ? 'Historia' : 'Compartir'

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
    <Hoja medida="contenido" titulo={titulo} onCerrar={cerrar}>
      <EncabezadoHoja
        titulo={titulo}
        velo={false}
        izquierda={<BotonHoja tipo={historia ? 'volver' : 'cerrar'} onPress={historia ? () => setVista('opciones') : cerrar} />}
        derecha={historia ? <BotonHoja tipo="cerrar" onPress={cerrar} /> : undefined}
      />

      <ScrollArea key={vista} style={{ maxHeight: Math.max(180, height - 160 - piso) }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: piso, gap: 24 }}>
        {historia ? <>
          <View style={{ alignItems: 'center', gap: 16 }}>
            <View
              accessible
              accessibilityLabel={`Vista previa de la historia de ${track.title}, de ${track.artist}`}
              style={{ width: ANCHO * escala, height: alto, borderRadius: 18, overflow: 'hidden', backgroundColor: '#0B0B0B' }}
            >
              <View pointerEvents="none" style={{ width: ANCHO, height: ALTO, transform: [{ scale: escala }], transformOrigin: 'top left' }}>
                <TarjetaHistoria datos={datos} />
              </View>
            </View>
            <Text className="text-muted-foreground text-center text-footnote leading-[18px]">
              El código de la imagen abre esta canción.
            </Text>
          </View>
          <GrupoAjustes>
            <FilaAccion
              rotulo={ES_WEB ? 'Descargar historia' : 'Compartir historia'}
              lineas={2}
              icono={<IconImage size={17} color={ICON_COLOR.muted} />}
              busy={ocupado}
              destacada
              ultima
              onPress={() => void accion(() => {
                if (compartirHistoria(track, tinte)) cerrar()
                else avisar('No se pudo preparar la historia. Volvé a intentarlo.')
              })}
            />
          </GrupoAjustes>
        </> : <>
          <View style={{ alignItems: 'center', gap: 8 }}>
            <TarjetaMusica datos={{ titulo: track.title, artista: track.artist, imagen: artworkSource(track.artworkPath, track.artworkUrl, 240) }} />
          </View>

          <GrupoAjustes>
            <FilaAccion
              rotulo="Enviar por chat"
              lineas={2}
              icono={<IconMessage size={17} color={ICON_COLOR.muted} />}
              busy={ocupado}
              onPress={() => router.push('/compartir-contactos')}
            />
            <FilaAccion
              rotulo="Compartir el link"
              lineas={2}
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
              lineas={2}
              icono={<IconCopiar size={17} color={ICON_COLOR.muted} />}
              busy={ocupado}
              onPress={() =>
                void accion(async () => {
                  const copiado = await copiarEnlaceCancion(track)
                  avisar(copiado ? 'Link copiado.' : `Compartí el link ${enlace}`)
                  if (!ES_WEB) cerrar()
                })
              }
            />
            <FilaAccion
              rotulo="Crear historia"
              lineas={2}
              icono={<IconImage size={17} color={ICON_COLOR.muted} />}
              busy={ocupado}
              ultima
              onPress={() => setVista('historia')}
            />
          </GrupoAjustes>
        </>}
      </ScrollArea>
    </Hoja>
  )
}
