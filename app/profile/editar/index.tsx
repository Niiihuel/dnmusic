import { useEffect, useRef, useState, type ReactNode } from 'react'
import { TarjetaPerfil } from '../../../src/ui/TarjetaPerfil'
import { esDiscord, useCatalogoDiscord } from '../../../src/services/discordCatalogo'
import { fuenteDe } from '../../../src/lib/fuentes'
import { Confirmar } from '../../../src/ui/Confirmar'
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Avatar } from '../../../src/ui/Avatar'
import { BotonLateral, CabeceraLateral } from '../../../src/ui/CabeceraLateral'
import { CollapsedSidebar } from '../../../src/ui/SidebarMotion'
import { Panel, Shell } from '../../../src/ui/Panel'
import { FilaAjuste, FilaInterruptor, GrupoAjustes } from '../../../src/ui/Ajustes'
import { FilaCampo, useEditorDeCampo } from '../../../src/ui/EditorDeCampo'
import { BarraCambiosPerfil } from '../../../src/ui/BarraCambiosPerfil'
import { useSalidaConCambios } from '../../../src/ui/useSalidaConCambios'
import { getSupabase } from '../../../src/lib/supabase'
import { ICON_COLOR, IconAt, IconBack, IconClose, IconCollapseLeft, IconCollapseRight, IconEye, IconEyeOff, IconGrilla, IconHeading, IconImage, IconLock, IconMessage, IconPalette, IconSparkles, IconType, IconUser, type IconProps } from '../../../src/ui/icons'
import { removeAvatar, saveMyProfile, uploadAvatar, type Profile } from '../../../src/services/profile'
import { BarraDeProgreso, porciento } from '../../../src/ui/Progreso'
import { FondoPerfil } from '../../../src/ui/PerfilPublico'
import { nombreDeEfecto } from '../../../src/ui/EfectosDibujados'
import { nombreDePlaca } from '../../../src/ui/Placas'
import { esDecoracionPropia } from '../../../src/services/decoraciones'
import { Marco, MARCOS } from '../../../src/ui/Marco'
import { pickImage } from '../../../src/lib/pickImage'
import { esVideo, uploadIlustracionConProgreso } from '../../../src/services/showcases'
import { setMyProfile, useMyProfile, useUser } from '../../../src/state/session'
import { useKeyboardH, usePiso } from '../../../src/state/shell'
import { avisar } from '../../../src/state/aviso'
import { actualizarPerfilEdicion, cambiosParaGuardar, confirmarPerfilEdicion, getPerfilEdicion, iniciarPerfilEdicion, ocuparPerfilEdicion, restablecerPerfilEdicion, terminarPerfilEdicion, usePerfilBorrador, usePerfilEdicion } from '../../../src/state/perfilEdicion'
import { cambioMosaicosEdicion, guardarMosaicosEdicion, restablecerMosaicosEdicion, terminarMosaicosEdicion, useMosaicosEdicion, validarMosaicosEdicion } from '../../../src/state/mosaicoEdicion'
import { volver } from '../../../src/lib/volver'

/** Desde acá la pantalla es la de macOS: barra lateral con las secciones y el detalle al lado. */
const ESCRITORIO_PX = 780
const LATERAL_W = 210
/** Tope del detalle: una lista agrupada más ancha se lee como una tabla. */
const MAX_W = 640

type Seccion = {
  id: string
  titulo: string
  icono: (p: IconProps) => React.ReactElement
  bloques: ReactNode
}

/**
 * Editar el perfil: todo lo que se toca, en un solo lugar.
 *
 * La separación es la de Discord: el perfil **muestra** y no tiene un solo
 * control de edición encima; para cambiar algo se entra acá. Antes estaban
 * mezclados —la identidad arriba y debajo los campos y las cruces de las
 * vitrinas— así que mirar tu perfil y editarlo eran la misma pantalla, y no se
 * podía ver cómo te ve otro sin los botones puestos por encima.
 *
 * Tiene la anatomía de Configuración: **en el teléfono** es la lista agrupada
 * de iOS —la foto arriba, los bloques debajo, cada campo de texto en su propia
 * pantalla apilada (`[campo].tsx`)—; **en la compu** es Ajustes del Sistema,
 * una barra lateral con las secciones y el detalle al lado. Identidad,
 * privacidad y medios comparten un borrador y una sola barra de confirmación,
 * también al cambiar de sección.
 */
export default function EditarPerfil() {
  const router = useRouter()
  const user = useUser()
  const guardado = useMyProfile()
  const piso = usePiso(24)
  const teclado = useKeyboardH()
  const pisoVisible = teclado > 0 ? 24 : piso
  const { width } = useWindowDimensions()
  const escritorio = width >= ESCRITORIO_PX

  const [quitar, setQuitar] = useState<'foto' | 'fondo' | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [subiendoFondo, setSubiendoFondo] = useState(false)
  const [progresoFondo, setProgresoFondo] = useState<number | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [altoBarra, setAltoBarra] = useState(0)
  const [previaMovil, setPreviaMovil] = useState(false)
  const edicion = usePerfilEdicion()
  const profile = usePerfilBorrador()
  const setBorrador = (actualizar: (perfil: Partial<Profile>) => Partial<Profile>) => actualizarPerfilEdicion(actualizar(edicion.cambios))
  const enVuelo = useRef(false)
  const temporales = useRef(new Map<string, 'avatars' | 'showcases'>())
  const ocupado = guardando || uploading || subiendoFondo
  const nombreEditor = useEditorDeCampo('nombre', undefined, ocupado)
  const usuarioEditor = useEditorDeCampo('usuario', undefined, ocupado)
  const lineaEditor = useEditorDeCampo('linea', undefined, ocupado)
  const mosaicos = useMosaicosEdicion(guardado?.userId ?? null)
  const cambiado = edicion.ownerId === guardado?.userId && (Object.keys(edicion.cambios).length > 0 || cambioMosaicosEdicion(mosaicos))
  const errorMosaico = guardado ? validarMosaicosEdicion(guardado.userId) : null
  const valido = !errorMosaico && [nombreEditor, usuarioEditor, lineaEditor].every(e => !e.cambiado || e.puedeGuardar)
  const dialogo = useSalidaConCambios(cambiado, ocupado, restablecer)
  const { catalogo } = useCatalogoDiscord([profile?.marco, profile?.efecto, profile?.placa, profile?.marcoPerfil].some(esDiscord))
  const nombreCosmetico = (id: string | null | undefined) => catalogo?.piezas.find(p => p.id === id)?.nombre ?? (esDiscord(id) ? 'Decoración de Discord' : null)

  useEffect(() => { if (guardado) iniciarPerfilEdicion(guardado) }, [guardado])
  const ownerId = guardado?.userId
  useEffect(() => {
    if (!ownerId) return
    return () => { terminarPerfilEdicion(ownerId); terminarMosaicosEdicion(ownerId) }
  }, [ownerId])

  useEffect(() => {
    ocuparPerfilEdicion(ocupado)
  }, [ocupado])

  useEffect(() => {
    const archivos = temporales.current
    return () => {
      // Solo archivos nuevos que nunca se intentaron asignar a un perfil.
      for (const [ruta, bucket] of archivos) void getSupabase().storage.from(bucket).remove([ruta]).catch(() => {})
      archivos.clear()
    }
  }, [])

  function restablecer() {
    if (enVuelo.current) return
    restablecerPerfilEdicion()
    if (guardado) restablecerMosaicosEdicion(guardado.userId)
    setError(null)
    for (const [ruta, bucket] of temporales.current) void getSupabase().storage.from(bucket).remove([ruta]).catch(() => {})
    temporales.current.clear()
  }

  async function guardarCambios() {
    if (!profile || !guardado || !cambiado || !valido || enVuelo.current) return
    enVuelo.current = true
    setGuardando(true)
    setError(null)
    const cambios = cambiosParaGuardar(profile, edicion.cambios)
    // Si la respuesta se pierde después de guardar, no borrar archivos que la DB podría estar usando.
    temporales.current.clear()
    try {
      if (Object.keys(cambios).length) {
        const next = await saveMyProfile(cambios)
        if (getPerfilEdicion().ownerId !== next.userId) return
        setMyProfile(next)
        confirmarPerfilEdicion(next)
        if (guardado.avatarPath && guardado.avatarPath !== next.avatarPath) void removeAvatar(guardado.avatarPath).catch(() => {})
      }
      await guardarMosaicosEdicion(guardado.userId)
      avisar('Cambios del perfil guardados')
    } catch (e) {
      setError(`No se pudo completar el guardado. Los cambios pendientes siguen en el borrador; podés reintentar. ${(e as { message?: string })?.message ?? ''}`)
    } finally {
      enVuelo.current = false
      setGuardando(false)
    }
  }

  function abrir(destino: Parameters<typeof router.push>[0]) {
    if (enVuelo.current) return
    router.push(destino)
  }

  async function subirFondo() {
    if (!user || enVuelo.current) return
    enVuelo.current = true
    setSubiendoFondo(true)
    setError(null)
    try {
      const elegida = await pickImage({ cuadrada: false, conVideo: true })
      if (!elegida) return
      setProgresoFondo(0)
      const ruta = await uploadIlustracionConProgreso(user.id, elegida.blob, elegida.fileName, elegida.mime, setProgresoFondo)
      temporales.current.set(ruta, 'showcases')
      setBorrador(b => ({ ...b, bannerPath: ruta, bannerEncuadre: null }))
    } catch (e) {
      setError((e as { message?: string })?.message || 'No se pudo preparar el fondo.')
    } finally {
      enVuelo.current = false
      setSubiendoFondo(false)
      setProgresoFondo(null)
    }
  }

  const avatarPath = profile?.avatarPath ?? null
  const puedeEncuadrarFondo = !!profile?.bannerPath && !esVideo(profile.bannerPath)
  const nombre = profile?.displayName?.trim() || profile?.username || '?'

  async function elegirFoto() {
    if (!user || enVuelo.current) return
    enVuelo.current = true
    setUploading(true)
    setError(null)
    try {
      const elegida = await pickImage()
      if (!elegida) return
      const ruta = await uploadAvatar(user.id, elegida.blob, elegida.fileName, elegida.mime)
      temporales.current.set(ruta, 'avatars')
      setBorrador(b => ({ ...b, avatarPath: ruta, avatarEncuadre: null }))
    } catch (e) {
      setError((e as { message?: string })?.message || 'No se pudo preparar la foto.')
    } finally {
      enVuelo.current = false
      setUploading(false)
    }
  }

  if (!profile) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color="#FFFFFF" />
      </SafeAreaView>
    )
  }

  /*
   * La foto, con lo que se puede hacer con ella. Va arriba en el teléfono y
   * como primer bloque de «Identidad» en la compu: es lo primero que uno
   * viene a cambiar.
   */
  const bloqueFoto = (
    <View className="items-center gap-4">
      <View style={{ width: 96, height: 96, margin: 12 }}><Avatar name={nombre} path={avatarPath} size={96} encuadre={profile.avatarEncuadre} /><Marco marco={profile.marco} size={96} /></View>
      <View className="flex-row items-center gap-2">
        <Pressable
          accessibilityRole="button"
          onPress={() => void elegirFoto()}
          disabled={ocupado}
          className="h-10 flex-row items-center gap-2 rounded-full bg-muted px-4 active:opacity-80"
        >
          {uploading ? <ActivityIndicator size="small" color={ICON_COLOR.muted} /> : null}
          <Text className="text-foreground text-[13px] font-semibold">
            {avatarPath ? 'Cambiar foto' : 'Subir foto'}
          </Text>
        </Pressable>
        {avatarPath ? (
          <>
            {/* Encuadrar es distinto de cambiar: la foto ya está, lo que se
                elige es qué pedazo se ve. Por eso vive al lado y no adentro de
                «cambiar foto». */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Encuadrar la foto"
              onPress={() => abrir({ pathname: '/perfil/encuadrar', params: { que: 'foto' } })}
              className="h-10 flex-row items-center rounded-full bg-muted px-4 active:opacity-80"
            >
              <Text className="text-foreground text-[13px] font-semibold">Encuadrar</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Quitar la foto"
              disabled={ocupado}
              onPress={() => { if (!enVuelo.current) setQuitar('foto') }}
              className="h-10 w-10 items-center justify-center rounded-full bg-muted active:opacity-80"
            >
              <IconClose size={16} color={ICON_COLOR.muted} />
            </Pressable>
          </>
        ) : null}
      </View>
      {error ? (
        <Text className="text-destructive text-xs">{error}</Text>
      ) : (
        <Text className="text-muted-foreground text-xs">
          JPG, PNG, WebP o GIF · hasta 8 MB. El GIF queda animado.
        </Text>
      )}
    </View>
  )

  /*
   * El bloque del fondo, el mismo en las dos formas.
   *
   * Con un fondo puesto, arriba va la **vista previa** —como el panel de
   * Fondo de pantalla en Ajustes, que muestra lo que elegiste antes de las
   * opciones— dibujada con el mismo `FondoPerfil` del perfil, velo incluido:
   * lo que se ve acá es lo que se ve allá. Debajo, las filas: cambiarlo,
   * encuadrarlo (solo una imagen) y quitarlo, que va última y sin flecha.
   */
  const conFondo = !!profile.bannerPath
  const bloqueFondo = (
    <GrupoAjustes
      titulo={escritorio ? undefined : 'Tu fondo'}
      pie={
        conFondo
          ? 'Se dibuja tal cual detrás de tu perfil, con el velo que hace legible el texto.'
          : 'Una imagen, un GIF o un clip. Se aplica al guardar los cambios.'
      }
    >
      {conFondo ? (
        <View className="px-4 pb-2 pt-4">
          <View className="overflow-hidden rounded-xl bg-muted" style={{ aspectRatio: 16 / 9 }}>
            <FondoPerfil bannerPath={profile.bannerPath} encuadre={profile.bannerEncuadre} efecto={profile.efecto} />
          </View>
        </View>
      ) : null}
      {progresoFondo !== null ? (
        <View className="px-4 pb-3 pt-2">
          <BarraDeProgreso
            valor={progresoFondo}
            rotulo={progresoFondo >= 1 ? 'Preparando vista previa…' : `Subiendo… ${porciento(progresoFondo)}`}
          />
        </View>
      ) : null}
      <FilaAjuste
        rotulo={conFondo ? 'Cambiar el fondo' : 'Elegir un fondo'}
        vacio={subiendoFondo ? 'Eligiendo…' : conFondo ? '' : 'Imagen, GIF o clip'}
        icono={<IconImage size={17} color={ICON_COLOR.muted} />}
        onPress={() => void subirFondo()}
        ultima={!conFondo}
      />
      {/* Solo con una imagen: un clip de fondo se dibuja con el reproductor
          de video y la pantalla de encuadre trabaja sobre una imagen quieta. */}
      {puedeEncuadrarFondo ? (
        <FilaAjuste
          rotulo="Encuadrar el fondo"
          vacio="Elegí qué parte se ve"
          icono={<IconImage size={17} color={ICON_COLOR.muted} />}
          onPress={() => abrir({ pathname: '/perfil/encuadrar', params: { que: 'fondo' } })}
        />
      ) : null}
      {conFondo ? (
        <FilaAjuste
          rotulo="Quitar el fondo"
          vacio=""
          destructivo
          onPress={() => { if (!enVuelo.current) setQuitar('fondo') }}
          ultima
        />
      ) : null}
    </GrupoAjustes>
  )

  const bloqueEstilo = (
    <GrupoAjustes titulo={escritorio ? undefined : 'Tu estilo'}>
      <FilaAjuste
        rotulo="Tipografía"
        valor={fuenteDe(profile.fuente)?.nombre}
        vacio="La del sistema"
        icono={<IconType size={17} color={ICON_COLOR.muted} />}
        onPress={() => abrir('/profile/fuente')}
      />
      <FilaAjuste
        rotulo="Marco de la foto"
        valor={
          profile.marco
            ? esDecoracionPropia(profile.marco)
              ? 'Tu decoración'
              : (nombreCosmetico(profile.marco) ?? MARCOS.find((m) => m.id === profile.marco)?.nombre ?? 'Decoración guardada')
            : null
        }
        vacio="Ninguno"
        icono={<IconPalette size={17} color={ICON_COLOR.muted} />}
        onPress={() => abrir({ pathname: '/profile/marco', params: { tipo: 'marco' } })}
      />
      {/* El efecto: una animación encima del fondo, como los «profile
          effects». Vive en el catálogo en imagen (`services/decoraciones`). */}
      <FilaAjuste
        rotulo="Efecto del perfil"
        valor={
          profile.efecto
            ? esDecoracionPropia(profile.efecto)
              ? 'Tu decoración'
              : (nombreCosmetico(profile.efecto) ?? nombreDeEfecto(profile.efecto) ?? 'Decoración guardada')
            : null
        }
        vacio="Ninguno"
        icono={<IconSparkles size={17} color={ICON_COLOR.muted} />}
        onPress={() => abrir({ pathname: '/profile/marco', params: { tipo: 'efecto' } })}
      />
      <FilaAjuste
        rotulo="Placa de nombre"
        valor={profile.placa ? (nombreCosmetico(profile.placa) ?? nombreDePlaca(profile.placa) ?? 'Decoración guardada') : null}
        vacio="Ninguna"
        icono={<IconHeading size={17} color={ICON_COLOR.muted} />}
        onPress={() => abrir({ pathname: '/profile/marco', params: { tipo: 'placa' } })}
      />
      <FilaAjuste rotulo="Marco de estadísticas" valor={nombreCosmetico(profile.marcoPerfil)} vacio="Ninguno"
        icono={<IconGrilla size={17} color={ICON_COLOR.muted} />}
        onPress={() => abrir({ pathname: '/profile/marco', params: { tipo: 'marcoPerfil' } })}
        ultima
      />
    </GrupoAjustes>
  )

  const bloquePrivacidad = (
    <GrupoAjustes
      titulo={escritorio ? undefined : 'Quién lo ve'}
      pie={
        profile.visibility === 'publico'
          ? 'Cualquiera con cuenta puede ver tu perfil y tus vitrinas.'
          : 'Solo vos podés ver tu perfil. Nadie más, ni con el enlace.'
      }
    >
      <FilaInterruptor
        rotulo="Perfil público"
        activo={profile.visibility === 'publico'}
        onCambiar={(activo) => {
          if (!enVuelo.current) setBorrador(b => ({ ...b, visibility: activo ? 'publico' : 'privado' }))
        }}
        icono={<IconLock size={17} color={ICON_COLOR.muted} />}
        ultima
      />
    </GrupoAjustes>
  )

  /*
   * El mosaico se arma **en el perfil**, no acá: cómo queda una pieza depende
   * de lo que tiene alrededor —el fondo, el tema, las vecinas—. Esta fila
   * vuelve al perfil con el modo de edición encendido.
   */
  const bloqueMosaico = (
    <GrupoAjustes
      titulo={escritorio ? undefined : 'Tu mosaico'}
      pie="Las piezas se arman sobre el perfil, con el fondo y el tema puestos, que es donde se ve cómo quedan."
    >
      <FilaAjuste rotulo="Tema del mosaico" vacio="Colores y acabado" icono={<IconPalette size={17} color={ICON_COLOR.muted} />}
        onPress={() => abrir({ pathname: '/profile/tema', params: { para: 'perfil' } })} />
      <FilaAjuste
        rotulo="Armar el mosaico"
        vacio="Piezas, temas y orden"
        icono={<IconGrilla size={17} color={ICON_COLOR.muted} />}
        onPress={() => {
          if (enVuelo.current) return
          router.push({ pathname: '/profile', params: { editar: '1' } })
        }}
        ultima
      />
    </GrupoAjustes>
  )


  const vistaPrevia = <View className="w-full gap-4" style={{ maxWidth: 390, alignSelf: 'center' }}>
    <Text className="text-muted-foreground text-[11px] px-3">{profile.visibility === 'publico' ? 'Público' : 'Solo vos'}</Text>
    <View style={{ padding: 24 }}><TarjetaPerfil perfil={profile} /></View>
  </View>
  const abrirProbador = <Pressable accessibilityRole="button" accessibilityLabel="Abrir el probador de personalización" onPress={() => abrir('/profile/marco')}
    className="gap-3 rounded-xl bg-card p-5 active:bg-muted">
    <View className="flex-row items-center gap-3"><IconSparkles size={22} color={ICON_COLOR.foreground} /><Text className="text-foreground text-[18px] font-bold">Encontrá tu estilo</Text></View>
    <Text className="text-muted-foreground text-[13px] leading-5">Decoraciones de Discord, diseños de DMusic y tus propias piezas. Combiná y probá. Guardá todo junto al volver al editor.</Text>
    <View className="self-start rounded-full bg-primary px-4 py-3"><Text className="text-primary-foreground text-[13px] font-bold">Personalizar perfil</Text></View>
  </Pressable>
  const confirmarQuitar = <Confirmar visible={quitar !== null} titulo={quitar === 'foto' ? '¿Quitar tu foto?' : '¿Quitar el fondo?'}
    mensaje="El cambio quedará en la vista previa hasta que elijas Guardar cambios."
    rotulo="Quitar del borrador" onCancelar={() => setQuitar(null)} onConfirmar={() => {
      if (enVuelo.current) return
      setBorrador(b => quitar === 'foto' ? { ...b, avatarPath: null, avatarEncuadre: null } : { ...b, bannerPath: null, bannerEncuadre: null })
      setQuitar(null)
    }} />
  const barra = <BarraCambiosPerfil visible={cambiado} ocupado={ocupado} error={error ?? errorMosaico}
    puedeGuardar={valido} onRestablecer={restablecer} onGuardar={() => void guardarCambios()}
    abajo={escritorio ? 16 : Math.max(12, pisoVisible)} onAltura={setAltoBarra} />
  const espacioBarra = cambiado || ocupado || error ? altoBarra + 32 : 0
  const identidad = <GrupoAjustes titulo={escritorio ? undefined : 'Tu identidad'}
    pie="Vacío, el nombre muestra tu usuario. Los cambios se guardan juntos al confirmar.">
    <FilaCampo compacto={!escritorio} cual="nombre" editor={nombreEditor} icono={<IconUser size={17} color={ICON_COLOR.muted} />} />
    <FilaCampo compacto={!escritorio} cual="usuario" editor={usuarioEditor} icono={<IconAt size={17} color={ICON_COLOR.muted} />} />
    <FilaCampo compacto={!escritorio} cual="linea" editor={lineaEditor} icono={<IconMessage size={17} color={ICON_COLOR.muted} />} ultima />
  </GrupoAjustes>

  if (!escritorio) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View className="flex-row items-center gap-3 px-3 py-1">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Volver al perfil"
            onPress={() => volver(router, '/profile')}
            className="h-11 w-11 items-center justify-center rounded-full active:bg-muted"
          >
            <IconBack size={19} color={ICON_COLOR.foreground} />
          </Pressable>
          <Text className="text-foreground text-[17px] font-semibold">Editar perfil</Text>
        </View>
        <ScrollView
          contentContainerClassName="px-4 pt-4"
          contentContainerStyle={{ paddingBottom: pisoVisible + espacioBarra }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-7">
            <PreviaPlegable abierta={previaMovil} onCambiar={() => setPreviaMovil(v => !v)}>{vistaPrevia}</PreviaPlegable>
            {abrirProbador}
            {bloqueFoto}
            {identidad}
            {bloqueFondo}
            {bloqueEstilo}
            {bloquePrivacidad}
            {bloqueMosaico}
          </View>
        </ScrollView>
        {barra}
        {confirmarQuitar}
        {dialogo}
        </KeyboardAvoidingView>
      </SafeAreaView>
    )
  }

  /* La compu: las secciones, con los campos de texto editándose en el detalle. */
  const secciones: Seccion[] = [
    {
      id: 'identidad',
      titulo: 'Identidad',
      icono: IconUser,
      bloques: (
        <>
          {bloqueFoto}
          {identidad}
        </>
      ),
    },
    { id: 'fondo', titulo: 'Fondo', icono: IconImage, bloques: bloqueFondo },
    { id: 'estilo', titulo: 'Apariencia', icono: IconPalette, bloques: <>{abrirProbador}{bloqueEstilo}</> },
    { id: 'privacidad', titulo: 'Quién lo ve', icono: IconLock, bloques: bloquePrivacidad },
    { id: 'mosaico', titulo: 'Mosaico', icono: IconGrilla, bloques: bloqueMosaico },
  ]

  return (
    <View className="flex-1">
    <Escritorio
      previa={vistaPrevia}
      espacioBarra={espacioBarra}
      secciones={secciones}
      cuenta={
        <View className="mx-2 flex-row items-center gap-3 px-2 py-2">
          <Avatar name={nombre} path={avatarPath} size={40} />
          <View className="min-w-0 flex-1">
            <Text className="text-foreground text-[15px] font-semibold" numberOfLines={1}>
              {nombre}
            </Text>
            <Text className="text-muted-foreground text-[12px]" numberOfLines={1}>
              @{profile.username}
            </Text>
          </View>
        </View>
      }
      onVolver={() => volver(router, '/profile')}
    />
    {barra}
    {confirmarQuitar}
    {dialogo}
    </View>
  )
}

/** La previa se pliega también cuando comparte la columna de edición. */
function PreviaPlegable({ abierta, onCambiar, children }: {
  abierta: boolean; onCambiar: () => void; children: ReactNode
}) {
  return <View className="w-full min-w-0">
    <CabeceraLateral titulo="Vista previa">
      <BotonLateral label={abierta ? 'Ocultar vista previa' : 'Mostrar vista previa'} onPress={onCambiar}
        icono={abierta ? <IconEyeOff size={17} color={ICON_COLOR.muted} /> : <IconEye size={17} color={ICON_COLOR.muted} />} />
    </CabeceraLateral>
    {abierta ? children : null}
  </View>
}

/** La misma navegación y riel plegado que Inicio, con confirmación fuera del layout. */
function Escritorio({ secciones, cuenta, onVolver, previa, espacioBarra }: {
  espacioBarra: number; previa: ReactNode; secciones: Seccion[]; cuenta: ReactNode; onVolver: () => void
}) {
  const [elegida, setElegida] = useState(secciones[0]?.id ?? '')
  const [anchoPanel, setAnchoPanel] = useState(0)
  const [seccionesPlegadas, setSeccionesPlegadas] = useState(false)
  const [previaPlegada, setPreviaPlegada] = useState(false)
  const [hoverIzquierdo, setHoverIzquierdo] = useState(false)
  const [hoverDerecho, setHoverDerecho] = useState(false)
  // Reserva al menos 460px para los campos; mide el panel, no la ventana.
  const lateralPrevia = anchoPanel >= LATERAL_W + 350 + 460
  const actual = secciones.find(s => s.id === elegida) ?? secciones[0]

  return <Shell>
    <SafeAreaView className="min-h-0 flex-1 flex-row" edges={['top', 'bottom']}
      onLayout={e => setAnchoPanel(e.nativeEvent.layout.width)}>
      <View testID="editor-secciones" style={{ width: seccionesPlegadas ? 64 : LATERAL_W, flexShrink: 0 }}
        onPointerEnter={() => setHoverIzquierdo(true)} onPointerLeave={() => setHoverIzquierdo(false)}>
        {seccionesPlegadas ? <CollapsedSidebar side="left" hovered={hoverIzquierdo}
          resting={<View className="items-center"><IconUser size={20} color={ICON_COLOR.muted} /></View>}
          label="Mostrar secciones del perfil" onExpand={() => setSeccionesPlegadas(false)} /> :
          <Panel tone="lateral" className="flex-1">
            <CabeceraLateral titulo="Editar perfil">
              <BotonLateral label="Contraer secciones del perfil" onPress={() => setSeccionesPlegadas(true)}
                icono={<IconCollapseLeft size={17} color={ICON_COLOR.muted} />} />
            </CabeceraLateral>
            {cuenta}
            <ScrollView className="min-h-0 flex-1" contentContainerClassName="gap-0.5 px-2 pt-3"
              contentContainerStyle={{ paddingBottom: 24 + espacioBarra }}>
              {secciones.map(s => {
                const activa = s.id === actual?.id
                const Icono = s.icono
                return <Pressable key={s.id} accessibilityRole="button" accessibilityLabel={s.titulo}
                  accessibilityState={{ selected: activa }} onPress={() => setElegida(s.id)}
                  className={`h-[30px] flex-row items-center gap-2.5 rounded-md px-2 ${activa ? 'bg-muted' : 'hover:bg-white/5 active:bg-muted'}`}>
                  <Icono size={16} color={activa ? ICON_COLOR.foreground : ICON_COLOR.muted} />
                  <Text className={`min-w-0 flex-1 text-[13px] ${activa ? 'text-foreground font-medium' : 'text-foreground'}`} numberOfLines={1}>{s.titulo}</Text>
                </Pressable>
              })}
            </ScrollView>
          </Panel>}
      </View>
      <Panel className="min-w-0 flex-1">
        <View className="flex-row items-center gap-1 px-2 py-1">
          <BotonLateral label="Volver al perfil" onPress={onVolver} icono={<IconBack size={17} color={ICON_COLOR.foreground} />} />
          <Text className="min-w-0 flex-1 text-foreground text-[15px] font-semibold" numberOfLines={1}>{actual?.titulo}</Text>
        </View>
        <ScrollView className="min-h-0 flex-1" keyboardShouldPersistTaps="handled"
          contentContainerClassName="items-center px-6 pt-5" contentContainerStyle={{ paddingBottom: 40 + espacioBarra }}>
          <View className="w-full min-w-0 gap-6" style={{ maxWidth: MAX_W }}>
            {!lateralPrevia ? <PreviaPlegable abierta={!previaPlegada} onCambiar={() => setPreviaPlegada(v => !v)}>{previa}</PreviaPlegable> : null}
            {actual?.bloques}
          </View>
        </ScrollView>
      </Panel>
      {lateralPrevia ? <View testID="editor-previa-lateral" style={{ width: previaPlegada ? 64 : 350, flexShrink: 0 }}
        onPointerEnter={() => setHoverDerecho(true)} onPointerLeave={() => setHoverDerecho(false)}>
        {previaPlegada ? <CollapsedSidebar side="right" hovered={hoverDerecho}
          resting={<View className="items-center"><IconEye size={20} color={ICON_COLOR.muted} /></View>}
          label="Mostrar vista previa" onExpand={() => setPreviaPlegada(false)} /> :
          <Panel tone="lateral" className="flex-1">
            <CabeceraLateral titulo="Vista previa">
              <BotonLateral label="Ocultar vista previa" onPress={() => setPreviaPlegada(true)}
                icono={<IconCollapseRight size={17} color={ICON_COLOR.muted} />} />
            </CabeceraLateral>
            <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 24 + espacioBarra }}>{previa}</ScrollView>
          </Panel>}
      </View> : null}
    </SafeAreaView>
  </Shell>
}
