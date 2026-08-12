import { useEffect, useState } from 'react'
import { Pressable, ScrollView, Share, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { volver } from '../../src/lib/volver'
import { avisar } from '../../src/state/aviso'
import {
  cambiarMiSalida,
  expulsarMiembro,
  ponerPermisosJam,
  quitarCancionDelJam,
  salirDelJam,
  useColaJam,
  useConexionJam,
  useJam,
  useMiembrosJam,
  useMiIdJam,
  useMiSalidaJam,
  usePresentesJam,
  useSoyHostJam,
} from '../../src/state/jam'
import { playAt, usePlaybackIndex } from '../../src/state/playback'
import { Avatar } from '../../src/ui/Avatar'
import { GrupoAjustes, FilaInterruptor } from '../../src/ui/Ajustes'
import {
  ICON_COLOR,
  IconChevronDown,
  IconClose,
  IconMusic,
  IconShare,
  IconUsers,
} from '../../src/ui/icons'

/**
 * El link que se comparte. La misma URL entra por web y por la app.
 *
 * Va cableado y no en una variable de entorno a propósito: es el dominio que
 * está declarado en `associatedDomains` y en el `apple-app-site-association`,
 * y los tres tienen que decir lo mismo o el link deja de abrir la app. Un
 * valor que se puede cambiar por build es justo lo que no queremos acá.
 */
const BASE_INVITACION = 'https://dnmusic-app.vercel.app/jam'

/** Confirmación de dos toques, como la de Ajustes: sin Alert, que en web no existe. */
function useDobleToque() {
  const [armado, setArmado] = useState(false)
  useEffect(() => {
    if (!armado) return
    const id = setTimeout(() => setArmado(false), 5000)
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
 * El Jam, de frente: quiénes están, qué viene, y las perillas del host.
 *
 * Es una ruta modal y no un panel dentro de otra pantalla por lo mismo que
 * «Sonando»: sube desde abajo, se baja con el gesto, y la música ni se entera.
 * Todo lo que se ve acá sale de `state/jam`; no hay un solo estado del Jam
 * guardado en esta pantalla — lo único local es qué confirmación está armada.
 */
export default function JamSheet() {
  const router = useRouter()
  const jam = useJam()
  const miembros = useMiembrosJam()
  const cola = useColaJam()
  const presentes = usePresentesJam()
  const conexion = useConexionJam()
  const soyHost = useSoyHostJam()
  const miId = useMiIdJam()
  const salida = useMiSalidaJam()
  const indice = usePlaybackIndex()
  const cierre = useDobleToque()

  /* Sin Jam no hay nada que mostrar: o terminó con esto abierto, o entraron
     por la URL directa. El botón de crear vive donde está la música. */
  if (!jam) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center gap-4 bg-background">
        <IconUsers size={26} color={ICON_COLOR.muted} />
        <Text className="text-muted-foreground text-[13px]">
          {conexion === 'conectando' ? 'Conectando…' : 'No estás en ningún Jam.'}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => volver(router, '/')}
          className="rounded-full bg-muted px-5 py-2.5 active:opacity-80"
        >
          <Text className="text-foreground text-[13px] font-semibold">Volver</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  const enVivo = new Set(presentes)

  async function invitar() {
    const url = `${BASE_INVITACION}/${jam?.code ?? ''}`
    try {
      await Share.share({ message: `Escuchemos juntos en Dany: ${url}` })
    } catch {
      // Sin hoja de compartir (web sin https, escritorio): el código alcanza.
      avisar(`Compartí el código ${jam?.code ?? ''} o el link ${url}`)
    }
  }

  function cerrarJam() {
    if (!cierre.confirmar()) return
    salirDelJam()
    volver(router, '/')
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <View className="flex-row items-center gap-3 px-4 py-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Bajar"
          onPress={() => volver(router, '/')}
          className="h-10 w-10 items-center justify-center rounded-full active:bg-muted"
        >
          <IconChevronDown size={22} color={ICON_COLOR.foreground} />
        </Pressable>
        <View className="min-w-0 flex-1 items-center">
          <Text className="text-muted-foreground text-[11px] uppercase tracking-[1.2px]">
            Jam · {jam.code}
          </Text>
        </View>
        <View className="h-10 w-10" />
      </View>

      <ScrollView contentContainerClassName="gap-6 px-4 pb-8">
        {/* Quiénes. La presencia es el puntito: miembro sin puntito es alguien
            que está en el Jam pero con la app cerrada o sin señal. */}
        <View className="gap-3">
          <Text className="text-foreground text-[15px] font-semibold">
            Escuchando juntos · {miembros.length}
          </Text>
          <View className="gap-1 rounded-2xl bg-card">
            {miembros.map((m, i) => (
              <View
                key={m.userId}
                className={`flex-row items-center gap-3 px-4 py-3 ${
                  i > 0 ? 'border-t border-background' : ''
                }`}
              >
                <View>
                  <Avatar name={m.displayName ?? m.username} path={m.avatarPath} size={36} />
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
                  <Text className="text-muted-foreground text-[11px]">
                    {m.rol === 'host'
                      ? 'Host'
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
                    className="h-9 w-9 items-center justify-center rounded-full active:bg-muted"
                  >
                    <IconClose size={15} color={ICON_COLOR.muted} />
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Invitar"
            onPress={() => void invitar()}
            className="flex-row items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 active:opacity-80"
          >
            <IconShare size={16} color={ICON_COLOR.onPrimary} />
            <Text className="text-primary-foreground text-[14px] font-semibold">
              Invitar con un link
            </Text>
          </Pressable>
        </View>

        {/* La cola compartida, con quién puso cada una. Tocar salta ahí (si el
            permiso alcanza; si no, el puente lo dice con palabras). */}
        <View className="gap-3">
          <Text className="text-foreground text-[15px] font-semibold">La cola</Text>
          <View className="rounded-2xl bg-card">
            {cola.length === 0 ? (
              <View className="items-center gap-2 px-6 py-8">
                <IconMusic size={20} color={ICON_COLOR.muted} />
                <Text className="text-muted-foreground text-[12px]">
                  No queda nada en la cola. Agregá desde el buscador o una lista.
                </Text>
              </View>
            ) : (
              cola.map((item, i) => {
                const dueno = miembros.find((m) => m.userId === item.agregadoPor)
                const sonando = i === indice
                const puedoQuitar = !sonando && (soyHost || item.agregadoPor === miId)
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Saltar a ${item.title}`}
                    onPress={() => playAt(i)}
                    className={`flex-row items-center gap-3 px-4 py-3 active:bg-muted ${
                      i > 0 ? 'border-t border-background' : ''
                    }`}
                  >
                    <View className="min-w-0 flex-1">
                      <Text
                        className={`text-[13px] font-semibold ${
                          sonando ? 'text-foreground' : 'text-muted-foreground'
                        }`}
                        numberOfLines={1}
                      >
                        {item.title}
                      </Text>
                      <Text className="text-muted-foreground text-[11px]" numberOfLines={1}>
                        {item.artist}
                        {dueno ? ` · la puso ${dueno.displayName?.trim() || dueno.username}` : ''}
                      </Text>
                    </View>
                    {sonando ? (
                      <Text className="text-muted-foreground text-[10px] uppercase tracking-[1px]">
                        Sonando
                      </Text>
                    ) : null}
                    {puedoQuitar ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Quitar ${item.title}`}
                        onPress={() => quitarCancionDelJam(item.id)}
                        className="h-9 w-9 items-center justify-center rounded-full active:bg-background"
                      >
                        <IconClose size={14} color={ICON_COLOR.muted} />
                      </Pressable>
                    ) : null}
                  </Pressable>
                )
              })
            )}
          </View>
        </View>

        {/* Dónde escucho yo. El host no elige: él es el emisor. */}
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
        ) : null}

        {/* Las perillas del host: qué dejan hacer los invitados. Cambiarlas no
            saca a nadie — al que le quitaste el permiso simplemente el botón
            le empieza a decir que no. */}
        {soyHost ? (
          <GrupoAjustes titulo="Los invitados pueden">
            <FilaInterruptor
              rotulo="Agregar canciones"
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
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={soyHost ? 'Terminar el Jam' : 'Salir del Jam'}
          onPress={cerrarJam}
          className="items-center rounded-full bg-card px-5 py-3 active:opacity-80"
        >
          <Text className="text-foreground text-[14px] font-semibold">
            {cierre.armado
              ? 'Tocá de nuevo para confirmar'
              : soyHost
                ? 'Terminar el Jam'
                : 'Salir del Jam'}
          </Text>
          {soyHost && cierre.armado ? (
            <Text className="text-muted-foreground mt-1 text-[11px]">
              Se termina para todos
            </Text>
          ) : null}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  )
}
