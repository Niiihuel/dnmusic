import { EntradaTexto } from '../../src/ui/EntradaTexto'
import { AccionSocial } from '../../src/ui/Social'
import { FuentePerfil } from '../../src/ui/FuentePerfil'
import { useEffect, useRef, useState } from 'react'
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { artworkSource } from '../../src/lib/artwork'
import { mensajeError } from '../../src/lib/mensajeError'
import { pickImage } from '../../src/lib/pickImage'
import { estiloDeFuente } from '../../src/lib/fuentes'
import { coloresDe, nombreDeTema, temaEfectivo } from '../../src/lib/tema'
import { volver } from '../../src/lib/volver'
import {
  addShowcase,
  payloadDe,
  esVideo,
  ROTULO_TIPO,
  updateShowcase,
  uploadIlustracion,
  type Showcase,
} from '../../src/services/showcases'
import { avisar } from '../../src/state/aviso'
import { useUser } from '../../src/state/session'
import { usePerfilBorrador, usePerfilEdicion } from '../../src/state/perfilEdicion'
import { borradorVitrinaCompleto, idVitrinaTemporal, ponerVitrinaEdicion } from '../../src/state/mosaicoEdicion'
import { actualizarBorrador, limpiarBorrador, useBorrador } from '../../src/state/vitrinaBorrador'
import { FilaAjuste, GrupoAjustes, IconoAjuste } from '../../src/ui/Ajustes'
import { BotonHoja, EncabezadoHoja } from '../../src/ui/EncabezadoHoja'
import { BarraCambiosPerfil } from '../../src/ui/BarraCambiosPerfil'
import { useSalidaConCambios } from '../../src/ui/useSalidaConCambios'
import { Segmentado } from '../../src/ui/Segmentado'
import { PLACEHOLDER_COLOR } from '../../src/ui/Field'
import { Menu } from '../../src/ui/Menu'
import { Hoja, useHojaModal, usePisoHoja } from '../../src/ui/Hoja'
import { Panel } from '../../src/ui/Panel'
import { GrillaDeMiniaturas, rotuloDePiezas, Superficie, useMiniaturas, Vitrina } from '../../src/ui/Vitrina'
import {
  ICON_COLOR,
  IconBan,
  IconCamera,
  IconChevronRight,
  IconEncuadre,
  IconImage,
  IconLyrics,
  IconMusic,
  IconPalette,
} from '../../src/ui/icons'

const MAX_W = 520

/**
 * El editor de una vitrina: la pieza arriba, tal cual va a quedar, y debajo
 * las filas que la cambian.
 *
 * Es la pantalla «tilde …» de Airbuds. La vista previa no es un dibujo aparte:
 * es **la misma `Vitrina`** que se dibuja en el perfil, alimentada con el
 * borrador, así que lo que se ve acá es lo que queda. Elegir un tema desde la
 * hoja cambia el borrador y la vista previa se pinta sola.
 *
 * Trabaja sobre `state/vitrinaBorrador` y no sobre la base: nada se guarda
 * hasta el botón de abajo. Salir sin guardar no toca la vitrina de verdad.
 */
export default function EditarVitrina() {
  const router = useRouter()
  const user = useUser()
  const perfil = usePerfilBorrador()
  const edicion = usePerfilEdicion()
  const global = !!user && edicion.ownerId === user.id
  const piso = usePisoHoja(24)
  /* En escritorio esto es una ventana centrada y no una pantalla a lo ancho:
     un editor de 520px estirado a 1400 se lee como un teléfono gigante. */
  const modal = useHojaModal()
  const borrador = useBorrador()
  const [guardando, setGuardando] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [inicial] = useState(borrador)
  const [temporal] = useState(idVitrinaTemporal)
  const [error, setError] = useState<string | null>(null)
  const [altoBarra, setAltoBarra] = useState(130)
  const [salida, setSalida] = useState<{ creado: string | null; subspace: boolean } | null>(null)
  const enVuelo = useRef(false)
  const cambiado = !!borrador && (borrador.id === null || JSON.stringify(borrador) !== JSON.stringify(inicial))
  const dialogoSalida = useSalidaConCambios(!global && cambiado && !salida, (!global && guardando || subiendo) && !salida, limpiarBorrador)
  useEffect(() => {
    if (!salida) return
    limpiarBorrador()
    if (salida.creado && salida.subspace && user) {
      router.replace({ pathname: '/profile/subspace', params: { owner: user.id, id: salida.creado, armar: '1' } })
    } else volver(router, '/profile')
  }, [salida, router, user])

  // Los cambios de tema, fuente y encuadre llegan por el mismo borrador incluso
  // mientras esta hoja está detrás de otra; se conservan en la sesión global.
  useEffect(() => {
    if (global && user && borrador && !edicion.ocupado) {
      ponerVitrinaEdicion(user.id, borrador, temporal, inicial, borradorVitrinaCompleto(borrador))
    }
  }, [global, user, borrador, temporal, inicial, edicion.ocupado])

  function listo() {
    if (subiendo || edicion.ocupado) return
    if (global && user && borrador) {
      const id = ponerVitrinaEdicion(user.id, borrador, temporal, inicial, borradorVitrinaCompleto(borrador))
      if (borrador.kind === 'subspace' && !borrador.id && borradorVitrinaCompleto(borrador)) {
        router.replace({ pathname: '/profile/subspace', params: { owner: user.id, id, armar: '1' } })
        return
      }
    }
    volver(router, '/profile')
  }

  function restablecer() {
    if (enVuelo.current || subiendo || !inicial) return
    actualizarBorrador(inicial)
    setError(null)
  }

  if (!borrador) {
    /* Se entró sin nada armado —una recarga en la web—: no hay qué editar. */
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center gap-4 px-8" edges={['top']}>
        <Text className="text-muted-foreground text-center text-footnote">No hay ninguna pieza a medio armar.</Text>
        <AccionSocial label="Volver al perfil" secundaria onPress={() => volver(router, '/profile')} />
      </SafeAreaView>
    )
  }

  const { kind, contenido, estilo } = borrador
  const nueva = borrador.id === null
  /* Las que se escriben encima de la vista previa. El sub-space también: su
     título es lo único que tiene, y se escribe sobre la tarjeta como el del
     encabezado. */
  const deTexto = kind === 'texto' || kind === 'encabezado' || kind === 'letra' || kind === 'subspace'
  const conMusica = kind === 'cancion' || kind === 'artista' || kind === 'album' || kind === 'letra'
  /* Un encabezado se viste solo con tema; un espacio, con nada. */
  const conFondo = kind !== 'encabezado' && kind !== 'espaciador' && kind !== 'imagen'
  const conTema = kind !== 'espaciador' && kind !== 'imagen'

  const texto =
    contenido?.kind === 'texto'
      ? contenido.texto
      : contenido?.kind === 'encabezado' || contenido?.kind === 'subspace'
        ? contenido.titulo
        : contenido?.kind === 'letra'
          ? contenido.letra.texto
          : ''

  function escribir(t: string) {
    actualizarBorrador((b) => {
      const c = b.contenido
      if (c?.kind === 'texto') return { contenido: { kind: 'texto', texto: t } }
      if (c?.kind === 'encabezado') return { contenido: { kind: 'encabezado', titulo: t } }
      if (c?.kind === 'subspace') return { contenido: { kind: 'subspace', titulo: t } }
      if (c?.kind === 'letra') return { contenido: { kind: 'letra', letra: { ...c.letra, texto: t } } }
      return {}
    })
  }

  /* Qué se eligió de música, para la fila de arriba de todo. */
  const elegido =
    contenido?.kind === 'cancion' || contenido?.kind === 'fragmento'
      ? { nombre: contenido.cancion.title, tapa: artworkSource(contenido.cancion.artworkPath ?? undefined, contenido.cancion.artworkUrl, 96) }
      : contenido?.kind === 'artista'
        ? { nombre: contenido.artista.nombre, tapa: contenido.artista.fotoUrl || null }
        : contenido?.kind === 'album'
          ? { nombre: contenido.album.titulo, tapa: contenido.album.tapaUrl || null }
          : contenido?.kind === 'letra' && (contenido.letra.title || contenido.letra.artist)
            ? { nombre: contenido.letra.title || contenido.letra.artist, tapa: contenido.letra.artworkUrl ?? null }
            : null

  const completa =
    contenido !== null &&
    (!deTexto || texto.trim().length > 0) &&
    (kind !== 'letra' || (contenido.kind === 'letra' && !!(contenido.letra.title || contenido.letra.artist)))

  async function guardar() {
    if (global) { listo(); return }
    if (!user || !borrador || !contenido || !completa || !cambiado || enVuelo.current || subiendo) return
    enVuelo.current = true
    setError(null)
    setGuardando(true)
    try {
      const payload = payloadDe(contenido)
      let creado: string | null = null
      if (borrador.id) {
        await updateShowcase(borrador.id, { payload, estilo, ancho: borrador.ancho })
      } else {
        creado = await addShowcase(user.id, kind, payload, borrador.ancho, estilo, borrador.parentId)
      }
      avisar(nueva ? 'Agregada al mosaico' : 'Guardada')
      /*
       * Un sub-space recién creado se abre **adentro y armando**: lo que
       * uno quiere después de ponerle nombre es llenarlo, y volver al perfil
       * para tocar la pieza y después el lápiz eran dos pasos que preguntaban
       * «¿y ahora qué?». La pieza vacía no dice nada por sí sola.
       */
      setSalida({ creado, subspace: kind === 'subspace' })
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      enVuelo.current = false
      setGuardando(false)
    }
  }

  /* La imagen puesta, sea el fondo de la pieza o la pieza misma. */
  const imagenPuesta = kind === 'imagen' ? (contenido?.kind === 'imagen' ? contenido.imagen : null) : estilo.fondo
  /* Un clip no se encuadra: la pantalla trabaja sobre una imagen quieta. */
  const encuadrable = imagenPuesta !== null && !esVideo(imagenPuesta.path)

  /** La pantalla de encuadre, sobre el borrador: escribe ahí, no en la base. */
  function encuadrar() {
    router.push({
      pathname: '/perfil/encuadrar',
      params: { que: kind === 'imagen' ? 'vitrina-imagen' : 'vitrina' },
    })
  }

  /**
   * La imagen de fondo: se sube al elegirla y queda en el borrador. Para una
   * vitrina de imagen, la foto elegida **es** el contenido y no el fondo.
   *
   * Recién subida se abre el encuadre, como el recorte que Airbuds ofrece
   * después de elegir — salvo que acá no se recorta nada: la imagen ya subió
   * entera y lo que se elige es cómo mirarla. Volver sin tocar nada la deja
   * cubriendo y centrada, que es como venía.
   */
  async function ponerImagen(desdeCamara: boolean) {
    if (!user || subiendo || enVuelo.current) return
    setSubiendo(true)
    try {
      const elegida = await pickImage({ desdeCamara })
      if (!elegida) return
      const ruta = await uploadIlustracion(user.id, elegida.blob, elegida.fileName, elegida.mime)
      const imagen = { path: ruta, encuadre: null }
      if (kind === 'imagen') actualizarBorrador({ contenido: { kind: 'imagen', imagen } })
      else actualizarBorrador((b) => ({ estilo: { ...b.estilo, fondo: imagen } }))
      if (!esVideo(ruta)) encuadrar()
    } catch (e) {
      avisar((e as Error).message || 'No se pudo subir la imagen', true)
    } finally {
      setSubiendo(false)
    }
  }

  function sacarImagen() {
    actualizarBorrador((b) => ({ estilo: { ...b.estilo, fondo: null } }))
  }

  const titulo = nueva ? ROTULO_TIPO[kind] : `Editar ${ROTULO_TIPO[kind].toLowerCase()}`
  const temaGlobal = perfil?.tema ?? null

  return (
    <FuentePerfil fuente={perfil?.fuente}>
      <Hoja onCerrar={global ? listo : undefined}>
        {dialogoSalida}
        <SafeAreaView className="flex-1 bg-background" edges={['top']}>
          <View className="flex-1">
            <EncabezadoHoja
              titulo={titulo}
              izquierda={<BotonHoja tipo="cerrar" label="Cerrar editor" onPress={global ? listo : () => volver(router, '/profile')} />}
              derecha={global ? <AccionSocial label="Listo" secundaria expandida={false} onPress={listo} disabled={subiendo || edicion.ocupado} /> : undefined}
            />

            <Panel className="flex-1">
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                className="flex-1"
              >
                <ScrollView
                  contentContainerClassName="items-center px-4 pt-4"
                  contentContainerStyle={{ paddingBottom: (modal ? 24 : piso) + (!global && (cambiado || guardando || subiendo || error) ? altoBarra + 16 : 0) }}
                  keyboardShouldPersistTaps="handled"
                >
                  <View pointerEvents={guardando || subiendo || edicion.ocupado ? 'none' : 'auto'} className="w-full gap-7" style={{ maxWidth: MAX_W }}>
                    {/*
                     * La vista previa, con el tamaño que va a tener: a media fila
                     * ocupa la mitad del ancho, centrada, así se ve lo que entra.
                     */}
                    <View className="items-center py-4">
                      <View
                        style={{
                          width: borrador.ancho === 'mitad' ? '52%' : '100%',
                          maxWidth: borrador.ancho === 'mitad' ? 220 : 420,
                        }}
                      >
                        {deTexto ? (
                          <PrevioDeTexto
                            borrador={borrador}
                            texto={texto}
                            onTexto={escribir}
                            temaGlobal={temaGlobal}
                            tapa={
                              contenido?.kind === 'letra'
                                ? (contenido.letra.artworkUrl ?? null)
                                : null
                            }
                            firma={
                              contenido?.kind === 'letra' &&
                              (contenido.letra.title || contenido.letra.artist)
                                ? /* Un verso firmado solo con el artista no lleva la raya con un lado vacío. */
                                  [contenido.letra.artist, contenido.letra.title]
                                    .filter(Boolean)
                                    .join(' — ')
                                : null
                            }
                          />
                        ) : contenido ? (
                          <View pointerEvents="none">
                            <Vitrina
                              showcase={
                                {
                                  id: 'borrador',
                                  ancho: borrador.ancho,
                                  estilo,
                                  ...contenido,
                                } as Showcase
                              }
                              estilo={estilo}
                              temaGlobal={temaGlobal}
                              playlists={null}
                              esMio
                              playing={false}
                              onTogglePlay={() => undefined}
                              onOpenPlaylist={() => undefined}
                            />
                          </View>
                        ) : (
                          <AccionSocial label={`Elegir ${ROTULO_TIPO[kind].toLowerCase()}`} secundaria onPress={() => router.push({ pathname: '/profile/elegir', params: { que: kind, desde: 'editor' } })} />
                        )}
                      </View>
                    </View>

                    {kind === 'cancion' || kind === 'fragmento' ? (
                      <View className="gap-2">
                        <Text className="px-1 text-muted-foreground text-footnote font-semibold uppercase">
                          Cómo se muestra
                        </Text>
                        <Segmentado
                          label="Cómo se muestra la canción"
                          value={estilo.presentacion ?? 'completa'}
                          options={[
                            { value: 'portada', label: 'Portada' },
                            { value: 'reproductor', label: 'Reproductor' },
                            { value: 'completa', label: 'Ambas' },
                          ]}
                          onChange={(modo) =>
                            actualizarBorrador((b) => ({ estilo: { ...b.estilo, presentacion: modo } }))
                          }
                        />
                      </View>
                    ) : null}
                    <GrupoAjustes>
                      {conMusica ? (
                        <FilaAjuste
                          rotulo={elegido?.nombre ?? ROTULO_TIPO[kind]}
                          vacio={elegido ? '' : 'Elegí una'}
                          valor={elegido ? 'Cambiar' : null}
                          icono={
                            elegido?.tapa ? (
                              <Image
                                source={{ uri: elegido.tapa }}
                                style={{ width: 30, height: 30, borderRadius: 8 }}
                              />
                            ) : kind === 'letra' ? (
                              <IconLyrics size={17} color={ICON_COLOR.muted} />
                            ) : (
                              <IconMusic size={17} color={ICON_COLOR.muted} />
                            )
                          }
                          onPress={() =>
                            router.push({
                              pathname: '/profile/elegir',
                              params: { que: kind, desde: 'editor' },
                            })
                          }
                          ultima={!conTema && !conFondo && kind !== 'imagen'}
                        />
                      ) : null}
                      {conTema ? (
                        <FilaAjuste
                          rotulo="Tema"
                          valor={nombreDeTema(estilo.tema)}
                          vacio={
                            temaGlobal
                              ? `Del perfil (${nombreDeTema(temaGlobal) ?? 'propio'})`
                              : 'Ninguno'
                          }
                          icono={<IconPalette size={17} color={ICON_COLOR.muted} />}
                          onPress={() =>
                            router.push({ pathname: '/profile/tema', params: { para: 'vitrina' } })
                          }
                          ultima={!conFondo}
                        />
                      ) : null}
                      {conFondo || kind === 'imagen' ? (
                        <FilaImagen
                          rotulo={kind === 'imagen' ? 'Imagen' : 'Imagen de fondo'}
                          puesta={
                            kind === 'imagen' ? contenido?.kind === 'imagen' : estilo.fondo !== null
                          }
                          subiendo={subiendo}
                          sinNinguno={kind === 'imagen'}
                          onNinguno={sacarImagen}
                          onCamara={() => void ponerImagen(true)}
                          onGaleria={() => void ponerImagen(false)}
                          ultima={!encuadrable}
                        />
                      ) : null}
                      {encuadrable ? (
                        /* Encuadrar es distinto de cambiar: la imagen ya está, lo
                       que se elige es qué pedazo se ve y cómo gira. */
                        <FilaAjuste
                          rotulo="Encuadre"
                          valor={
                            imagenPuesta.encuadre
                              ? imagenPuesta.encuadre.rotacion
                                ? `Girada ${imagenPuesta.encuadre.rotacion}°`
                                : 'Ajustado'
                              : null
                          }
                          vacio="Al centro"
                          icono={<IconEncuadre size={17} color={ICON_COLOR.muted} />}
                          onPress={encuadrar}
                          ultima
                        />
                      ) : null}
                    </GrupoAjustes>

                  </View>
                </ScrollView>
                {!global ? <BarraCambiosPerfil visible={cambiado} ocupado={guardando || subiendo} error={error}
                  puedeGuardar={completa && !!user} onRestablecer={restablecer} onGuardar={() => void guardar()}
                  abajo={modal ? 12 : piso} onAltura={setAltoBarra} /> : null}
              </KeyboardAvoidingView>
            </Panel>
          </View>
        </SafeAreaView>
      </Hoja>
    </FuentePerfil>
  )
}

/**
 * La vista previa de una pieza de texto **se escribe encima**: la tarjeta es
 * el campo. Es lo que hace Airbuds con el encabezado, el texto y las letras,
 * y es lo que evita tener la pieza arriba y un formulario abajo diciendo lo
 * mismo dos veces.
 */
function PrevioDeTexto({
  borrador,
  texto,
  onTexto,
  temaGlobal,
  tapa,
  firma,
}: {
  borrador: { id: string | null; kind: string; ancho: string; estilo: Showcase['estilo'] }
  texto: string
  onTexto: (t: string) => void
  temaGlobal: Showcase['estilo']['tema']
  tapa: string | null
  firma: string | null
}) {
  const colores = coloresDe(temaEfectivo(borrador.estilo.tema, temaGlobal))
  const c = borrador.estilo.fondo
    ? { ...colores, texto: '#FFFFFF', secundario: 'rgba(255,255,255,0.75)' }
    : colores
  const fuentePerfil = usePerfilBorrador()?.fuente
  const encabezado = borrador.kind === 'encabezado'
  const letra = borrador.kind === 'letra'
  const subspace = borrador.kind === 'subspace'
  const grande = borrador.ancho === 'grande'
  /* Un sub-space que ya existe muestra sus tapas de verdad; uno nuevo, la
     grilla vacía: todavía no tiene nada adentro. */
  const miniaturas = useMiniaturas(subspace ? borrador.id : null)

  if (subspace) {
    return (
      <Superficie colores={colores} fondo={borrador.estilo.fondo} radius={16}>
        <View className="gap-3 p-3">
          <View className="items-center">
            <GrillaDeMiniaturas tapas={miniaturas?.tapas ?? []} c={c} lado={grande ? 132 : 84} />
          </View>
          <View className="gap-0.5">
            <Text className="text-footnote font-semibold uppercase" style={{ color: c.secundario }}>
              Sub-space
            </Text>
            <EntradaTexto
              value={texto}
              onChangeText={onTexto}
              placeholder="Título"
              placeholderTextColor={PLACEHOLDER_COLOR}
              maxLength={40}
              autoFocus
              className="text-subheadline font-bold"
              style={[
                { color: c.texto, minHeight: 24, paddingVertical: 2 },
                estiloDeFuente(fuentePerfil, 15),
              ]}
            />
            <Text className="text-caption1" style={{ color: c.secundario }}>
              {/* Vacío y nuevo, la tarjeta dice qué viene: adentro se ponen
                  canciones, artistas, textos, lo mismo que en el mosaico. */}
              {miniaturas?.cuantas
                ? rotuloDePiezas(miniaturas.cuantas)
                : 'Al guardar se abre para llenarlo: canciones, artistas, textos…'}
            </Text>
          </View>
        </View>
      </Superficie>
    )
  }

  return (
    <Superficie colores={colores} fondo={borrador.estilo.fondo} radius={encabezado ? 999 : 16}>
      <View className={encabezado ? 'px-5 py-2' : 'gap-3 p-3'}>
        {letra ? (
          <View className="flex-row items-center justify-between">
            {tapa ? (
              <Image source={{ uri: tapa }} style={{ width: 36, height: 36, borderRadius: 6 }} />
            ) : (
              <View />
            )}
            <IconLyrics size={15} color={c.secundario} />
          </View>
        ) : null}
        <EntradaTexto
          value={texto}
          onChangeText={onTexto}
          placeholder={encabezado ? 'Título' : letra ? 'Tus letras' : 'Tu texto'}
          placeholderTextColor={PLACEHOLDER_COLOR}
          multiline={!encabezado}
          maxLength={encabezado ? 40 : 280}
          autoFocus
          textAlign={encabezado ? 'center' : 'left'}
          className={
            encabezado
              ? 'text-subheadline font-bold'
              : letra
                ? grande
                  ? 'text-title2 font-semibold italic'
                  : 'text-body font-semibold italic leading-6'
                : grande
                  ? 'text-title3'
                  : 'text-subheadline leading-6'
          }
          style={[
            { color: c.texto, minHeight: encabezado ? 24 : 72, paddingVertical: 4 },
            estiloDeFuente(
              fuentePerfil,
              encabezado ? 15 : letra ? (grande ? 24 : 17) : grande ? 19 : 15,
            ),
          ]}
        />
        {letra ? (
          <Text className="text-caption2" numberOfLines={1} style={{ color: c.secundario }}>
            {firma ?? 'Elegí de qué canción es'}
          </Text>
        ) : null}
      </View>
    </Superficie>
  )
}

/**
 * La fila de la imagen: una fila de Ajustes que abre las tres puertas —
 * ninguna, la cámara, la galería— en un menú, como el de Airbuds.
 */
function FilaImagen({
  rotulo,
  puesta,
  subiendo,
  sinNinguno,
  onNinguno,
  onCamara,
  onGaleria,
  ultima = true,
}: {
  rotulo: string
  puesta: boolean
  subiendo: boolean
  /** Para la vitrina de imagen: sin foto no hay vitrina, así que no se ofrece sacarla. */
  sinNinguno: boolean
  onNinguno: () => void
  onCamara: () => void
  onGaleria: () => void
  /** Como en `FilaAjuste`: la última del bloque no lleva la línea de separación. */
  ultima?: boolean
}) {
  return (
    <Menu
      label={rotulo}
      triggerFullWidth
      items={[
        ...(sinNinguno
          ? []
          : [
              {
                label: 'Ninguna',
                onPress: onNinguno,
                icon: <IconBan size={15} color={ICON_COLOR.muted} />,
                sfSymbol: 'circle.slash' as const,
              },
            ]),
        {
          label: 'Cámara',
          onPress: onCamara,
          icon: <IconCamera size={15} color={ICON_COLOR.muted} />,
          sfSymbol: 'camera' as const,
        },
        {
          label: 'Galería',
          onPress: onGaleria,
          icon: <IconImage size={15} color={ICON_COLOR.muted} />,
          sfSymbol: 'photo.on.rectangle' as const,
        },
      ]}
      trigger={
        <View className="w-full flex-row items-center gap-3 px-4">
          <IconoAjuste>
            <IconImage size={17} color={ICON_COLOR.muted} />
          </IconoAjuste>
          <View
            className={`min-w-0 flex-1 flex-row items-center gap-3 py-3.5 ${
              ultima ? '' : 'border-b border-muted'
            }`}
          >
            <Text className="shrink-0 text-foreground text-subheadline">{rotulo}</Text>
            <Text className="min-w-0 flex-1 text-right text-subheadline text-muted-foreground" numberOfLines={1}>
              {subiendo ? 'Subiendo…' : puesta ? 'Puesta' : 'Ninguna'}
            </Text>
            <IconChevronRight size={16} color={ICON_COLOR.muted} />
          </View>
        </View>
      }
    />
  )
}
