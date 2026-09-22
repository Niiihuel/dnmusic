import { usePerfilEdicion } from '../../src/state/perfilEdicion'
import { idVitrinaTemporal, ponerVitrinaEdicion } from '../../src/state/mosaicoEdicion'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ActivityIndicator, Platform, ScrollView, Text, View } from 'react-native'
import { CabeceraSocial } from '../../src/ui/Social'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { mensajeError } from '../../src/lib/mensajeError'
import { pickImage } from '../../src/lib/pickImage'
import { volver } from '../../src/lib/volver'
import { addShowcase, SIN_ESTILO, uploadIlustracion, type ShowcaseKind } from '../../src/services/showcases'
import { avisar } from '../../src/state/aviso'
import { useUser } from '../../src/state/session'
import { actualizarBorrador, empezarBorrador } from '../../src/state/vitrinaBorrador'
import { FilaAjuste, GrupoAjustes, ListaAjustes } from '../../src/ui/Ajustes'
import { useSalidaConCambios } from '../../src/ui/useSalidaConCambios'
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
  const [error, setError] = useState<string | null>(null)
  const [destino, setDestino] = useState<'editor' | 'perfil' | null>(null)
  const enVuelo = useRef(false)
  const ocupado = subiendo || edicion.ocupado || !!destino
  const dialogoSalida = useSalidaConCambios(false, subiendo && !destino)
  // Navegar después de levantar el bloqueo de la hoja, no desde el upload.
  useEffect(() => {
    if (destino === 'editor') router.replace('/profile/vitrina')
    else if (destino === 'perfil') volver(router, '/profile')
  }, [destino, router])

  /**
   * Un espacio no tiene nada que editar —ni texto, ni tema, ni imagen—, así
   * que se agrega acá mismo y se vuelve al mosaico. Pasarlo por el editor era
   * una pantalla con un solo botón.
   */
  async function agregarEspacio() {
    if (!user || enVuelo.current || ocupado) return
    enVuelo.current = true
    setError(null)
    setSubiendo(true)
    try {
      if (edicion.ownerId === user.id) {
        ponerVitrinaEdicion(user.id, { id: null, kind: 'espaciador', contenido: { kind: 'espaciador' }, ancho: 'entero', estilo: SIN_ESTILO, parentId }, idVitrinaTemporal(), null, true)
      } else await addShowcase(user.id, 'espaciador', {}, 'entero', SIN_ESTILO, parentId)
      avisar('Espacio agregado')
      setDestino('perfil')
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      setSubiendo(false)
      enVuelo.current = false
    }
  }

  function elegir(kind: ShowcaseKind) {
    if (enVuelo.current || ocupado) return
    if (kind === 'espaciador') {
      void agregarEspacio()
      return
    }
    enVuelo.current = true
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
    if (!user || enVuelo.current || ocupado) return
    enVuelo.current = true
    setError(null)
    setSubiendo(true)
    try {
      const elegida = await pickImage()
      if (!elegida) return
      const ruta = await uploadIlustracion(user.id, elegida.blob, elegida.fileName, elegida.mime)
      empezarBorrador('imagen', parentId)
      actualizarBorrador({ contenido: { kind: 'imagen', imagen: { path: ruta, encuadre: null } } })
      setDestino('editor')
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      setSubiendo(false)
      enVuelo.current = false
    }
  }

  return (
    <Hoja titulo="Agregar al mosaico">
      {dialogoSalida}
      <CabeceraSocial titulo="Agregar al mosaico" ocupado={ocupado} onCerrar={() => { if (!enVuelo.current && !ocupado) volver(router, '/profile') }} />
      {subiendo || error ? <View style={{ paddingHorizontal: 24, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {subiendo ? <ActivityIndicator color={ICON_COLOR.muted} /> : null}
        <Text accessibilityRole={error ? 'alert' : undefined} accessibilityLiveRegion="polite" className="text-footnote text-muted-foreground" style={{ flex: 1 }}>{error ?? 'Preparando tu pieza…'}</Text>
      </View> : null}
      <ListaPiezas piso={modal ? 24 : piso}>
        <GrupoAjustes titulo="Música">
          <FilaAjuste
            rotulo="Artista"
            vacio=""
            disabled={ocupado}
            icono={<IconUser size={17} color={ICON_COLOR.muted} />}
            onPress={() => elegir('artista')}
          />
          <FilaAjuste
            rotulo="Canción"
            vacio=""
            disabled={ocupado}
            icono={<IconMusic size={17} color={ICON_COLOR.muted} />}
            onPress={() => elegir('cancion')}
          />
          <FilaAjuste
            rotulo="Álbum"
            vacio=""
            disabled={ocupado}
            icono={<IconAlbum size={17} color={ICON_COLOR.muted} />}
            onPress={() => elegir('album')}
          />
          <FilaAjuste
            rotulo="Letras"
            vacio=""
            disabled={ocupado}
            icono={<IconLyrics size={17} color={ICON_COLOR.muted} />}
            onPress={() => elegir('letra')}
            ultima
          />
        </GrupoAjustes>

        <GrupoAjustes titulo="Diseño">
          {/* Primero: es la pieza que más cambia lo que un perfil puede ser.
              Solo en el mosaico principal — un solo nivel. */}
          {parentId ? null : (
            <FilaAjuste
              rotulo="Sub-space"
              vacio=""
              disabled={ocupado}
              icono={<IconGrilla size={17} color={ICON_COLOR.muted} />}
              onPress={() => elegir('subspace')}
            />
          )}
          <FilaAjuste
            rotulo="Título de sección"
            vacio=""
            disabled={ocupado}
            icono={<IconHeading size={17} color={ICON_COLOR.muted} />}
            onPress={() => elegir('encabezado')}
          />
          <FilaAjuste
            rotulo="Texto"
            vacio=""
            disabled={ocupado}
            icono={<IconType size={17} color={ICON_COLOR.muted} />}
            onPress={() => elegir('texto')}
          />
          <FilaAjuste
            rotulo="Imagen"
            vacio=""
            disabled={ocupado}
            icono={<IconImage size={17} color={ICON_COLOR.muted} />}
            onPress={() => void elegirImagen()}
          />
          <FilaAjuste
            rotulo="Espaciador"
            vacio=""
            disabled={ocupado}
            icono={<IconEspacio size={17} color={ICON_COLOR.muted} />}
            onPress={() => elegir('espaciador')}
            ultima
          />
        </GrupoAjustes>

      </ListaPiezas>
    </Hoja>
  )
}

/** iOS tiene una sola lista nativa; nunca una List dentro de otro scroll. */
function ListaPiezas({ children, piso }: { children: ReactNode; piso: number }) {
  if (Platform.OS === 'ios') return <ListaAjustes piso={piso}>{children}</ListaAjustes>
  return <ScrollView style={{ flex: 1 }} contentContainerClassName="gap-6 px-5 pt-2"
    contentContainerStyle={{ paddingBottom: piso, maxWidth: ANCHO_HOJA, width: '100%', alignSelf: 'center' }}>
    {children}
  </ScrollView>
}
