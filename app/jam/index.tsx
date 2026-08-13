import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { volver } from '../../src/lib/volver'
import {
  crearJamActual,
  salirDelJam,
  useConexionJam,
  useJam,
  useMiembrosJam,
  usePresentesJam,
  useSoyHostJam,
} from '../../src/state/jam'
import { Avatar } from '../../src/ui/Avatar'
import { BotonSostener } from '../../src/ui/BotonSostener'
import { ColaJam } from '../../src/ui/ColaJam'
import { BotonVidrio } from '../../src/ui/Glass'
import { Hoja } from '../../src/ui/Hoja'
import { ICON_COLOR, IconPlus, IconSliders, IconUsers } from '../../src/ui/icons'

/**
 * El Jam, como hoja nativa: el drawer que sube sobre lo que estabas mirando.
 *
 * Ya no es una pantalla que tapa todo — es un `formSheet` con detents (ver el
 * registro en `app/_layout.tsx`): sube hasta tres cuartos, se estira a todo
 * con el dedo y se baja con el gesto del sistema, con la app viva atrás. Las
 * hojas de invitar (`personas`) y de opciones (`opciones`) se **apilan
 * encima**, cada una más angosta y con lo de atrás oscurecido — la pila de
 * drawers del referente, pero dibujada por UIKit y no imitada.
 *
 * La anatomía es la del Jam de Spotify leída con nuestras reglas: el título
 * dice de quién es la casa, la tira de avatares dice quiénes están y es la
 * puerta a invitar, y el resto de la hoja es **la fila** — lo que suena y lo
 * que viene, reordenable arrastrando la manija (ver `ColaJam`).
 *
 * Terminar es sostener, no tocar dos veces: `BotonSostener` se llena mientras
 * el dedo está apoyado y recién al completarse cierra el Jam y baja la hoja.
 * Soltar antes es arrepentirse gratis.
 */
export default function JamSheet() {
  const router = useRouter()
  const jam = useJam()
  const miembros = useMiembrosJam()
  const presentes = usePresentesJam()
  const conexion = useConexionJam()
  const soyHost = useSoyHostJam()
  /* El arrastre de la cola congela el scroll de la hoja: dos gestos verticales
     sobre el mismo dedo es uno de más. */
  const [arrastrando, setArrastrando] = useState(false)

  /* Sin Jam no hay nada que mostrar: o terminó con esto abierto, o entraron
     por la URL directa. Mirar no crea nada — «Iniciar» es un botón que dice
     lo que hace. */
  if (!jam) {
    return (
      <Hoja>
      <SafeAreaView
        edges={['bottom']}
        className="flex-1 items-center justify-center gap-4 bg-background"
      >
        <IconUsers size={26} color={ICON_COLOR.muted} />
        <Text className="text-muted-foreground text-[13px]">
          {conexion === 'conectando' ? 'Conectando…' : 'No estás en ningún Jam.'}
        </Text>
        {conexion === 'conectando' ? null : (
          <Pressable
            accessibilityRole="button"
            onPress={() => void crearJamActual()}
            className="rounded-full bg-primary px-5 py-2.5 active:opacity-80"
          >
            <Text className="text-primary-foreground text-[13px] font-semibold">
              Iniciar un Jam
            </Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          onPress={() => volver(router, '/')}
          className="rounded-full bg-muted px-5 py-2.5 active:opacity-80"
        >
          <Text className="text-foreground text-[13px] font-semibold">Volver</Text>
        </Pressable>
      </SafeAreaView>
      </Hoja>
    )
  }

  const host = miembros.find((m) => m.rol === 'host')
  const nombreHost = host ? host.displayName?.trim() || `@${host.username}` : null
  const enVivo = new Set(presentes)
  const visibles = miembros.slice(0, 5)

  return (
    /* En web, `Hoja` pone lo que en iOS pone el formSheet: la subida, el
       grabber, el velo y el cierre tocando afuera. En nativo no dibuja nada. */
    <Hoja>
    <SafeAreaView edges={['bottom']} className="flex-1 bg-background">
      <View className="gap-3 px-5 pb-3 pt-4">
        <View className="gap-0.5">
          <Text className="text-foreground text-[22px] font-extrabold" numberOfLines={1}>
            {nombreHost ? `Jam de ${nombreHost}` : 'Jam'}
          </Text>
          <Text className="text-muted-foreground text-[12px]">
            Código {jam.code} · {miembros.length}{' '}
            {miembros.length === 1 ? 'persona' : 'personas'}
          </Text>
        </View>

        <View className="flex-row items-center gap-3">
          {/* La tira de avatares ES la puerta a la gente: tocarla abre la hoja
              de invitar, igual que el «+». El puntito es presencia. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ver quiénes están e invitar"
            onPress={() => router.push('/jam/personas')}
            className="flex-row items-center active:opacity-70"
          >
            {visibles.map((m, i) => (
              <View
                key={m.userId}
                className="rounded-full border-2 border-background"
                style={i > 0 ? { marginLeft: -10 } : null}
              >
                <Avatar name={m.displayName ?? m.username} path={m.avatarPath} size={30} />
                <View
                  className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background ${
                    enVivo.has(m.userId) ? 'bg-foreground' : 'bg-muted'
                  }`}
                />
              </View>
            ))}
            {miembros.length > visibles.length ? (
              <Text className="text-muted-foreground ml-1.5 text-[11px]">
                +{miembros.length - visibles.length}
              </Text>
            ) : null}
          </Pressable>
          <BotonVidrio label="Invitar" onPress={() => router.push('/jam/personas')}>
            <View className="h-9 w-9 items-center justify-center">
              <IconPlus size={17} color={ICON_COLOR.foreground} />
            </View>
          </BotonVidrio>

          <View className="flex-1" />

          <BotonVidrio label="Opciones del Jam" onPress={() => router.push('/jam/opciones')}>
            <View className="h-9 w-9 items-center justify-center">
              <IconSliders size={16} color={ICON_COLOR.foreground} />
            </View>
          </BotonVidrio>
          <BotonSostener
            rotulo={soyHost ? 'Terminar' : 'Salir'}
            pista={
              soyHost
                ? 'Mantené apretado para terminar el Jam. Se termina para todos.'
                : 'Mantené apretado para salir del Jam.'
            }
            onCompletar={() => {
              salirDelJam()
              volver(router, '/')
            }}
          />
        </View>
      </View>

      <ScrollView
        className="min-h-0 flex-1"
        scrollEnabled={!arrastrando}
        contentContainerClassName="gap-2 px-5 pb-8"
      >
        <Text className="text-muted-foreground pt-2 text-[11px] font-semibold uppercase tracking-[1.2px]">
          Fila de reproducción
        </Text>
        <ColaJam onArrastre={setArrastrando} />
      </ScrollView>
    </SafeAreaView>
    </Hoja>
  )
}
