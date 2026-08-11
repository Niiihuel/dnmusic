import { useEffect, useState } from 'react'
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Panel } from '../src/ui/Panel'
import { FilaAjuste, FilaInterruptor, GrupoAjustes } from '../src/ui/Ajustes'
import {
  ICON_COLOR,
  IconBack,
  IconClock,
  IconDisc,
  IconDisk,
  IconTrash,
  IconWifi,
} from '../src/ui/icons'
import {
  borrarTodo,
  cuantasListas,
  cuantasPendientes,
  espacioUsado,
  formatoBytes,
  HAY_DESCARGAS,
  reanudarDescargas,
  useDescargas,
} from '../src/state/descargas'
import { setAutoplay, setSoloWifi, useAjustes } from '../src/state/ajustes'
import { programarApagado, useDormirMin } from '../src/state/playback'
import { borrarHistorial } from '../src/services/plays'
import { avisar } from '../src/state/aviso'
import { mensajeError } from '../src/lib/mensajeError'
import { usePiso } from '../src/state/shell'
import { volver } from '../src/lib/volver'

/** Debajo de esto la app es pestañas y el contenido va de borde a borde. */
const SHELL_PX = 780
/** Tope del contenido en escritorio, como en el resto de las pantallas. */
const CAP = 672
/** Los cortes del temporizador. El 0 es «no apagar». */
const MINUTOS = [0, 15, 30, 60]
/** Cuánto queda armada una confirmación antes de desarmarse sola. */
const CONFIRMAR_MS = 5000

/**
 * Confirmación **en la propia fila**, con dos toques.
 *
 * No es un `Alert.alert` porque `react-native-web` no lo implementa: en la web
 * el diálogo no aparecería y la acción no se dispararía nunca. Un patrón que
 * funciona en una plataforma y falla en silencio en la otra es peor que no tener
 * confirmación.
 *
 * El primer toque arma y cambia el texto; el segundo hace la cosa. Se desarma
 * solo a los cinco segundos, para que un toque olvidado no quede esperando a que
 * alguien roce la pantalla más tarde.
 *
 * `confirmar()` devuelve si hay que actuar, así quien lo usa escribe el caso
 * normal —«si no me confirmaron, no hago nada»— en una línea y sin anidar.
 */
function useDobleToque() {
  const [armado, setArmado] = useState(false)
  useEffect(() => {
    if (!armado) return
    const id = setTimeout(() => setArmado(false), CONFIRMAR_MS)
    return () => clearTimeout(id)
  }, [armado])

  return {
    armado,
    confirmar: () => {
      if (!armado) {
        setArmado(true)
        return false
      }
      setArmado(false)
      return true
    },
  }
}

/**
 * Los ajustes de la app.
 *
 * Existe como pantalla propia y no como un bloque más adentro del editor de
 * perfil porque son cosas distintas: el editor cambia **quién sos** —lo que ve
 * la otra persona— y esto cambia **cómo suena la app para vos**. Meterlos
 * juntos obligaba a bajar por tu foto y tu biografía para llegar a una perilla
 * de reproducción.
 *
 * Reusa `GrupoAjustes` y `FilaInterruptor`, que ya existían para el editor: la
 * forma de una lista de ajustes en esta app está resuelta y no hay razón para
 * inventar otra.
 */
export default function Ajustes() {
  const router = useRouter()
  const { autoplay, soloWifi } = useAjustes()
  const dormirMin = useDormirMin()

  const historial = useDobleToque()
  const descargas = useDobleToque()
  const { items, esperandoWifi } = useDescargas()
  const bajadas = cuantasListas(items)
  const pendientes = cuantasPendientes(items)
  const ocupado = espacioUsado(items)

  async function borrar() {
    if (!historial.confirmar()) return
    try {
      await borrarHistorial()
      avisar('Historial borrado')
    } catch (e) {
      avisar(`No se pudo borrar: ${mensajeError(e)}`, true)
    }
  }

  function borrarDescargas() {
    if (!descargas.confirmar()) return
    borrarTodo()
    avisar('Descargas borradas')
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
               * Las descargas.
               *
               * Acá no se baja nada: eso se hace desde la lista o desde la
               * canción, que es donde uno está cuando decide que quiere tenerla.
               * Esta pantalla es la que responde la pregunta que solo se hace
               * acá — «¿cuánto me están ocupando?»— y da la única forma de
               * recuperar todo ese espacio de una vez.
               *
               * En la web no aparece: `expo-file-system` no guarda nada ahí, así
               * que un grupo diciendo «0 MB» para siempre sería mentir sobre una
               * función que no existe.
               */}
              {HAY_DESCARGAS ? (
                <GrupoAjustes titulo="Descargas">
                  {/*
                   * El detalle cambia según lo que esté pasando de verdad.
                   *
                   * Con la cola frenada por datos móviles, un texto fijo dejaría
                   * la app pareciendo colgada: canciones marcadas que no bajan
                   * nunca y ninguna explicación en pantalla. Acá dice qué está
                   * esperando y el interruptor de al lado es justo lo que lo
                   * destraba.
                   */}
                  <FilaInterruptor
                    rotulo="Descargar solo con Wi-Fi"
                    detalle={
                      esperandoWifi
                        ? `${pendientes} ${pendientes === 1 ? 'canción esperando' : 'canciones esperando'} a que haya Wi-Fi. Apagalo para bajarlas con datos.`
                        : 'Un disco son decenas de megas. Apagalo si tenés datos de sobra.'
                    }
                    icono={<IconWifi size={17} color={ICON_COLOR.muted} />}
                    activo={soloWifi}
                    onCambiar={(v) => {
                      setSoloWifi(v)
                      /* Apagarlo tiene que destrabar lo que quedó esperando: el
                         bucle de descargas se cortó y nadie lo despierta solo. */
                      if (!v) reanudarDescargas()
                    }}
                  />
                  <FilaAjuste
                    rotulo={
                      descargas.armado ? 'Tocá de nuevo para confirmar' : 'Borrar las descargas'
                    }
                    valor={
                      descargas.armado
                        ? 'Se pueden volver a bajar'
                        : bajadas > 0
                          ? `${bajadas} ${bajadas === 1 ? 'canción' : 'canciones'} · ${formatoBytes(ocupado)}`
                          : ''
                    }
                    vacio="Todavía no bajaste ninguna"
                    icono={<IconDisk size={17} color={ICON_COLOR.muted} />}
                    onPress={borrarDescargas}
                    ultima
                  />
                </GrupoAjustes>
              ) : null}

              {/*
               * Borrar el historial no tiene vuelta, así que pide dos toques.
               * Va al final y separado: es lo único de esta pantalla que borra
               * algo que **no se puede recuperar** —las descargas sí— y lo único
               * que le importa a las recomendaciones.
               */}
              <GrupoAjustes titulo="Tus datos">
                <FilaAjuste
                  rotulo={
                    historial.armado ? 'Tocá de nuevo para confirmar' : 'Borrar historial de escucha'
                  }
                  valor={historial.armado ? 'Esto no se puede deshacer' : ''}
                  vacio="Las recomendaciones vuelven a empezar de cero"
                  icono={<IconTrash size={17} color={ICON_COLOR.muted} />}
                  onPress={() => void borrar()}
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
