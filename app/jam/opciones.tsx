import { Pressable, ScrollView, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { volver } from '../../src/lib/volver'
import {
  cambiarMiSalida,
  ponerPermisosJam,
  useJam,
  useMiSalidaJam,
  useSoyHostJam,
} from '../../src/state/jam'
import { GrupoAjustes, FilaInterruptor } from '../../src/ui/Ajustes'
import { Hoja } from '../../src/ui/Hoja'

/**
 * Las perillas del Jam, en su propia hoja de la pila.
 *
 * Es la tercera hoja del drawer (ver `app/_layout.tsx`) y muestra una cara
 * según quién mira, porque las decisiones son distintas: el **host** regula
 * qué pueden hacer los invitados — las tres perillas de siempre —, y el
 * **invitado** decide lo único que es suyo: dónde suena su música.
 *
 * Cambiar una perilla no saca a nadie: al que perdió el permiso, el botón
 * simplemente le empieza a decir que no.
 */
export default function OpcionesJam() {
  const router = useRouter()
  const jam = useJam()
  const soyHost = useSoyHostJam()
  const salida = useMiSalidaJam()

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

  return (
    /* En web, `Hoja` hace de formSheet: tercera hoja de la pila, un velo más. */
    <Hoja>
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 px-5 pb-10 pt-6"
    >
      <Text className="text-foreground text-center text-lg font-bold">
        {soyHost ? 'Controles para invitados' : 'Opciones'}
      </Text>

      {soyHost ? (
        <>
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
          <Text className="text-muted-foreground px-4 text-[11px] leading-4">
            Quitar tiene su regla fija: cada uno puede sacar lo que agregó, y vos
            cualquiera. La que está sonando no la saca nadie.
          </Text>
        </>
      ) : (
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
      )}
    </ScrollView>
    </Hoja>
  )
}
