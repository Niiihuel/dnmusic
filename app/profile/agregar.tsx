import { usePerfilEdicion } from '../../src/state/perfilEdicion'
import { idVitrinaTemporal, ponerVitrinaEdicion } from '../../src/state/mosaicoEdicion'
import { useState } from 'react'
import { ScrollView, Text } from 'react-native'
import { CabeceraSocial } from '../../src/ui/Social'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { mensajeError } from '../../src/lib/mensajeError'
import { pickImage } from '../../src/lib/pickImage'
import { volver } from '../../src/lib/volver'
import { addShowcase, SIN_ESTILO, uploadIlustracion, type ShowcaseKind } from '../../src/services/showcases'
import { avisar } from '../../src/state/aviso'
import { useUser } from '../../src/state/session'
import { actualizarBorrador, empezarBorrador } from '../../src/state/vitrinaBorrador'
import { FilaAjuste, GrupoAjustes } from '../../src/ui/Ajustes'
import { ANCHO_HOJA, Hoja, useHojaModal, usePisoHoja } from '../../src/ui/Hoja'
import {
  ICON_COLOR,
  IconAlbum,
  IconEspacio,
  IconGrilla,
  IconHeading,
  IconImage,
  IconLyrics,
  IconMusic,
  IconType,
  IconUser,
} from '../../src/ui/icons'

/**
 * El «+» del mosaico: qué pieza agregar.
 *
 * Es la hoja de Airbuds, con sus dos grupos: lo que es **música** —un artista,
 * una canción, un álbum, unas letras— y lo **otro**, las piezas de composición
 * que hacen que el mosaico tenga capítulos: un encabezado, un texto suelto,
 * una imagen, un espacio.
 *
 * Cada fila deja armada la vitrina en el borrador (`state/vitrinaBorrador`) y
 * manda a donde corresponda: las de música al buscador, porque lo primero es
 * elegir *cuál*; la imagen al selector de fotos, porque sin foto no hay nada
 * que editar; el resto directo al editor.
 *
 * Con `parent` la pieza nace **adentro de un sub-space**, y la hoja es la
 * misma menos una fila: ahí no se ofrece otro sub-space. Un mosaico dentro de
 * una pieza dentro de una pieza es un laberinto, y la base tampoco lo deja.
 */
export default function AgregarVitrina() {
  const router = useRouter()
  const { parent } = useLocalSearchParams<{ parent?: string }>()
  const parentId = parent || null
  const user = useUser()
  const edicion = usePerfilEdicion()
  const piso = usePisoHoja(24)
  const modal = useHojaModal()
  const [subiendo, setSubiendo] = useState(false)

  /**
   * Un espacio no tiene nada que editar —ni texto, ni tema, ni imagen—, así
   * que se agrega acá mismo y se vuelve al mosaico. Pasarlo por el editor era
   * una pantalla con un solo botón.
   */
  async function agregarEspacio() {
    if (!user || subiendo || edicion.ocupado) return
    setSubiendo(true)
    try {
      if (edicion.ownerId === user.id) {
        ponerVitrinaEdicion(user.id, { id: null, kind: 'espaciador', contenido: { kind: 'espaciador' }, ancho: 'entero', estilo: SIN_ESTILO, parentId }, idVitrinaTemporal(), null, true)
      } else await addShowcase(user.id, 'espaciador', {}, 'entero', SIN_ESTILO, parentId)
      avisar('Espacio agregado')
      volver(router, '/profile')
    } catch (e) {
      avisar(mensajeError(e), true)
    } finally {
      setSubiendo(false)
    }
  }

  function elegir(kind: ShowcaseKind) {
    if (kind === 'espaciador') {
      void agregarEspacio()
      return
    }
    empezarBorrador(kind, parentId)
    if (kind === 'cancion' || kind === 'artista' || kind === 'album' || kind === 'letra') {
      router.replace({ pathname: '/profile/elegir', params: { que: kind } })
      return
    }
    router.replace('/profile/vitrina')
  }

  /**
   * Una imagen: se elige y se sube acá mismo, y recién con la ruta se abre
   * el editor. Un editor de imagen sin imagen sería una pantalla vacía con
   * un solo botón.
   */
  async function elegirImagen() {
    if (!user || subiendo || edicion.ocupado) return
    setSubiendo(true)
    try {
      const elegida = await pickImage()
      if (!elegida) return
      const ruta = await uploadIlustracion(user.id, elegida.blob, elegida.fileName, elegida.mime)
      empezarBorrador('imagen', parentId)
      actualizarBorrador({ contenido: { kind: 'imagen', imagen: { path: ruta, encuadre: null } } })
      router.replace('/profile/vitrina')
    } catch (e) {
      avisar((e as Error).message || 'No se pudo subir la imagen', true)
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <Hoja medida="contenido" titulo="Agregar al mosaico">
      <CabeceraSocial titulo="Agregar al mosaico" detalle="Elegí una pieza para tu perfil" ocupado={subiendo} onCerrar={() => volver(router, '/profile')} />
      <ScrollView
        className="bg-background"
        style={{ flexGrow: 1 }}
        contentContainerClassName="gap-6 px-5 pt-2"
        contentContainerStyle={{
          paddingBottom: modal ? 24 : piso,
          maxWidth: ANCHO_HOJA,
          width: '100%',
          alignSelf: 'center',
        }}
      >
        <GrupoAjustes titulo="Música">
          <FilaAjuste
            rotulo="Artista"
            vacio="Una cara y un nombre"
            icono={<IconUser size={17} color={ICON_COLOR.muted} />}
            onPress={() => elegir('artista')}
          />
          <FilaAjuste
            rotulo="Canción"
            vacio="Con su tapa y su play"
            icono={<IconMusic size={17} color={ICON_COLOR.muted} />}
            onPress={() => elegir('cancion')}
          />
          <FilaAjuste
            rotulo="Álbum"
            vacio="La tapa y de quién es"
            icono={<IconAlbum size={17} color={ICON_COLOR.muted} />}
            onPress={() => elegir('album')}
          />
          <FilaAjuste
            rotulo="Letras"
            vacio="Un verso, con la canción firmando"
            icono={<IconLyrics size={17} color={ICON_COLOR.muted} />}
            onPress={() => elegir('letra')}
            ultima
          />
        </GrupoAjustes>

        <GrupoAjustes titulo="Otro">
          {/* Primero: es la pieza que más cambia lo que un perfil puede ser.
              Solo en el mosaico principal — un solo nivel. */}
          {parentId ? null : (
            <FilaAjuste
              rotulo="Sub-space"
              vacio="Un mosaico dentro de una pieza"
              icono={<IconGrilla size={17} color={ICON_COLOR.muted} />}
              onPress={() => elegir('subspace')}
            />
          )}
          <FilaAjuste
            rotulo="Encabezado de sección"
            vacio="Un título que separa"
            icono={<IconHeading size={17} color={ICON_COLOR.muted} />}
            onPress={() => elegir('encabezado')}
          />
          <FilaAjuste
            rotulo="Texto"
            vacio="Lo que quieras decir"
            icono={<IconType size={17} color={ICON_COLOR.muted} />}
            onPress={() => elegir('texto')}
          />
          <FilaAjuste
            rotulo="Imagen"
            vacio={subiendo ? 'Subiendo…' : 'Una foto o un GIF'}
            icono={<IconImage size={17} color={ICON_COLOR.muted} />}
            onPress={() => void elegirImagen()}
          />
          <FilaAjuste
            rotulo="Espaciador"
            vacio="Aire entre piezas"
            icono={<IconEspacio size={17} color={ICON_COLOR.muted} />}
            onPress={() => elegir('espaciador')}
            ultima
          />
        </GrupoAjustes>

        {/* En web la hoja no tiene grabber que bajar: un «Cancelar» explícito. */}
        {modal ? null : (
          <Text
            accessibilityRole="button"
            onPress={() => volver(router, '/profile')}
            className="text-muted-foreground text-center text-[13px] font-semibold"
          >
            Cancelar
          </Text>
        )}
      </ScrollView>
    </Hoja>
  )
}
