import { useState, type ReactNode } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Avatar } from '../../../src/ui/Avatar'
import { BotonVidrio } from '../../../src/ui/Glass'
import { Panel, Shell } from '../../../src/ui/Panel'
import { FilaAjuste, FilaInterruptor, GrupoAjustes } from '../../../src/ui/Ajustes'
import { FilaCampo } from '../../../src/ui/EditorDeCampo'
import { ICON_COLOR, IconAt, IconBack, IconClose, IconGrilla, IconImage, IconLock, IconMessage, IconPalette, IconSparkles, IconType, IconUser, type IconProps } from '../../../src/ui/icons'
import { removeAvatar, saveMyProfile, uploadAvatar } from '../../../src/services/profile'
import { dejarFondoPendiente } from '../../../src/state/fondoPendiente'
import { BarraDeProgreso, porciento } from '../../../src/ui/Progreso'
import { FondoPerfil } from '../../../src/ui/PerfilPublico'
import { nombreDeEfecto } from '../../../src/ui/EfectosDibujados'
import { esDecoracionPropia } from '../../../src/services/decoraciones'
import { MARCOS } from '../../../src/ui/Marco'
import { pickImage } from '../../../src/lib/pickImage'
import { esVideo, uploadIlustracionConProgreso } from '../../../src/services/showcases'
import { setMyProfile, useMyProfile, useUser } from '../../../src/state/session'
import { usePiso } from '../../../src/state/shell'
import { avisar } from '../../../src/state/aviso'
import { pedirArmado } from '../../../src/state/vitrinaBorrador'
import { volver } from '../../../src/lib/volver'

/** Desde acá la pantalla es la de macOS: barra lateral con las secciones y el detalle al lado. */
const ESCRITORIO_PX = 780
const LATERAL_W = 280
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
 * una barra lateral con las secciones y el detalle al lado, con los campos de
 * texto editándose ahí mismo (`CampoEnLinea`) en vez de empujar una pantalla
 * para un solo campo.
 */
export default function EditarPerfil() {
  const router = useRouter()
  const user = useUser()
  const profile = useMyProfile()
  const piso = usePiso(24)
  const { width } = useWindowDimensions()
  const escritorio = width >= ESCRITORIO_PX

  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [subiendoFondo, setSubiendoFondo] = useState(false)
  /** Cuánto subió el clip de fondo, de 0 a 1; `null` mientras no se sube. */
  const [progresoFondo, setProgresoFondo] = useState<number | null>(null)

  /**
   * Elegir un fondo para el perfil.
   *
   * Es la **única** puerta para poner un fondo: antes había dos —esta y elegir
   * la tapa de una canción— y la de la tapa producía siempre lo mismo, un
   * cuadrado de 640px estirado a pantalla completa. Acá entra lo que elijas,
   * incluido un GIF o un clip, y se dibuja tal cual.
   *
   * Una imagen o un GIF **se encuadra antes de subir**: se deja esperando y se
   * abre la pantalla de encuadre sobre el archivo local; el tilde de allá
   * sube y guarda, con la barra de cuánto va. Un clip no se encuadra —el
   * reproductor lo dibuja a sangre— y sube directo, con la misma barra acá.
   */
  async function subirFondo() {
    if (!user || subiendoFondo) return
    setSubiendoFondo(true)
    setError(null)
    try {
      /* Con video: el fondo sabe dibujar un clip, en repetición y mudo. */
      const elegida = await pickImage({ cuadrada: false, conVideo: true })
      if (!elegida) return
      if (elegida.mime.startsWith('video/')) {
        setProgresoFondo(0)
        const ruta = await uploadIlustracionConProgreso(
          user.id,
          elegida.blob,
          elegida.fileName,
          elegida.mime,
          setProgresoFondo,
        )
        setMyProfile(await saveMyProfile({ bannerPath: ruta, bannerEncuadre: null }))
        avisar('Fondo puesto')
        return
      }
      dejarFondoPendiente(elegida)
      router.push({ pathname: '/perfil/encuadrar', params: { que: 'fondo-nuevo' } })
    } catch (e) {
      setError((e as Error).message)
      avisar('No se pudo subir el fondo', true)
    } finally {
      setSubiendoFondo(false)
      setProgresoFondo(null)
    }
  }

  const avatarPath = profile?.avatarPath ?? null
  /* Un clip no se encuadra con esta pantalla: ver la fila de abajo. */
  const puedeEncuadrarFondo = !!profile?.bannerPath && !esVideo(profile.bannerPath)
  const nombre = profile?.displayName?.trim() || profile?.username || '?'

  /*
   * La foto se aplica al toque, sin botón de guardar.
   *
   * Es lo que hace Ajustes de iOS: cambiar la foto no se confirma, se hace. Y
   * acá no hay dónde confirmar — los campos de texto guardan cada uno en su
   * pantalla, así que un botón suelto para la foto sería el único de la
   * pantalla y nadie sabría qué abarca.
   */
  async function aplicarFoto(ruta: string | null) {
    const anterior = profile?.avatarPath ?? null
    const next = await saveMyProfile({ avatarPath: ruta ?? '' })
    setMyProfile(next)
    /* Recién con el perfil guardado se borra la anterior: al revés, un error
       dejaría la cuenta sin foto y sin forma de volver. */
    if (anterior && anterior !== next.avatarPath) await removeAvatar(anterior)
    avisar(ruta ? 'Foto actualizada' : 'Foto quitada')
  }

  async function elegirFoto() {
    if (!user) return
    setUploading(true)
    setError(null)
    try {
      const elegida = await pickImage()
      // Cancelar no es un error: no hay nada que avisar.
      if (!elegida) return
      await aplicarFoto(await uploadAvatar(user.id, elegida.blob, elegida.fileName, elegida.mime))
    } catch (e) {
      setError((e as Error).message)
    } finally {
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
      <Avatar name={nombre} path={avatarPath} size={96} />
      <View className="flex-row items-center gap-2">
        <Pressable
          accessibilityRole="button"
          onPress={() => void elegirFoto()}
          disabled={uploading}
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
              onPress={() => router.push({ pathname: '/perfil/encuadrar', params: { que: 'foto' } })}
              className="h-10 flex-row items-center rounded-full bg-muted px-4 active:opacity-80"
            >
              <Text className="text-foreground text-[13px] font-semibold">Encuadrar</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Quitar la foto"
              onPress={() => void aplicarFoto(null)}
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
          : 'Una imagen, un GIF o un clip. La imagen se encuadra antes de subir.'
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
            rotulo={progresoFondo >= 1 ? 'Guardando…' : `Subiendo el clip… ${porciento(progresoFondo)}`}
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
          onPress={() => router.push({ pathname: '/perfil/encuadrar', params: { que: 'fondo' } })}
        />
      ) : null}
      {conFondo ? (
        <FilaAjuste
          rotulo="Quitar el fondo"
          vacio=""
          destructivo
          onPress={() => {
            void saveMyProfile({ bannerPath: '', bannerEncuadre: null }).then((p) => {
              setMyProfile(p)
              avisar('Fondo quitado')
            })
          }}
          ultima
        />
      ) : null}
    </GrupoAjustes>
  )

  const bloqueEstilo = (
    <GrupoAjustes titulo={escritorio ? undefined : 'Tu estilo'}>
      <FilaAjuste
        rotulo="Tipografía"
        vacio="La del sistema"
        icono={<IconType size={17} color={ICON_COLOR.muted} />}
        onPress={() => router.push('/profile/fuente')}
      />
      <FilaAjuste
        rotulo="Marco de la foto"
        valor={
          profile.marco
            ? esDecoracionPropia(profile.marco)
              ? 'Tu decoración'
              : (MARCOS.find((m) => m.id === profile.marco)?.nombre ?? profile.marco)
            : null
        }
        vacio="Ninguno"
        icono={<IconPalette size={17} color={ICON_COLOR.muted} />}
        onPress={() => router.push('/profile/marco')}
      />
      {/* El efecto: una animación encima del fondo, como los «profile
          effects». Vive en el catálogo en imagen (`services/decoraciones`). */}
      <FilaAjuste
        rotulo="Efecto del perfil"
        valor={
          profile.efecto
            ? esDecoracionPropia(profile.efecto)
              ? 'Tu decoración'
              : (nombreDeEfecto(profile.efecto) ?? profile.efecto)
            : null
        }
        vacio="Ninguno"
        icono={<IconSparkles size={17} color={ICON_COLOR.muted} />}
        onPress={() => router.push({ pathname: '/profile/marco', params: { tipo: 'efecto' } })}
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
          void saveMyProfile({ visibility: activo ? 'publico' : 'privado' }).then((p) => {
            setMyProfile(p)
            avisar(activo ? 'Tu perfil ahora es público' : 'Tu perfil ahora es privado')
          })
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
      <FilaAjuste
        rotulo="Armar el mosaico"
        vacio="Piezas, temas y orden"
        icono={<IconGrilla size={17} color={ICON_COLOR.muted} />}
        onPress={() => {
          pedirArmado()
          volver(router, '/profile')
        }}
        ultima
      />
    </GrupoAjustes>
  )

  if (!escritorio) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
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
          contentContainerStyle={{ paddingBottom: piso }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-7">
            {bloqueFoto}
            <GrupoAjustes titulo="Tu identidad">
              <FilaAjuste
                rotulo="Nombre visible"
                valor={profile.displayName}
                vacio={profile.username}
                icono={<IconUser size={17} color={ICON_COLOR.muted} />}
                onPress={() => router.push('/profile/editar/nombre')}
              />
              <FilaAjuste
                rotulo="Usuario"
                valor={`@${profile.username}`}
                icono={<IconAt size={17} color={ICON_COLOR.muted} />}
                onPress={() => router.push('/profile/editar/usuario')}
              />
              <FilaAjuste
                rotulo="Tu línea"
                valor={profile.bio}
                vacio="Contá qué estás escuchando"
                icono={<IconMessage size={17} color={ICON_COLOR.muted} />}
                onPress={() => router.push('/profile/editar/linea')}
                ultima
              />
            </GrupoAjustes>
            {bloqueFondo}
            {bloqueEstilo}
            {bloquePrivacidad}
            {bloqueMosaico}
          </View>
        </ScrollView>
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
          {/* Las filas de Ajustes del Sistema: rótulo a la izquierda, el texto
              a la derecha, «Guardar» solo cuando cambió, y la explicación al
              pie del grupo y no debajo de cada campo. */}
          <GrupoAjustes pie="Vacío, el nombre muestra tu usuario. Con el usuario te encuentran los demás; tu línea se ve en el perfil, debajo del nombre.">
            <FilaCampo cual="nombre" icono={<IconUser size={17} color={ICON_COLOR.muted} />} />
            <FilaCampo cual="usuario" icono={<IconAt size={17} color={ICON_COLOR.muted} />} />
            <FilaCampo cual="linea" icono={<IconMessage size={17} color={ICON_COLOR.muted} />} ultima />
          </GrupoAjustes>
        </>
      ),
    },
    { id: 'fondo', titulo: 'Fondo', icono: IconImage, bloques: bloqueFondo },
    { id: 'estilo', titulo: 'Estilo', icono: IconPalette, bloques: bloqueEstilo },
    { id: 'privacidad', titulo: 'Quién lo ve', icono: IconLock, bloques: bloquePrivacidad },
    { id: 'mosaico', titulo: 'Mosaico', icono: IconGrilla, bloques: bloqueMosaico },
  ]

  return (
    <Escritorio
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
  )
}

/**
 * La forma de la compu: Ajustes del Sistema. La barra lateral con la cuenta y
 * las secciones; el detalle de la elegida a la derecha.
 */
function Escritorio({
  secciones,
  cuenta,
  onVolver,
}: {
  secciones: Seccion[]
  cuenta: ReactNode
  onVolver: () => void
}) {
  const [elegida, setElegida] = useState(secciones[0]?.id ?? '')
  const actual = secciones.find((s) => s.id === elegida) ?? secciones[0]

  return (
    <Shell>
      <SafeAreaView className="flex-1 flex-row" edges={['top', 'bottom']}>
        <Panel tone="lateral" style={{ width: LATERAL_W }}>
          <View className="flex-row items-center gap-3 px-3 pb-2 pt-3">
            <BotonVidrio onPress={onVolver} label="Volver al perfil" radius={18} style={{ width: 36, height: 36 }}>
              <IconBack size={17} color={ICON_COLOR.foreground} />
            </BotonVidrio>
            <Text className="text-foreground text-[17px] font-bold">Editar perfil</Text>
          </View>
          {cuenta}
          <ScrollView className="flex-1" contentContainerClassName="gap-0.5 px-2 pt-3">
            {secciones.map((s) => {
              const activa = s.id === actual?.id
              const Icono = s.icono
              return (
                <Pressable
                  key={s.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: activa }}
                  onPress={() => setElegida(s.id)}
                  className={`flex-row items-center gap-3 rounded-lg px-2 py-1.5 ${
                    activa ? 'bg-muted' : 'hover:bg-white/5 active:bg-muted'
                  }`}
                >
                  <View className="h-7 w-7 items-center justify-center rounded-[7px] bg-muted">
                    <Icono size={15} color={ICON_COLOR.foreground} />
                  </View>
                  <Text className="text-foreground text-[14px]">{s.titulo}</Text>
                </Pressable>
              )
            })}
          </ScrollView>
        </Panel>

        <Panel className="flex-1">
          <ScrollView
            className="flex-1"
            keyboardShouldPersistTaps="handled"
            contentContainerClassName="items-center px-8 pb-10 pt-6"
          >
            <View className="w-full gap-6" style={{ maxWidth: MAX_W }}>
              <Text className="text-foreground text-[24px] font-bold">{actual?.titulo}</Text>
              {actual?.bloques}
            </View>
          </ScrollView>
        </Panel>
      </SafeAreaView>
    </Shell>
  )
}
