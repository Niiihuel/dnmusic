import { BarraHerramientasMosaico } from '../../src/ui/BarraHerramientasMosaico'
import { buscarVitrinaEdicion, esVitrinaTemporal } from '../../src/state/mosaicoEdicion'
import { useMosaicoPerfil } from '../../src/ui/useMosaicoPerfil'
import { FuentePerfil, TextoPerfil as Text } from '../../src/ui/FuentePerfil'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { Tema } from '../../src/lib/tema'
import { volver } from '../../src/lib/volver'
import { fetchProfile } from '../../src/services/profile'
import { fetchShowcase, type Showcase } from '../../src/services/showcases'
import { iniciarPerfilEdicion, usePerfilBorrador } from '../../src/state/perfilEdicion'
import { useChromeH, usePiso } from '../../src/state/shell'
import { editarBorrador } from '../../src/state/vitrinaBorrador'
import { Panel } from '../../src/ui/Panel'
import { Vitrinas } from '../../src/ui/PerfilPublico'
import { Vacio } from '../../src/ui/Vacio'
import { BotonVolver } from '../../src/ui/BotonVolver'
import { ICON_COLOR, IconGrilla, IconPencil } from '../../src/ui/icons'

const MAX_W = 520
/** Alto de la barra de armado, más su respiro sobre lo que flota debajo. */
const ALTO_BARRA = 64

/**
 * El mosaico de adentro de un sub-space, a pantalla completa.
 *
 * Es la pieza paga del Space de Airbuds: una tarjeta del perfil que al tocarla
 * abre otro mosaico, con las mismas piezas, los mismos temas y el mismo modo
 * de edición que el principal. Acá no hay identidad ni pestañas —eso es del
 * perfil, y esto es un capítulo suyo—: una cabecera con el título y debajo el
 * mismo `Vitrinas` del perfil, con `parentId` puesto.
 *
 * Es una pantalla apilada y no una hoja porque adentro hay que poder armar:
 * arrastrar piezas, abrir el editor, volver. Una hoja que se baja con el dedo
 * se pelearía con el arrastre.
 *
 * Llega por `?owner=<uuid>&id=<pieza>`, y si el perfil es ajeno también con
 * `usuario`: el tema del perfil —que las piezas sin tema heredan— solo se lee
 * por nombre de usuario (`get_profile`), y sin él las piezas se dibujarían
 * en vidrio en vez del color que su dueño eligió. Para el propio alcanza con
 * la sesión.
 *
 * Con el dueño en la sesión, mantener apretada una pieza entra a armar, como
 * en el perfil; y como un sub-space nuevo no tiene qué apretar, el lápiz de
 * la cabecera hace lo mismo. La barra es la del perfil sin el botón del tema:
 * el tema es del perfil entero, y se elige desde ahí.
 */
export default function SubspaceScreen() {
  const { owner, id, usuario, armar } = useLocalSearchParams<{
    owner?: string
    id?: string
    usuario?: string
    armar?: string
  }>()
  const router = useRouter()
  const chrome = useChromeH()
  /* Recién creado se entra armando (`?armar=1`): la pieza está vacía y lo
     único que hay para hacer es llenarla. */
  const [armando, setArmando] = useState(armar === '1')
  const yo = usePerfilBorrador()
  const propio = !!owner && !!yo && yo.userId === owner
  useEffect(() => { if (armando && propio && yo) iniciarPerfilEdicion(yo) }, [armando, propio, yo])
  const entrarEdicion = () => {
    if (!propio || !yo) return
    iniciarPerfilEdicion(yo)
    setArmando(true)
  }
  /* Mientras se arrastra una pieza el scroll se congela: un ScrollView vivo
     abajo del dedo se pelea con el gesto. */
  const [arrastrando, setArrastrando] = useState(false)
  const pisoBase = usePiso(24)

  /* Cambia al volver del editor, para releer lo que se haya tocado. */
  const [recarga, setRecarga] = useState(0)
  const mosaico = useMosaicoPerfil(propio && id ? owner! : null, id ?? null, recarga, () => setRecarga(n => n + 1))
  const piso = pisoBase + (armando ? ALTO_BARRA : 0)


  /*
   * La pieza en sí, para el título. `undefined` es «todavía no sé» y `null`
   * «no hay» —borrada, privada, o no es un sub-space—, la misma distinción que
   * en el perfil ajeno: sin ella el cartel de vacío parpadearía al abrir.
   */
  const [cargada, setCargada] = useState<Showcase | null | undefined>(undefined)
  useEffect(() => {
    if (!id) return
    let vivo = true
    if (propio && owner && esVitrinaTemporal(id)) return
    fetchShowcase(id)
      .then((p) => vivo && setCargada(p?.kind === 'subspace' ? p : null))
      .catch(() => vivo && setCargada(null))
    return () => {
      vivo = false
    }
  }, [id, recarga, propio, owner])
  /* Sin id en la ruta no hay nada que pedir: es «no hay» de entrada. */
  const pieza = id ? (propio && owner && mosaico.enEdicionGlobal ? buscarVitrinaEdicion(owner, id) ?? cargada : cargada) : null

  /* El tema del dueño, si es otro. El propio sale de la sesión. */
  const [fuenteAjena, setFuenteAjena] = useState<string | null>(null)
  const [temaAjeno, setTemaAjeno] = useState<Tema | null>(null)
  useEffect(() => {
    if (propio || !usuario) return
    let vivo = true
    fetchProfile(usuario)
      .then((p) => {
        if (vivo) {
          setTemaAjeno(p?.tema ?? null)
          setFuenteAjena(p?.fuente ?? null)
        }
      })
      .catch(() => undefined)
    return () => {
      vivo = false
    }
  }, [propio, usuario])
  const temaGlobal = propio ? (yo?.tema ?? null) : temaAjeno

  /* Al volver a esta pantalla se relee, como el perfil: el editor de una pieza
     es otra ruta. El primer foco es el montaje y ya cargó. */
  const primerFoco = useRef(true)
  useFocusEffect(
    useCallback(() => {
      if (primerFoco.current) {
        primerFoco.current = false
        return
      }
      setRecarga((n) => n + 1)
    }, []),
  )

  /** El lápiz de una pieza: se copia al borrador y se abre su editor. */
  function abrirEditor(v: Showcase) {
    editarBorrador(v, id ?? null)
    router.push('/profile/vitrina')
  }

  const titulo = pieza?.kind === 'subspace' ? pieza.titulo : 'Sub-space'

  /* El hueco dice qué hacer, según quién mira y qué está haciendo. */
  const vacio = (
    <View className="items-center gap-2 rounded-2xl bg-card px-6 py-12">
      <Text className="text-foreground text-[15px] font-semibold">Este sub-space está vacío</Text>
      <Text className="text-muted-foreground text-center text-[13px] leading-5">
        {!propio
          ? 'Todavía no hay nada acá adentro.'
          : armando
            ? 'Tocá el «+» de abajo para agregar la primera pieza.'
            : 'Tocá el lápiz de arriba para empezar a armarlo.'}
      </Text>
    </View>
  )

  /*
   * Herramientas compactas, agregar y volver al editor central.
   * Todo lo armado sigue en el borrador hasta confirmar allí.
   */
  const barraDeArmado = (
    <BarraHerramientasMosaico ocupado={mosaico.guardando || arrastrando}
      onTema={() => router.push({ pathname: '/profile/tema', params: { para: 'perfil' } })}
      onFuente={() => router.push('/profile/fuente')}
      onAgregar={() => { if (id) router.push({ pathname: '/profile/agregar', params: { parent: id } }) }}
      onEditor={() => { setArmando(false); router.dismissTo('/profile/editar') }} />
  )

  return (
    <FuentePerfil fuente={propio ? yo?.fuente : fuenteAjena}>
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <View className="flex-1">
          <View className="flex-row items-center gap-3 px-3 py-1">
            <BotonVolver onPress={() => volver(router, '/profile')} />
            <Text
              className="min-w-0 flex-1 text-foreground text-[15px] font-semibold"
              numberOfLines={1}
            >
              {titulo}
            </Text>
            {/* Armando, el chip dice en qué modo está la pantalla; mirando, el
              lápiz entra a armar — la otra puerta además del apretón. */}
            {propio && pieza ? (
              armando ? (
                <View className="h-9 justify-center rounded-full bg-muted px-4">
                  <Text className="text-foreground text-[11px] font-bold uppercase tracking-[1.4px]">
                    Modo de edición
                  </Text>
                </View>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Armar el sub-space"
                  onPress={entrarEdicion}
                  className="h-11 w-11 items-center justify-center rounded-full active:bg-muted"
                >
                  <IconPencil size={17} color={ICON_COLOR.foreground} />
                </Pressable>
              )
            ) : null}
          </View>

          <Panel className="flex-1">
            <ScrollView
              contentContainerClassName="items-center px-4 pt-4"
              contentContainerStyle={{ paddingBottom: piso }}
              scrollEnabled={!arrastrando}
            >
              {pieza === undefined ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : pieza === null || !owner || !id ? (
                /* Un solo cartel para «no existe» y «no se puede ver»: la base
                 no distingue, y está bien que no. */
                <Vacio
                  icono={<IconGrilla size={24} color={ICON_COLOR.muted} />}
                  titulo="No hay nada para ver"
                  detalle="Puede que esta pieza ya no exista o que el perfil esté en privado."
                  accion={{ rotulo: 'Volver', onPress: () => volver(router, '/profile') }}
                />
              ) : (
                <View className="w-full" style={{ maxWidth: MAX_W }}>
                  <Vitrinas
                    ownerId={owner}
                    borrador={propio ? mosaico : undefined}
                    parentId={id}
                    recarga={recarga}
                    onCambio={() => setRecarga((n) => n + 1)}
                    editando={armando}
                    temaGlobal={temaGlobal}
                    onEditar={propio ? abrirEditor : undefined}
                    onEntrarEdicion={propio ? entrarEdicion : undefined}
                    onArrastre={setArrastrando}
                    reaccionable={!propio}
                    vacio={vacio}
                  />
                </View>
              )}
            </ScrollView>

            {/* La barra flota al pie, apoyada sobre lo que ya flota debajo. */}
            {armando && propio ? (
              <View
                pointerEvents="box-none"
                className="absolute inset-x-0 items-center"
                style={{ bottom: chrome + 12 }}
              >
                {barraDeArmado}
              </View>
            ) : null}
          </Panel>
        </View>
      </SafeAreaView>
    </FuentePerfil>
  )
}
