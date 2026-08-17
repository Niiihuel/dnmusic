import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Panel } from '../../src/ui/Panel'
import { FilaAjuste, FilaInterruptor, GrupoAjustes } from '../../src/ui/Ajustes'
import { FilaSostener } from '../../src/ui/Mantener'
import {
  ICON_COLOR,
  IconBack,
  IconBan,
  IconClock,
  IconDisc,
  IconDisk,
  IconLogOut,
  IconSparkles,
  IconTrash,
} from '../../src/ui/icons'
import {
  cuantasListas,
  cuantasPendientes,
  espacioUsado,
  formatoBytes,
  HAY_DESCARGAS,
  useDescargas,
} from '../../src/state/descargas'
import { setAutoplay, useAjustes } from '../../src/state/ajustes'
import { programarApagado, useDormirMin } from '../../src/state/playback'
import { borrarHistorial } from '../../src/services/plays'
import { endSession } from '../../src/state/session'
import { avisar } from '../../src/state/aviso'
import { mensajeError } from '../../src/lib/mensajeError'
import { usePiso } from '../../src/state/shell'
import { volver } from '../../src/lib/volver'
import { NOVEDADES } from '../../src/lib/novedades'

/** Debajo de esto la app es pestañas y el contenido va de borde a borde. */
const SHELL_PX = 780
/** Tope del contenido en escritorio, como en el resto de las pantallas. */
const CAP = 672
/** Los cortes del temporizador. El 0 es «no apagar». */
const MINUTOS = [0, 15, 30, 60]

/**
 * Los ajustes de la app.
 *
 * Existe como pantalla propia y no como un bloque más adentro del editor de
 * perfil porque son cosas distintas: el editor cambia **quién sos** —lo que ve
 * la otra persona— y esto cambia **cómo suena la app para vos**. Meterlos
 * juntos obligaba a bajar por tu foto y tu biografía para llegar a una perilla
 * de reproducción.
 *
 * Navega como los Ajustes de iOS —un *navigation stack* sobre listas
 * agrupadas—: esta pantalla es el índice y lo que tiene entidad propia se abre
 * en la suya, empujada con el deslizamiento del sistema. Hoy la única
 * sub-pantalla es Descargas; el patrón ya queda armado para las que vengan.
 *
 * Lo que borra o te saca no confirma con diálogos ni dobles toques: se
 * **sostiene** (`FilaSostener`), que es el gesto que no se hace sin querer.
 */
export default function Ajustes() {
  const router = useRouter()
  const { autoplay } = useAjustes()
  const dormirMin = useDormirMin()

  const { items } = useDescargas()
  const bajadas = cuantasListas(items)
  const pendientes = cuantasPendientes(items)
  const ocupado = espacioUsado(items)

  async function borrar() {
    try {
      await borrarHistorial()
      avisar('Historial borrado')
    } catch (e) {
      avisar(`No se pudo borrar: ${mensajeError(e)}`, true)
    }
  }

  const suelto = useWindowDimensions().width < SHELL_PX
  const piso = usePiso(24)

  return (
    <SafeAreaView
      className={`flex-1 ${suelto ? 'bg-background' : 'bg-canvas'}`}
      edges={suelto ? ['top'] : ['top', 'bottom']}
    >
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
            contentContainerClassName={`items-center ${suelto ? 'px-3 pt-3' : 'p-5'}`}
            contentContainerStyle={{ paddingBottom: piso }}
          >
            <View className="w-full gap-6" style={{ maxWidth: suelto ? undefined : CAP }}>
              {/*
               * El aleatorio y el repetir **no están acá**, y es a propósito.
               *
               * Estuvieron, y estaba mal: son decisiones que se toman mientras
               * escuchás y mirando lo que suena, no configuración. Tener que
               * abrir Ajustes para barajar la lista que tenés puesta es demasiado
               * camino para algo que en cualquier reproductor es un toque al lado
               * del play. Ahora viven ahí —`ui/Transport`, en la pantalla de
               * «Sonando» y en la barra de escritorio— y el aleatorio además en la
               * cabecera de cada lista, que es donde se decide cómo escucharla.
               *
               * Lo que queda es lo que sí es configuración: lo que la app hace
               * **sola**, cuando vos ya no estás decidiendo nada.
               */}
              <GrupoAjustes titulo="Reproducción">
                <FilaInterruptor
                  rotulo="Seguir al terminar la lista"
                  detalle="Cuando se acaban tus canciones, sigue con recomendaciones a partir de lo que más escuchás."
                  icono={<IconDisc size={17} color={ICON_COLOR.muted} />}
                  activo={autoplay}
                  onCambiar={setAutoplay}
                  ultima
                />
              </GrupoAjustes>

              {/*
               * El temporizador va en su propio grupo y no con lo de arriba.
               *
               * Los de arriba son preferencias: quedan puestas. Esto es una
               * acción con efecto en el tiempo —se arma, corre y se apaga sola—
               * y mezclarla entre interruptores haría creer que también se
               * queda.
               */}
              <GrupoAjustes titulo="Temporizador">
                {MINUTOS.map((m, i) => (
                  <FilaAjuste
                    key={m}
                    rotulo={m === 0 ? 'No apagar' : `${m} minutos`}
                    valor={
                      (m === 0 && dormirMin === null) || dormirMin === m
                        ? 'Puesto'
                        : ''
                    }
                    vacio=""
                    icono={<IconClock size={17} color={ICON_COLOR.muted} />}
                    onPress={() => programarApagado(m === 0 ? null : m)}
                    ultima={i === MINUTOS.length - 1}
                  />
                ))}
              </GrupoAjustes>

              {/*
               * Las descargas tienen pantalla propia: acá solo la puerta, con
               * el resumen en la fila — cuántas hay y cuánto ocupan, que es lo
               * que uno viene a averiguar. Adentro está la lista completa, el
               * interruptor de Wi-Fi y el borrado.
               *
               * En la web no aparece: `expo-file-system` no guarda nada ahí, así
               * que una puerta a «0 MB» para siempre sería mentir sobre una
               * función que no existe.
               */}
              {HAY_DESCARGAS ? (
                <GrupoAjustes titulo="Almacenamiento">
                  <FilaAjuste
                    rotulo="Descargas"
                    valor={
                      pendientes > 0
                        ? `${pendientes} en camino`
                        : bajadas > 0
                          ? `${bajadas} ${bajadas === 1 ? 'canción' : 'canciones'} · ${formatoBytes(ocupado)}`
                          : ''
                    }
                    vacio="Todavía no bajaste ninguna"
                    icono={<IconDisk size={17} color={ICON_COLOR.muted} />}
                    onPress={() => router.push('/ajustes/descargas')}
                    ultima
                  />
                </GrupoAjustes>
              ) : null}

              {/*
               * Las novedades: qué cambió en cada versión. En el escritorio la
               * sub-pantalla además muestra el actualizador — por eso el grupo
               * se llama por la app y no «Acerca de», que suena a licencias.
               */}
              <GrupoAjustes titulo="La app">
                <FilaAjuste
                  rotulo="Novedades"
                  valor={NOVEDADES[0] ? `Versión ${NOVEDADES[0].version}` : ''}
                  vacio=""
                  icono={<IconSparkles size={17} color={ICON_COLOR.muted} />}
                  onPress={() => router.push('/ajustes/novedades')}
                  ultima
                />
              </GrupoAjustes>

              {/*
               * Borrar el historial no tiene vuelta, así que se sostiene.
               * Va al final y separado: es lo único de esta pantalla que borra
               * algo que **no se puede recuperar** —las descargas sí— y lo único
               * que le importa a las recomendaciones.
               */}
              <GrupoAjustes titulo="Tus datos">
                <FilaSostener
                  rotulo="Borrar historial de escucha"
                  detalle="Las recomendaciones vuelven a empezar de cero. No se puede deshacer."
                  icono={<IconTrash size={17} color={ICON_COLOR.muted} />}
                  onCompletar={() => void borrar()}
                  ultima
                />
              </GrupoAjustes>

              {/*
               * Cerrar sesión vive acá y no en el panel lateral: es la única
               * acción de la app que te saca en vez de llevarte, y en el panel
               * convivía —a un toque de distancia— con crear una lista.
               * Sostenida, porque volver a entrar pide la contraseña.
               */}
              <GrupoAjustes titulo="Tu cuenta">
                {/* La puerta de salida del bloqueo vive acá: el perfil de un
                    bloqueado ya no se puede abrir, así que se deshace desde
                    esta lista. */}
                <FilaAjuste
                  rotulo="Bloqueados"
                  valor=""
                  vacio=""
                  icono={<IconBan size={17} color={ICON_COLOR.muted} />}
                  onPress={() => router.push('/ajustes/bloqueados')}
                />
                <FilaSostener
                  rotulo="Cerrar sesión"
                  detalle="Vas a volver a la pantalla de entrada."
                  icono={<IconLogOut size={17} color={ICON_COLOR.muted} />}
                  onCompletar={() => void endSession()}
                  ultima
                />
              </GrupoAjustes>
            </View>
          </ScrollView>
        </Panel>
      </View>
    </SafeAreaView>
  )
}
