import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { mensajeError } from '../../src/lib/mensajeError'
import {
  coloresDe,
  FAMILIAS,
  mismoTema,
  PALETA,
  sobreFondo,
  temaAMano,
  TEMAS,
  VIDRIO,
  type ColoresVitrina,
  type Patron,
  type Tema,
} from '../../src/lib/tema'
import { volver } from '../../src/lib/volver'
import { saveMyProfile } from '../../src/services/profile'
import { avisar } from '../../src/state/aviso'
import { setMyProfile, useMyProfile } from '../../src/state/session'
import { usePiso } from '../../src/state/shell'
import { actualizarBorrador, useBorrador } from '../../src/state/vitrinaBorrador'
import { ANCHO_HOJA, Hoja, useHojaModal } from '../../src/ui/Hoja'
import { Superficie } from '../../src/ui/Vitrina'
import { ICON_COLOR, IconBan, IconCheck, IconPalette } from '../../src/ui/icons'

/** Un color de muestra para los temas «de la tapa», que no tienen uno propio. */
const TAPA_DE_MUESTRA = '#6B7280'

/** Los acabados de «Personalizar»: qué se le pone encima al color elegido. */
const ACABADOS: { id: 'liso' | 'degradado' | Patron; nombre: string }[] = [
  { id: 'liso', nombre: 'Liso' },
  { id: 'degradado', nombre: 'Degradado' },
  { id: 'rayas', nombre: 'Rayas' },
  { id: 'puntos', nombre: 'Puntos' },
]

/**
 * Elegir un tema: el de una vitrina, o el del perfil entero.
 *
 * Es la hoja «El tema de tu perfil» de Airbuds, con el catálogo propio de
 * `lib/tema`: una fila por familia —básicos, lisos, degradados, con textura—
 * y no una sola fila de treinta. Con muestras de 88px entran cuatro por
 * pantalla, y una fila larga obliga a recorrer sin ver el conjunto; tres o
 * cuatro filas cortas caben en una hoja a medida y se ven de un vistazo.
 *
 * Cada muestra es **la misma `Superficie`** que dibuja la tarjeta en el
 * perfil, con un disco y dos renglones encima: lo que se ve es exactamente lo
 * que queda, degradado y textura incluidos. Tocar una la elige y —cuando se
 * está vistiendo una vitrina— la vista previa del editor cambia al toque,
 * porque la hoja no tapa la pantalla de atrás. Cancelar deja el tema que había.
 *
 * `para` dice de quién es el tema: `vitrina` escribe en el borrador y
 * `perfil` guarda en la cuenta, que es lo que heredan todas las vitrinas que
 * no eligieron el suyo.
 */
export default function ElegirTema() {
  const router = useRouter()
  const piso = usePiso(24)
  const modal = useHojaModal()
  const { para } = useLocalSearchParams<{ para?: string }>()
  const delPerfil = para === 'perfil'

  const perfil = useMyProfile()
  const borrador = useBorrador()

  /* El tema con el que se entró, para poder cancelar. */
  const [inicial] = useState<Tema | null>(delPerfil ? (perfil?.tema ?? null) : (borrador?.estilo.tema ?? null))
  const [elegido, setElegido] = useState<Tema | null>(inicial)
  const [guardando, setGuardando] = useState(false)
  /* «Personalizar», abierto o no. Arranca abierto si el tema que había era
     uno a mano: es lo que hay que mostrar para poder cambiarlo. */
  const aMano = inicial?.id === 'color' || inicial?.id === 'degradado'
  const [paleta, setPaleta] = useState(aMano)
  const [acabado, setAcabado] = useState<'liso' | 'degradado' | Patron>(
    inicial?.id === 'degradado' ? 'degradado' : (inicial?.patron ?? 'liso'),
  )
  /* El color base del tema a mano, para que cambiar de acabado lo conserve. */
  const [colorAMano, setColorAMano] = useState<string | null>(
    inicial?.id === 'color' ? (inicial.color ?? null) : (inicial?.paradas?.[0] ?? null),
  )

  function elegir(tema: Tema | null) {
    setElegido(tema)
    /* Al toque en el borrador: la vista previa del editor está detrás. */
    if (!delPerfil) actualizarBorrador((b) => ({ estilo: { ...b.estilo, tema } }))
  }

  function elegirAMano(hex: string, con = acabado) {
    setColorAMano(hex)
    elegir(temaAMano(hex, con))
  }

  function cancelar() {
    if (!delPerfil) actualizarBorrador((b) => ({ estilo: { ...b.estilo, tema: inicial } }))
    volver(router, '/profile')
  }

  async function guardar() {
    if (guardando) return
    if (!delPerfil) {
      volver(router, '/profile/vitrina')
      return
    }
    setGuardando(true)
    try {
      setMyProfile(await saveMyProfile({ tema: elegido }))
      avisar(elegido ? 'Tema puesto' : 'Sin tema')
      volver(router, '/profile')
    } catch (e) {
      avisar(mensajeError(e), true)
      setGuardando(false)
    }
  }

  const cambiado = !mismoTema(elegido, inicial)
  const personalizado = elegido?.id === 'color' || elegido?.id === 'degradado'

  return (
    <Hoja medida="contenido">
      <ScrollView
        className="bg-background"
        style={{ flexGrow: 1 }}
        contentContainerClassName="gap-5 pt-6"
        contentContainerStyle={{
          paddingBottom: modal ? 24 : piso,
          maxWidth: ANCHO_HOJA,
          width: '100%',
          alignSelf: 'center',
        }}
      >
        <View className="items-center gap-1 px-6">
          <Text className="text-foreground text-[17px] font-bold">
            {delPerfil ? 'El tema de tu perfil' : 'El tema de esta pieza'}
          </Text>
          <Text className="text-muted-foreground text-center text-[12px] leading-4">
            {delPerfil
              ? 'Lo heredan todas las piezas que no eligieron el suyo.'
              : 'Sin tema, hereda el del perfil.'}
          </Text>
        </View>

        {FAMILIAS.map((fila, i) => (
          <View key={fila.titulo} className="gap-2">
            <Text className="px-6 text-muted-foreground text-[11px] font-semibold uppercase tracking-[1.2px]">
              {fila.titulo}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3 px-6">
              {/* «Ninguno» abre la primera fila y «Personalizar» la cierra:
                  son las dos salidas del catálogo, una para cada lado. */}
              {i === 0 ? (
                <Muestra
                  nombre="Ninguno"
                  colores={null}
                  elegida={elegido === null}
                  onPress={() => {
                    setPaleta(false)
                    elegir(null)
                  }}
                />
              ) : null}
              {TEMAS.filter((t) => fila.familias.includes(t.familia)).map((t) => (
                <Muestra
                  key={t.id}
                  nombre={t.nombre}
                  colores={coloresDe({ id: t.id }, TAPA_DE_MUESTRA)}
                  elegida={elegido?.id === t.id}
                  onPress={() => {
                    setPaleta(false)
                    elegir({ id: t.id })
                  }}
                />
              ))}
              {i === 0 ? (
                <Muestra
                  nombre="Personalizar"
                  colores={personalizado ? coloresDe(elegido) : null}
                  personalizar
                  elegida={personalizado}
                  onPress={() => setPaleta(true)}
                />
              ) : null}
            </ScrollView>
          </View>
        ))}

        {paleta ? (
          <View className="gap-3 px-6">
            <Text className="text-muted-foreground text-[11px] font-semibold uppercase tracking-[1.2px]">
              Un color a mano
            </Text>
            {/* Dos filas de doce: la de arriba siempre con texto negro, la de
                abajo siempre con blanco. Ver `PALETA`. */}
            <View className="flex-row flex-wrap gap-2">
              {PALETA.map((hex) => {
                const marcado = personalizado && colorAMano === hex
                return (
                  <Pressable
                    key={hex}
                    accessibilityRole="button"
                    accessibilityLabel={`Color ${hex}`}
                    accessibilityState={{ selected: marcado }}
                    onPress={() => elegirAMano(hex)}
                    className="items-center justify-center rounded-full active:opacity-80"
                    style={{
                      width: 40,
                      height: 40,
                      backgroundColor: hex,
                      transform: [{ scale: marcado ? 1.12 : 1 }],
                    }}
                  >
                    {marcado ? <IconCheck size={16} color={sobreFondo(hex).texto} /> : null}
                  </Pressable>
                )
              })}
            </View>
            {/* El acabado: qué va encima del color. «Degradado» lo empareja
                con su vecino de fila; las texturas se dibujan en el color del
                texto, así que sirven sobre cualquiera. */}
            <View className="flex-row flex-wrap gap-2">
              {ACABADOS.map((a) => {
                const activo = acabado === a.id
                return (
                  <Pressable
                    key={a.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: activo }}
                    onPress={() => {
                      setAcabado(a.id)
                      if (colorAMano) elegirAMano(colorAMano, a.id)
                    }}
                    className={`h-9 items-center justify-center rounded-full px-4 ${
                      activo ? 'bg-primary' : 'bg-muted active:opacity-80'
                    }`}
                  >
                    <Text
                      className={`text-[12px] font-semibold ${
                        activo ? 'text-primary-foreground' : 'text-muted-foreground'
                      }`}
                    >
                      {a.nombre}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </View>
        ) : null}

        <View className="flex-row items-center justify-between gap-3 px-6">
          <Pressable
            accessibilityRole="button"
            onPress={cancelar}
            className="h-11 items-center justify-center rounded-full bg-muted px-5 active:opacity-80"
          >
            <Text className="text-foreground text-[14px] font-semibold">Cancelar</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={guardando || (delPerfil && !cambiado)}
            onPress={() => void guardar()}
            className={`h-11 min-w-[120px] items-center justify-center rounded-full px-6 ${
              delPerfil && !cambiado ? 'bg-muted' : 'bg-primary active:opacity-80'
            }`}
          >
            {guardando ? (
              <ActivityIndicator color="#121212" />
            ) : (
              <Text
                className={`text-[14px] font-bold ${
                  delPerfil && !cambiado ? 'text-muted-foreground' : 'text-primary-foreground'
                }`}
              >
                {delPerfil ? 'Guardar' : 'Listo'}
              </Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </Hoja>
  )
}

/**
 * Una tarjetita de tema: la `Superficie` de verdad, con un disco y dos
 * renglones del color del texto. Sin nombre adentro —abajo, chiquito— porque
 * lo que se compara es el color contra el texto, no una palabra.
 */
function Muestra({
  nombre,
  colores,
  personalizar = false,
  elegida,
  onPress,
}: {
  nombre: string
  /** `null` es el vidrio: el gris de las tarjetas. */
  colores: ColoresVitrina | null
  personalizar?: boolean
  elegida: boolean
  onPress: () => void
}) {
  const c = colores ?? VIDRIO
  const vacia = !colores

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Tema ${nombre}`}
      accessibilityState={{ selected: elegida }}
      onPress={onPress}
      className="items-center gap-2 active:opacity-80"
    >
      <View
        style={{
          /* La elegida crece apenas y se levanta con sombra: separar por
             presencia, no por un borde. */
          transform: [{ scale: elegida ? 1.06 : 1 }],
          boxShadow: elegida ? '0 8px 20px rgba(0,0,0,0.5)' : undefined,
          borderRadius: 18,
        }}
      >
        <Superficie
          colores={vacia ? { ...VIDRIO, fondo: 'rgb(31,31,31)' } : c}
          fondo={null}
          radius={18}
          style={{ width: 88, height: 88 }}
        >
          <View style={{ flex: 1, padding: 12, justifyContent: 'space-between' }}>
            {vacia ? (
              <View className="flex-1 items-center justify-center">
                {personalizar ? (
                  <IconPalette size={22} color={ICON_COLOR.foreground} />
                ) : (
                  <IconBan size={22} color={ICON_COLOR.muted} />
                )}
              </View>
            ) : (
              <>
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: c.texto }} />
                <View className="gap-1.5">
                  <View style={{ height: 5, width: 44, borderRadius: 3, backgroundColor: c.texto }} />
                  <View style={{ height: 5, width: 30, borderRadius: 3, backgroundColor: c.secundario }} />
                </View>
              </>
            )}
          </View>
        </Superficie>
      </View>
      <View className="h-4 flex-row items-center gap-1">
        {elegida ? <IconCheck size={11} color={ICON_COLOR.foreground} /> : null}
        <Text
          className={`text-[11px] font-semibold ${elegida ? 'text-foreground' : 'text-muted-foreground'}`}
        >
          {nombre}
        </Text>
      </View>
    </Pressable>
  )
}
