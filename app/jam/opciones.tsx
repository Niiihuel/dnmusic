import { ScrollView, Text, View } from 'react-native'
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
import { AccionSocial, CabeceraSocial } from '../../src/ui/Social'
import { Hoja, usePisoHoja } from '../../src/ui/Hoja'

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
  const piso = usePisoHoja(24)
  const jam = useJam()
  const soyHost = useSoyHostJam()
  const salida = useMiSalidaJam()

  if (!jam) {
    return (
      <Hoja medida="contenido" titulo="Opciones del Jam">
        <CabeceraSocial titulo="Opciones del Jam" onCerrar={() => volver(router, '/')} />
        <View className="gap-5 bg-background px-5 pt-3" style={{ paddingBottom: piso }}>
          <Text className="text-muted-foreground text-subheadline">El Jam terminó.</Text>
          <AccionSocial label="Volver" secundaria onPress={() => volver(router, '/')} />
        </View>
      </Hoja>
    )
  }

  return (
    /* En web, `Hoja` hace de formSheet: tercera hoja de la pila, un velo más. */
    <Hoja medida="contenido" titulo="Opciones del Jam">
    <View className="bg-background">
    <CabeceraSocial titulo="Opciones del Jam" onCerrar={() => volver(router, '/jam')} />
    <ScrollView style={{ flexGrow: 0 }} contentContainerClassName="gap-4 px-5 pt-2" contentContainerStyle={{ paddingBottom: piso }}>

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
          <Text className="text-muted-foreground px-4 text-footnote leading-5">
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
    </View>
    </Hoja>
  )
}
