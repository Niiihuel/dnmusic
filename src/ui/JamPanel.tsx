import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { invitarAlJam } from '../lib/invitarJam'
import {
  cambiarMiSalida,
  crearJamActual,
  expulsarMiembro,
  ponerPermisosJam,
  salirDelJam,
  useConexionJam,
  useJam,
  useMiembrosJam,
  useMiIdJam,
  useMiSalidaJam,
  usePresentesJam,
  useSoyHostJam,
} from '../state/jam'
import { usePiso } from '../state/shell'
import { Avatar } from './Avatar'
import { GrupoAjustes, FilaInterruptor } from './Ajustes'
import { BotonSostener } from './BotonSostener'
import { ColaJam } from './ColaJam'
import { EntrarConCodigo } from './EntrarJam'
import { MandarJamAmigo } from './MandarJamAmigo'
import { ICON_COLOR, IconClose, IconShare, IconUsers } from './icons'

/**
 * El Jam como cara del panel derecho, para el escritorio.
 *
 * Es la respuesta a la pantalla del teléfono estirada a 1440px: una modal
 * pensada para el pulgar, ocupando una ventana entera para mostrar cuatro
 * filas. Spotify lo resuelve igual que su cola —un panel al costado— y acá
 * ese panel ya existe: es el de «Sonando», que ya sabe alternar caras (la
 * ficha, el disco, la letra). El Jam es una cara más, al lado de la lista,
 * sin taparle la música a nadie.
 *
 * Tres decisiones propias, donde nos apartamos del referente:
 *
 * - **Abrir el panel no crea ningún Jam.** El botón de la barra mostraba y
 *   creaba en el mismo toque; ahora primero se ve qué es, y «Iniciar» es un
 *   botón que dice lo que hace. Crear algo compartido no puede ser el efecto
 *   secundario de mirar.
 * - **Invitar copia el link.** En escritorio no hay hoja de compartir; el
 *   portapapeles es el gesto nativo (`lib/invitarJam`) y el aviso confirma.
 * - **La cola dice quién puso cada tema y se reordena acá mismo.** Es la
 *   misma `ColaJam` del teléfono: arrastrar la manija también funciona con
 *   el mouse, y los permisos están a la vista en vez de detrás de un menú.
 *
 * Terminar es sostener el botón hasta que se llene (`BotonSostener`), no
 * tocar dos veces: la confirmación vive en el gesto.
 */
export function JamBody() {
  const jam = useJam()
  const miembros = useMiembrosJam()
  const presentes = usePresentesJam()
  const conexion = useConexionJam()
  const soyHost = useSoyHostJam()
  const miId = useMiIdJam()
  const salida = useMiSalidaJam()
  const [creando, setCreando] = useState(false)
  /* El arrastre de una fila congela el scroll del panel: dos gestos
     verticales sobre el mismo puntero es uno de más. */
  const [arrastrando, setArrastrando] = useState(false)
  /* Arriba de todo, antes del `return` temprano: los hooks no se llaman a
     medias. */
  const piso = usePiso(20)

  /* Sin Jam, el panel explica y ofrece — no crea solo por haberse abierto. */
  if (!jam) {
    return (
      /* Centrado en **lo que se ve**, descontando lo que tapa el reproductor:
         centrado a secas deja el botón medio metido debajo de la píldora. */
      <View
        className="flex-1 items-center justify-center gap-3 px-8"
        style={{ paddingBottom: piso }}
      >
        <View className="h-14 w-14 items-center justify-center rounded-full bg-muted">
          <IconUsers size={22} color={ICON_COLOR.muted} />
        </View>
        <Text className="text-foreground text-center text-[15px] font-semibold">
          {conexion === 'conectando' ? 'Conectando…' : 'Escuchen juntos'}
        </Text>
        <Text className="text-muted-foreground text-center text-[13px] leading-5">
          Un Jam es una cola compartida: lo que suena acá, suena para todos, y
          cualquiera con el link puede sumar canciones.
        </Text>
        {conexion === 'conectando' ? null : (
          <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Iniciar un Jam"
            disabled={creando}
            onPress={() => {
              setCreando(true)
              void crearJamActual().finally(() => setCreando(false))
            }}
            className="mt-2 flex-row items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 active:opacity-80"
          >
            <IconUsers size={15} color={ICON_COLOR.onPrimary} />
            <Text className="text-primary-foreground text-[13px] font-semibold">
              {creando ? 'Creando…' : 'Iniciar un Jam'}
            </Text>
          </Pressable>
          {/* Y la puerta para entrar al Jam de otro sin depender de que el
              link abra: se pega el código o el link y se cae en la misma
              pantalla de siempre. */}
          <EntrarConCodigo />
          </>
        )}
      </View>
    )
  }

  const enVivo = new Set(presentes)

  return (
    <View className="min-h-0 flex-1">
    <ScrollView
      className="min-h-0 flex-1"
      scrollEnabled={!arrastrando}
      contentContainerClassName="gap-5 px-4"
      /*
       * El hueco del reproductor se reserva **adentro** de la lista, como en
       * todo el resto (regla 2 de `docs/DESIGN.md`): la barra flota sobre el
       * contenido y hay que poder llegar hasta la última fila igual.
       *
       * Acá había un `pb-6` a mano, de cuando la barra se apilaba al pie en
       * escritorio. Desde que también flota ahí, la píldora se comía el final
       * del panel — «Salir del Jam» quedaba abajo del reproductor y no había
       * forma de tocarlo.
       */
      contentContainerStyle={{ paddingBottom: 12 }}
    >
      {/* Quiénes. El puntito es presencia: sin puntito está en el Jam pero
          con la app cerrada o sin señal. */}
      <View className="gap-2">
        <Text className="text-muted-foreground text-[11px] font-semibold uppercase tracking-[1.2px]">
          Escuchando juntos · {miembros.length}
        </Text>
        <View className="rounded-2xl bg-card">
          {miembros.map((m, i) => (
            <View
              key={m.userId}
              className={`flex-row items-center gap-3 px-3 py-2.5 ${
                i > 0 ? 'border-t border-background' : ''
              }`}
            >
              <View>
                <Avatar name={m.displayName ?? m.username} path={m.avatarPath} size={32} />
                <View
                  className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${
                    enVivo.has(m.userId) ? 'bg-foreground' : 'bg-muted'
                  }`}
                />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="text-foreground text-[13px] font-semibold" numberOfLines={1}>
                  {m.displayName?.trim() || `@${m.username}`}
                  {m.userId === miId ? ' (vos)' : ''}
                </Text>
                <Text className="text-muted-foreground text-[11px]" numberOfLines={1}>
                  {m.rol === 'host'
                    ? 'Anfitrión'
                    : m.salida === 'host'
                      ? 'Escucha en el dispositivo del host'
                      : 'Escucha en su dispositivo'}
                </Text>
              </View>
              {soyHost && m.userId !== miId ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Sacar a ${m.username}`}
                  onPress={() => expulsarMiembro(m.userId)}
                  className="h-8 w-8 items-center justify-center rounded-full active:bg-muted"
                >
                  <IconClose size={14} color={ICON_COLOR.muted} />
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Invitar con un link"
          onPress={() => void invitarAlJam(jam.code)}
          className="flex-row items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 active:opacity-80"
        >
          <IconShare size={15} color={ICON_COLOR.onPrimary} />
          <Text className="text-primary-foreground text-[13px] font-semibold">
            Invitar con un link
          </Text>
        </Pressable>

        {/* O elegir a un amigo y mandarle el link al chat, sin copiar nada. */}
        <MandarJamAmigo code={jam.code} />
      </View>

      {/* La fila compartida: lo que suena y lo que viene, con quién puso cada
          una y la manija para reordenar. Tocar salta ahí (si el permiso
          alcanza; si no, el puente lo dice con palabras). */}
      <View className="gap-2">
        <Text className="text-muted-foreground text-[11px] font-semibold uppercase tracking-[1.2px]">
          Fila de reproducción
        </Text>
        <ColaJam onArrastre={setArrastrando} />
      </View>

      {/* Dónde escucho yo (invitado) / qué pueden hacer los invitados (host).
          Cambiar una perilla no saca a nadie: al que perdió el permiso, el
          botón simplemente le empieza a decir que no. */}
      {!soyHost ? (
        <GrupoAjustes titulo="Tu dispositivo">
          <FilaInterruptor
            rotulo="Escuchar acá"
            detalle={
              salida === 'propia'
                ? 'La música suena en este dispositivo, sincronizada con el Jam.'
                : 'La música suena donde el host; desde acá controlás y agregás.'
            }
            activo={salida === 'propia'}
            onCambiar={(v) => cambiarMiSalida(v ? 'propia' : 'host')}
            ultima
          />
        </GrupoAjustes>
      ) : (
        <GrupoAjustes titulo="Los invitados pueden">
          <FilaInterruptor
            rotulo="Agregar y reordenar canciones"
            activo={jam.permisos.agregan}
            onCambiar={(v) => ponerPermisosJam({ agregan: v })}
          />
          <FilaInterruptor
            rotulo="Pausar y saltar de posición"
            activo={jam.permisos.controlan}
            onCambiar={(v) => ponerPermisosJam({ controlan: v })}
          />
          <FilaInterruptor
            rotulo="Cambiar de canción"
            activo={jam.permisos.saltan}
            onCambiar={(v) => ponerPermisosJam({ saltan: v })}
            ultima
          />
        </GrupoAjustes>
      )}

    </ScrollView>
      {/*
       * Terminar/Salir vive **fijo abajo**, fuera del scroll: era el último
       * hijo de la lista y quedaba abajo de la cola y de los permisos —había
       * que recorrer todo para encontrarlo—. Sostener sigue siendo el gesto;
       * el `piso` lo despega del reproductor que flota encima.
       */}
      <View className="px-4 pt-2" style={{ paddingBottom: piso }}>
        <BotonSostener
          rotulo={soyHost ? 'Terminar el Jam' : 'Salir del Jam'}
          pista={
            soyHost
              ? 'Mantené apretado para terminar el Jam. Se termina para todos.'
              : 'Mantené apretado para salir del Jam.'
          }
          onCompletar={salirDelJam}
        />
      </View>
    </View>
  )
}
