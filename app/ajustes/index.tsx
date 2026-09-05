import { useState } from 'react'
import { Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Panel } from '../../src/ui/Panel'
import { FilaAjuste, FilaInterruptor, GrupoAjustes } from '../../src/ui/Ajustes'
import { FilaSostener } from '../../src/ui/Mantener'
import { Avatar } from '../../src/ui/Avatar'
import {
  ICON_COLOR,
  IconBack,
  IconBan,
  IconChevronRight,
  IconClock,
  IconDisc,
  IconDisk,
  IconLogOut,
  IconMusic,
  IconSparkles,
  IconTrash,
  IconSearch,
  IconClose,
} from '../../src/ui/icons'
import {
  cuantasListas,
  cuantasPendientes,
  espacioUsado,
  formatoBytes,
  HAY_DESCARGAS,
  useDescargas,
  reanudarDescargas,
} from '../../src/state/descargas'
import { setAutoplay, setPreferencia, setSoloWifi, useAjustes } from '../../src/state/ajustes'
import { programarApagado, useDormirMin } from '../../src/state/playback'
import { borrarHistorial } from '../../src/services/plays'
import { endSession, useMyProfile } from '../../src/state/session'
import { avisar } from '../../src/state/aviso'
import { mensajeError } from '../../src/lib/mensajeError'
import { usePiso } from '../../src/state/shell'
import { volver } from '../../src/lib/volver'
import { NOVEDADES } from '../../src/lib/novedades'
import { HAY_ACTUALIZADOR } from '../../src/state/actualizacion'
import { TECLADO_FISICO } from '../../src/lib/teclado'

const MINUTOS = [15, 30, 45, 60, 90]
const CATEGORIAS = ['Todo', 'Escucha', 'Experiencia', 'Cuenta'] as const
type Categoria = (typeof CATEGORIAS)[number]
const normalizar = (valor: string) =>
  valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

export default function Ajustes() {
  const router = useRouter()
  const ajustes = useAjustes()
  const dormirMin = useDormirMin()
  const perfil = useMyProfile()
  const nombre = perfil?.displayName?.trim() || perfil?.username || 'Tu cuenta'
  const { items } = useDescargas()
  const [categoria, setCategoria] = useState<Categoria>('Todo')
  const [busqueda, setBusqueda] = useState('')
  const [ancho, setAncho] = useState(0)
  const suelto = useWindowDimensions().width < 780
  const piso = usePiso(24)
  const consulta = normalizar(busqueda)
  const coincide = (grupo: Categoria, palabras: string) =>
    (categoria === 'Todo' || categoria === grupo) &&
    consulta.split(/\s+/).every((palabra) => normalizar(`${grupo} ${palabras}`).includes(palabra))

  async function borrar() {
    try {
      await borrarHistorial()
      avisar('Historial borrado')
    } catch (e) {
      avisar(`No se pudo borrar: ${mensajeError(e)}`, true)
    }
  }

  const grupos = [
    {
      id: 'reproduccion',
      visible: coincide(
        'Escucha',
        'reproducción autoplay seguir al terminar lista recomendaciones géneros artistas gustos música',
      ),
      contenido: (
        <GrupoAjustes titulo="Reproducción">
          <FilaInterruptor
            rotulo="Seguir escuchando"
            detalle="Al terminar la lista, seguir con recomendaciones."
            icono={<IconDisc size={17} color={ICON_COLOR.muted} />}
            activo={ajustes.autoplay}
            onCambiar={setAutoplay}
          />
          <FilaAjuste
            rotulo="Géneros y artistas"
            vacio=""
            icono={<IconMusic size={17} color={ICON_COLOR.muted} />}
            onPress={() => router.push('/onboarding?de=ajustes')}
            ultima
          />
        </GrupoAjustes>
      ),
    },
    {
      id: 'temporizador',
      visible: coincide('Escucha', 'temporizador apagar dormir minutos pausa'),
      contenido: (
        <GrupoAjustes titulo="Temporizador">
          <View className="gap-4 p-4">
            <View className="flex-row items-center gap-3">
              <IconClock size={19} color={ICON_COLOR.muted} />
              <View className="flex-1 gap-1">
                <Text className="text-foreground text-[15px]">Dormí con tu música</Text>
                <Text
                  accessibilityLiveRegion="polite"
                  className="text-muted-foreground text-[12px]"
                >
                  {dormirMin === null
                    ? 'Elegí cuándo pausar la reproducción.'
                    : `Se pausa en ${dormirMin} ${dormirMin === 1 ? 'minuto' : 'minutos'}.`}
                </Text>
              </View>
            </View>
            <View className="flex-row flex-wrap gap-2">
              {MINUTOS.map((m) => (
                <Pressable
                  key={m}
                  accessibilityRole="button"
                  accessibilityLabel={`Pausar en ${m} minutos`}
                  onPress={() => programarApagado(m)}
                  className="min-h-11 min-w-11 items-center justify-center rounded-full bg-muted px-3 active:opacity-70"
                >
                  <Text className="text-foreground text-[13px]">{m} min</Text>
                </Pressable>
              ))}
              {dormirMin !== null ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => programarApagado(null)}
                  className="min-h-11 items-center justify-center rounded-full bg-primary px-4 active:opacity-80"
                >
                  <Text className="text-primary-foreground text-[13px] font-semibold">
                    Cancelar
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </GrupoAjustes>
      ),
    },
    {
      id: 'descargas',
      visible:
        HAY_DESCARGAS &&
        coincide('Escucha', 'almacenamiento descargas espacio wifi datos conexión'),
      contenido: (
        <GrupoAjustes titulo="Descargas">
          <FilaAjuste
            rotulo="Administrar"
            valor={
              cuantasPendientes(items)
                ? `${cuantasPendientes(items)} en camino`
                : `${cuantasListas(items)} · ${formatoBytes(espacioUsado(items))}`
            }
            icono={<IconDisk size={17} color={ICON_COLOR.muted} />}
            onPress={() => router.push('/ajustes/descargas')}
          />
          <FilaInterruptor
            rotulo="Solo con Wi-Fi"
            detalle="Pausar descargas al usar datos móviles."
            activo={ajustes.soloWifi}
            onCambiar={(v) => {
              setSoloWifi(v)
              if (!v) reanudarDescargas()
            }}
            ultima
          />
        </GrupoAjustes>
      ),
    },
    {
      id: 'experiencia',
      visible: coincide(
        'Experiencia',
        'novedades actualizaciones versión avisos ayudas cursor interfaz',
      ),
      contenido: (
        <GrupoAjustes titulo="La app, a tu manera">
          {TECLADO_FISICO ? (
            <FilaInterruptor
              rotulo="Ayudas al pasar el cursor"
              detalle="Mostrar el nombre de los controles. Las ayudas de teclado siguen disponibles."
              activo={ajustes.ayudasCursor}
              onCambiar={(v) => setPreferencia('ayudasCursor', v)}
            />
          ) : null}
          <FilaInterruptor
            rotulo="Novedades al abrir"
            detalle="Ver un resumen después de actualizar."
            activo={ajustes.novedadesAlAbrir}
            onCambiar={(v) => setPreferencia('novedadesAlAbrir', v)}
          />
          {HAY_ACTUALIZADOR ? (
            <FilaInterruptor
              rotulo="Avisar cuando esté lista"
              detalle="Mostrar un aviso cuando puedas instalar una actualización."
              activo={ajustes.avisosActualizacion}
              onCambiar={(v) => setPreferencia('avisosActualizacion', v)}
            />
          ) : null}
          <FilaAjuste
            rotulo="Actualizaciones"
            valor={NOVEDADES[0]?.version}
            icono={<IconSparkles size={17} color={ICON_COLOR.muted} />}
            onPress={() => router.push('/ajustes/novedades')}
            ultima
          />
        </GrupoAjustes>
      ),
    },
    {
      id: 'privacidad',
      visible: coincide(
        'Cuenta',
        'privacidad datos bloqueados borrar historial escucha recomendaciones',
      ),
      contenido: (
        <GrupoAjustes titulo="Privacidad y datos">
          <FilaAjuste
            rotulo="Bloqueados"
            vacio=""
            icono={<IconBan size={17} color={ICON_COLOR.muted} />}
            onPress={() => router.push('/ajustes/bloqueados')}
          />
          <FilaSostener
            rotulo="Borrar historial de escucha"
            detalle="Mantené pulsado. Las recomendaciones empiezan de cero y no se puede deshacer."
            icono={<IconTrash size={17} color={ICON_COLOR.muted} />}
            onCompletar={() => void borrar()}
            ultima
          />
        </GrupoAjustes>
      ),
    },
    {
      id: 'cuenta',
      visible: coincide(
        'Cuenta',
        'perfil foto nombre fuente tipografía espacio cerrar sesión salir',
      ),
      contenido: (
        <GrupoAjustes titulo="Tu cuenta">
          <FilaAjuste
            rotulo="Personalizar perfil"
            vacio=""
            onPress={() => router.push('/profile')}
          />
          <FilaSostener
            rotulo="Cerrar sesión"
            detalle="Mantené pulsado para salir de tu cuenta."
            icono={<IconLogOut size={17} color={ICON_COLOR.muted} />}
            onCompletar={() => void endSession()}
            ultima
          />
        </GrupoAjustes>
      ),
    },
  ].filter((grupo) => grupo.visible)

  return (
    <SafeAreaView className="flex-1 bg-background" edges={suelto ? ['top'] : ['top', 'bottom']}>
      <View className={`min-h-0 flex-1 ${suelto ? '' : 'gap-2 p-2'}`}>
        <View className="flex-row items-center gap-3 px-3 py-1">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Volver"
            onPress={() => volver(router, '/')}
            className="h-11 w-11 items-center justify-center rounded-full active:bg-muted"
          >
            <IconBack size={19} color={ICON_COLOR.foreground} />
          </Pressable>
          <Text className="text-foreground text-[15px] font-semibold">Ajustes</Text>
        </View>
        <Panel className="flex-1">
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerClassName={`items-center ${suelto ? 'px-4 pt-3' : 'p-6'}`}
            contentContainerStyle={{ paddingBottom: piso }}
          >
            <View
              className="w-full gap-6"
              style={{ maxWidth: 920 }}
              onLayout={(e) => setAncho(e.nativeEvent.layout.width)}
            >
              <View className="gap-1">
                <Text className="text-foreground text-[24px] font-bold">A tu manera.</Text>
                <Text className="text-muted-foreground text-[13px]">
                  Tu escucha, tu espacio y las preferencias de este dispositivo.
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Editar tu perfil"
                onPress={() => router.push('/profile')}
                className="flex-row items-center gap-3.5 rounded-2xl bg-card p-4 active:bg-muted"
              >
                <Avatar name={nombre} path={perfil?.avatarPath} size={48} />
                <View className="min-w-0 flex-1 gap-1">
                  <Text className="text-foreground text-[16px] font-semibold" numberOfLines={1}>
                    {nombre}
                  </Text>
                  <Text className="text-muted-foreground text-[12px]" numberOfLines={1}>
                    {perfil?.username
                      ? `@${perfil.username} · Personalizá tu perfil`
                      : 'Personalizá tu perfil'}
                  </Text>
                </View>
                <IconChevronRight size={17} color={ICON_COLOR.muted} />
              </Pressable>
              <View className="gap-3">
                <View className="min-h-12 flex-row items-center gap-3 rounded-full bg-card pl-4 pr-1">
                  <IconSearch size={17} color={ICON_COLOR.muted} />
                  <TextInput
                    accessibilityLabel="Buscar en ajustes"
                    placeholder="Buscar un ajuste"
                    placeholderTextColor={ICON_COLOR.muted}
                    value={busqueda}
                    onChangeText={setBusqueda}
                    autoCorrect={false}
                    className="min-w-0 flex-1 py-3 text-foreground text-[14px]"
                  />
                  {busqueda ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Limpiar búsqueda"
                      onPress={() => setBusqueda('')}
                      className="h-11 w-11 items-center justify-center rounded-full active:bg-muted"
                    >
                      <IconClose size={16} color={ICON_COLOR.muted} />
                    </Pressable>
                  ) : null}
                </View>
                <View className="flex-row flex-wrap gap-2">
                  {CATEGORIAS.map((c) => (
                    <Pressable
                      key={c}
                      accessibilityRole="button"
                      aria-selected={categoria === c}
                      onPress={() => setCategoria(c)}
                      className={`min-h-11 items-center justify-center rounded-full px-4 ${categoria === c ? 'bg-primary' : 'bg-card active:bg-muted'}`}
                    >
                      <Text
                        className={`text-[13px] font-semibold ${categoria === c ? 'text-primary-foreground' : 'text-muted-foreground'}`}
                      >
                        {c}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View className="flex-row flex-wrap items-start gap-5">
                {grupos.map((grupo) => (
                  <View key={grupo.id} style={{ width: ancho >= 760 ? (ancho - 20) / 2 : '100%' }}>
                    {grupo.contenido}
                  </View>
                ))}
                {grupos.length === 0 ? (
                  <View className="w-full items-center gap-3 py-8">
                    <Text className="text-foreground text-[15px]">No encontramos ese ajuste</Text>
                    <Text className="text-muted-foreground text-[13px]">
                      Probá otra palabra o mirá todas las categorías.
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        setBusqueda('')
                        setCategoria('Todo')
                      }}
                      className="min-h-11 justify-center rounded-full bg-muted px-4"
                    >
                      <Text className="text-foreground text-[13px]">Ver todos los ajustes</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            </View>
          </ScrollView>
        </Panel>
      </View>
    </SafeAreaView>
  )
}
