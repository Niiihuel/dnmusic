import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Avatar } from '../../../src/ui/Avatar'
import { Panel } from '../../../src/ui/Panel'
import { FilaAjuste, FilaInterruptor, GrupoAjustes } from '../../../src/ui/Ajustes'
import { Vitrinas } from '../../../src/ui/PerfilPublico'
import {
  ICON_COLOR,
  IconAt,
  IconBack,
  IconClose,
  IconImage,
  IconMessage,
  IconMusic,
  IconUser,
} from '../../../src/ui/icons'
import { removeAvatar, saveMyProfile, uploadAvatar } from '../../../src/services/profile'
import { pickImage } from '../../../src/lib/pickImage'
import { addShowcase, uploadIlustracion } from '../../../src/services/showcases'
import { setMyProfile, useMyProfile, useUser } from '../../../src/state/session'
import { usePiso } from '../../../src/state/shell'
import { avisar } from '../../../src/state/aviso'
import { volver } from '../../../src/lib/volver'

/** Ancho al que el editor deja de ser una columna centrada. */
const MAX_W = 560

/**
 * Editar el perfil: todo lo que se toca, en un solo lugar.
 *
 * La separación es la de Discord: el perfil **muestra** y no tiene un solo
 * control de edición encima; para cambiar algo se entra acá. Antes estaban
 * mezclados —la identidad arriba y debajo los campos y las cruces de las
 * vitrinas— así que mirar tu perfil y editarlo eran la misma pantalla, y no se
 * podía ver cómo te ve otro sin los botones puestos por encima.
 *
 * Adentro, cada campo de texto sigue teniendo su propia pantalla (ver
 * `[campo].tsx`): esto es el índice, no un formulario.
 */
export default function EditarPerfil() {
  const router = useRouter()
  const user = useUser()
  const profile = useMyProfile()
  const piso = usePiso(24)

  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /* Cambia al sacar o mover una vitrina, para que la grilla relea. */
  const [recarga, setRecarga] = useState(0)
  const [subiendo, setSubiendo] = useState(false)

  /**
   * Sube una imagen y la fija como vitrina.
   *
   * Se guarda la **proporción** junto a la ruta para poder reservarle el lugar
   * antes de que cargue; si no se puede medir se asume cuadrada, que es el peor
   * caso menos malo — una imagen que no entra se recorta, una que sobra deja un
   * hueco que se nota más.
   */
  async function subirIlustracion() {
    if (!user || subiendo) return
    setSubiendo(true)
    setError(null)
    try {
      /* Sin recorte cuadrado: la forma de la ilustración es el contenido. */
      const elegida = await pickImage({ cuadrada: false, conVideo: true })
      if (!elegida) return
      const ruta = await uploadIlustracion(user.id, elegida.blob, elegida.fileName, elegida.mime)
      /* Si no se pudo medir se asume cuadrada: es el peor caso menos malo — una
         imagen que no entra se recorta y se nota poco; una que sobra deja un
         hueco vacío que se nota mucho. */
      await addShowcase(user.id, 'ilustracion', { path: ruta, alto: elegida.alto ?? 1 })
      setRecarga((n) => n + 1)
      avisar('Ilustración agregada')
    } catch (e) {
      setError((e as Error).message)
      avisar('No se pudo subir la ilustración', true)
    } finally {
      setSubiendo(false)
    }
  }

  const [subiendoFondo, setSubiendoFondo] = useState(false)

  /**
   * Sube una imagen propia y la deja **de fondo**, no de vitrina.
   *
   * Va al mismo bucket que las ilustraciones (el cliente puede escribir ahí) y
   * `banner_path` guarda su ruta; `FondoPerfil` sabe distinguirla de una tapa
   * por la barra de la carpeta. Sin video: el fondo es un `Image`, y un mp4
   * ahí sería un cuadro negro.
   */
  async function subirFondo() {
    if (!user || subiendoFondo) return
    setSubiendoFondo(true)
    setError(null)
    try {
      const elegida = await pickImage({ cuadrada: false })
      if (!elegida) return
      const ruta = await uploadIlustracion(user.id, elegida.blob, elegida.fileName, elegida.mime)
      setMyProfile(await saveMyProfile({ bannerPath: ruta }))
      avisar('Fondo puesto')
    } catch (e) {
      setError((e as Error).message)
      avisar('No se pudo subir el fondo', true)
    } finally {
      setSubiendoFondo(false)
    }
  }

  const avatarPath = profile?.avatarPath ?? null
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

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-1">
        <View className="flex-row items-center gap-3 px-3 py-1">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Volver al perfil"
            onPress={() => volver(router, '/profile')}
            className="h-11 w-11 items-center justify-center rounded-full active:bg-muted"
          >
            <IconBack size={19} color={ICON_COLOR.foreground} />
          </Pressable>
          <Text className="text-foreground text-[15px] font-semibold">Editar perfil</Text>
        </View>

        <Panel className="flex-1">
          <ScrollView
            contentContainerClassName="items-center px-4 pt-6"
            contentContainerStyle={{ paddingBottom: piso }}
          >
            {!profile ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <View className="w-full gap-7" style={{ maxWidth: MAX_W }}>
                <View className="items-center gap-4">
                  <Avatar name={nombre} path={avatarPath} size={96} />
                  <View className="flex-row items-center gap-2">
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => void elegirFoto()}
                      disabled={uploading}
                      className="h-10 flex-row items-center gap-2 rounded-full border border-border px-4 active:bg-muted"
                    >
                      {uploading ? (
                        <ActivityIndicator size="small" color={ICON_COLOR.muted} />
                      ) : null}
                      <Text className="text-foreground text-[13px] font-medium">
                        {avatarPath ? 'Cambiar foto' : 'Subir foto'}
                      </Text>
                    </Pressable>
                    {avatarPath ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Quitar la foto"
                        onPress={() => void aplicarFoto(null)}
                        className="h-10 w-10 items-center justify-center rounded-full border border-border active:bg-muted"
                      >
                        <IconClose size={16} color={ICON_COLOR.muted} />
                      </Pressable>
                    ) : null}
                  </View>
                  {error ? (
                    <Text className="text-destructive text-xs">{error}</Text>
                  ) : (
                    <Text className="text-muted-foreground text-xs">
                      JPG, PNG o WebP · hasta 2 MB
                    </Text>
                  )}
                </View>

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

                {/*
                 * El fondo no se elige desde acá.
                 *
                 * Se pone desde la canción cuya tapa querés usar —«Usar su tapa
                 * de fondo», en sus tres puntos— porque elegir entre miles de
                 * carátulas desde una fila de ajustes sería armar un buscador
                 * adentro del editor para algo que ya sabés dónde está. Esta fila
                 * está para poder **sacarlo**, que es lo único que no se puede
                 * hacer desde el otro lado.
                 */}
                <GrupoAjustes titulo="Tu fondo">
                  <FilaAjuste
                    rotulo="Fondo"
                    valor={profile.bannerPath ? 'Puesto' : null}
                    vacio="Elegilo desde una canción"
                    icono={<IconMusic size={17} color={ICON_COLOR.muted} />}
                    onPress={() => {
                      /* Vacía, la fila LLEVA a elegir: antes no hacía nada y se
                         leía como rota — una fila con chevron promete un lugar
                         a donde ir. Con fondo puesto, tocarla lo quita. */
                      if (!profile.bannerPath) {
                        router.push('/profile/editar/musica?destino=fondo')
                        return
                      }
                      void saveMyProfile({ bannerPath: '' }).then((p) => {
                        setMyProfile(p)
                        avisar('Fondo quitado')
                      })
                    }}
                  />
                  {/* La otra puerta al fondo: una imagen propia, a pantalla y
                      nítida — el fondo de Steam. Va al bucket de ilustraciones
                      y `FondoPerfil` la distingue por la forma de la ruta. */}
                  <FilaAjuste
                    rotulo="Subir una ilustración"
                    valor={null}
                    vacio={subiendoFondo ? 'Subiendo…' : 'Una imagen tuya, de fondo'}
                    icono={<IconImage size={17} color={ICON_COLOR.muted} />}
                    onPress={() => void subirFondo()}
                    ultima
                  />
                </GrupoAjustes>

                <GrupoAjustes titulo="Quién lo ve">
                  <FilaInterruptor
                    rotulo="Perfil público"
                    detalle={
                      profile.visibility === 'publico'
                        ? 'Cualquiera con cuenta puede ver tu perfil y tus vitrinas.'
                        : 'Solo vos podés ver tu perfil. Nadie más, ni con el enlace.'
                    }
                    activo={profile.visibility === 'publico'}
                    onCambiar={(activo) => {
                      void saveMyProfile({
                        visibility: activo ? 'publico' : 'privado',
                      }).then((p) => {
                        setMyProfile(p)
                        avisar(activo ? 'Tu perfil ahora es público' : 'Tu perfil ahora es privado')
                      })
                    }}
                    icono={<IconUser size={17} color={ICON_COLOR.muted} />}
                    ultima
                  />
                </GrupoAjustes>

                <GrupoAjustes titulo="Agregar">
                  {/* Buscar música vive acá y no en el flujo de mensajes: fijar
                      algo en tu perfil y mandárselo a alguien son dos
                      intenciones distintas. */}
                  <FilaAjuste
                    rotulo="Música"
                    vacio="Buscá una canción para fijar"
                    icono={<IconMusic size={17} color={ICON_COLOR.muted} />}
                    onPress={() => router.push('/profile/editar/musica')}
                  />
                  {/*
                   * Subir una ilustración es lo único que se agrega **desde
                   * acá**. Todo lo demás —canciones, fragmentos, listas— se fija
                   * desde donde ya está: es más corto y no obliga a buscar dos
                   * veces la misma cosa. Una imagen del teléfono no está en
                   * ningún lado de la app, así que su puerta tiene que estar acá.
                   */}
                  <FilaAjuste
                    rotulo="Ilustración"
                    valor={subiendo ? 'Subiendo…' : null}
                    vacio="Una imagen, un GIF o un clip"
                    icono={<IconImage size={17} color={ICON_COLOR.muted} />}
                    onPress={() => void subirIlustracion()}
                    ultima
                  />
                </GrupoAjustes>

                {/*
                 * Las vitrinas se acomodan acá, no en el perfil.
                 *
                 * En el perfil se ven como las ve cualquiera: sin cruces ni
                 * flechas encima. Acá aparecen los controles, que es lo que hace
                 * que las dos pantallas tengan un trabajo cada una.
                 */}
                <View className="gap-2">
                  <Text className="px-4 text-muted-foreground text-[11px] font-semibold uppercase tracking-[1.2px]">
                    Tus vitrinas
                  </Text>
                  <Vitrinas
                    ownerId={profile.userId}
                    recarga={recarga}
                    onCambio={() => setRecarga((n) => n + 1)}
                    vacio={
                      <View className="gap-2 rounded-2xl bg-card px-5 py-6">
                        <Text className="text-foreground text-[15px] font-semibold">
                          Todavía no fijaste nada
                        </Text>
                        <Text className="text-muted-foreground text-[13px] leading-5">
                          Desde los tres puntos de cualquier canción, lista o fragmento podés
                          fijarlo en tu perfil.
                        </Text>
                      </View>
                    }
                  />
                </View>
              </View>
            )}
          </ScrollView>
        </Panel>
      </View>
    </SafeAreaView>
  )
}
