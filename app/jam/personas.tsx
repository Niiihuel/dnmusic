import { Pressable, ScrollView, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import QRCode from 'react-native-qrcode-svg'
import { invitarAlJam, linkDeJam } from '../../src/lib/invitarJam'
import { volver } from '../../src/lib/volver'
import {
  expulsarMiembro,
  useJam,
  useMiembrosJam,
  useMiIdJam,
  usePresentesJam,
  useSoyHostJam,
} from '../../src/state/jam'
import { Avatar } from '../../src/ui/Avatar'
import { ES_WEB } from '../../src/ui/Glass'
import { Hoja } from '../../src/ui/Hoja'
import { ICON_COLOR, IconClose, IconShare } from '../../src/ui/icons'

/**
 * Invitar y ver quiénes están: la segunda hoja de la pila del Jam.
 *
 * Se apila sobre el sheet principal como drawer nativo (ver `app/_layout.tsx`)
 * y junta las dos mitades de «la gente»: los caminos para que entren y la
 * lista de los que ya están.
 *
 * Tres caminos de entrada, del más liviano al más presencial: **compartir el
 * link** (la hoja del sistema o el portapapeles — `lib/invitarJam`), **dictar
 * el código** (seis letras sin confusas, pensadas para decirse en voz alta), y
 * **mostrar el QR** para que lo escaneen con la cámara — el único camino que
 * no pide tipear nada y por eso el que gana con gente en la misma sala, que
 * es la escena para la que existe un Jam.
 *
 * El QR va sobre una tarjeta blanca aunque el sistema entero sea oscuro: los
 * lectores esperan módulos oscuros sobre claro, y la zona muda alrededor es
 * parte del formato, no un margen decorativo.
 */
export default function PersonasJam() {
  const router = useRouter()
  const jam = useJam()
  const miembros = useMiembrosJam()
  const presentes = usePresentesJam()
  const soyHost = useSoyHostJam()
  const miId = useMiIdJam()

  if (!jam) {
    return (
      <Hoja>
      <View className="flex-1 items-center justify-center gap-4 bg-background">
        <Text className="text-muted-foreground text-[13px]">El Jam terminó.</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => volver(router, '/')}
          className="rounded-full bg-muted px-5 py-2.5 active:opacity-80"
        >
          <Text className="text-foreground text-[13px] font-semibold">Volver</Text>
        </Pressable>
      </View>
      </Hoja>
    )
  }

  const enVivo = new Set(presentes)

  return (
    /* En web, `Hoja` hace de formSheet: la hoja se apila sobre la del Jam con
       su propio velo, un escalón más oscuro por nivel — como los de UIKit. */
    <Hoja>
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-6 px-5 pb-10 pt-6"
    >
      <View className="items-center gap-1">
        <Text className="text-foreground text-lg font-bold">Invitá a tus amigos</Text>
        <Text className="text-muted-foreground text-center text-[12px] leading-4">
          Cualquiera con el link, el código o el QR entra a la misma cola.
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Compartir el link"
        onPress={() => void invitarAlJam(jam.code)}
        className="flex-row items-center justify-center gap-2 self-center rounded-full bg-primary px-6 py-3 active:opacity-80"
      >
        <IconShare size={16} color={ICON_COLOR.onPrimary} />
        <Text className="text-primary-foreground text-[14px] font-semibold">
          {ES_WEB ? 'Copiar el link' : 'Compartir el link'}
        </Text>
      </Pressable>

      <View className="items-center gap-1">
        <Text className="text-muted-foreground text-[11px] font-semibold uppercase tracking-[1.2px]">
          O dictales el código
        </Text>
        <Text className="text-foreground text-[28px] font-extrabold tracking-[6px]">
          {jam.code}
        </Text>
      </View>

      <View className="items-center gap-2">
        {/* Blanco de verdad, no un token: el QR es un formato impreso, no una
            superficie del sistema. #121212 es el fondo de la app — los módulos
            del código hacen juego sin perder contraste de lectura. */}
        <View className="items-center rounded-2xl bg-white p-5">
          <QRCode value={linkDeJam(jam.code)} size={164} backgroundColor="#FFFFFF" color="#121212" />
        </View>
        <Text className="text-muted-foreground text-[11px]">
          Que lo escaneen con la cámara y ya están adentro.
        </Text>
      </View>

      <View className="gap-2">
        <Text className="text-muted-foreground text-[11px] font-semibold uppercase tracking-[1.2px]">
          En el Jam · {miembros.length}
        </Text>
        <View className="rounded-2xl bg-card">
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
                  className="h-9 w-9 items-center justify-center rounded-full active:bg-muted"
                >
                  <IconClose size={15} color={ICON_COLOR.muted} />
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
    </Hoja>
  )
}
