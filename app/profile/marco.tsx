import { useState, type ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { mensajeError } from '../../src/lib/mensajeError'
import { TECLADO_FISICO } from '../../src/lib/teclado'
import { volver } from '../../src/lib/volver'
import {
  decoracionPropia,
  decoracionUrl,
  esDecoracionPropia,
  PREFIJO_PROPIA,
  rutaDePropia,
  useDecoraciones,
  type Decoracion,
  type TipoDecoracion,
} from '../../src/services/decoraciones'
import { pickImage } from '../../src/lib/pickImage'
import { saveMyProfile } from '../../src/services/profile'
import { ilustracionUrl, uploadIlustracionConProgreso } from '../../src/services/showcases'
import { BarraDeProgreso, porciento } from '../../src/ui/Progreso'
import { avisar } from '../../src/state/aviso'
import { setMyProfile, useMyProfile, useUser } from '../../src/state/session'
import { usePiso } from '../../src/state/shell'
import { Avatar } from '../../src/ui/Avatar'
import { COLECCIONES, type Coleccion } from '../../src/ui/colecciones'
import { Atribucion } from '../../src/ui/DecoracionImagen'
import { EFECTOS, EfectoDibujado, esEfectoDibujado } from '../../src/ui/EfectosDibujados'
import { BotonConfirmar, BotonHoja, EncabezadoHoja } from '../../src/ui/EncabezadoHoja'
import { FadingRow } from '../../src/ui/FadingScroll'
import { Hoja, useHojaModal } from '../../src/ui/Hoja'
import { aireDelMarco, Marco, MARCOS } from '../../src/ui/Marco'
import { alfa } from '../../src/ui/marcoBase'
import { FondoPerfil } from '../../src/ui/PerfilPublico'
import { SearchField } from '../../src/ui/SearchField'
import { Segmentado } from '../../src/ui/Segmentado'
import { ICON_COLOR, IconCheck, IconPlus } from '../../src/ui/icons'

/** El hueco entre celdas. */
const HUECO = 10
/** Lo que mide, como mucho, una celda de la grilla de búsqueda. */
const CELDA_MAX = 118
/** La celda de un estante: fija, porque el estante se desplaza. */
const CELDA_ESTANTE = 104
/** La foto en la tarjeta de perfil de la vista previa. */
const FOTO = 76
/** La foto adentro de cada celda. */
const MUESTRA = 56
/** El ancho de la tarjeta de perfil y de los banners. */
const ANCHO_TARJETA = 560

/** Una opción de la tienda: un marco o efecto dibujado, o una decoración en imagen. */
type Opcion = {
  id: string
  nombre: string
  familia: string
  /** Presente cuando es una decoración del catálogo en imagen. */
  imagen?: Decoracion
}

/**
 * La tienda de decoraciones del perfil: marcos y efectos.
 *
 * Es la tienda de Discord con las reglas de acá. Arriba, **la tarjeta de tu
 * perfil** como vista previa —el fondo con el efecto, la foto con el marco,
 * tu nombre—, que es lo que Discord muestra a la derecha mientras elegís:
 * se ve la decoración puesta, no suelta. Debajo, Marcos / Efectos como un
 * segmentado, el buscador, y **las colecciones**, cada una con su banner
 * (nombre, lema y un par de piezas de muestra sobre el tinte de su paleta)
 * y su estante que se desplaza. Buscar muestra la grilla plana.
 *
 * La hoja es la de siempre (`EncabezadoHoja`): la cruz cierra, el tilde
 * aplica lo que haya cambiado —marco, efecto o los dos— y nada flota al pie.
 *
 * Las decoraciones en imagen del catálogo (`services/decoraciones`) entran en
 * las mismas colecciones y muestran su autor y su licencia debajo de la
 * tarjeta, que es lo que CC BY pide.
 *
 * La tienda se ve quieta: se anima la celda elegida y, con cursor, la que
 * tiene el cursor encima; la tarjeta de arriba siempre.
 */
export default function Tienda() {
  const router = useRouter()
  const perfil = useMyProfile()
  const piso = usePiso(24)
  const modal = useHojaModal()
  const { tipo: tipoCrudo } = useLocalSearchParams<{ tipo?: string }>()
  const [pestana, setPestana] = useState<TipoDecoracion>(tipoCrudo === 'efecto' ? 'efecto' : 'marco')
  const esEfecto = pestana === 'efecto'
  const decoraciones = useDecoraciones()

  const marcoActual = perfil?.marco ?? null
  const efectoActual = perfil?.efecto ?? null
  const [marcoSel, setMarcoSel] = useState<string | null>(marcoActual)
  const [efectoSel, setEfectoSel] = useState<string | null>(efectoActual)
  const seleccion = esEfecto ? efectoSel : marcoSel
  const elegir = (id: string | null) => (esEfecto ? setEfectoSel(id) : setMarcoSel(id))
  const cambiado = marcoSel !== marcoActual || efectoSel !== efectoActual

  const [busqueda, setBusqueda] = useState('')
  const [guardando, setGuardando] = useState(false)
  const nombre = perfil?.displayName?.trim() || perfil?.username || 'Vos'
  const user = useUser()
  /** Cuánto subió tu archivo, de 0 a 1; `null` mientras no se sube. */
  const [progreso, setProgreso] = useState<number | null>(null)

  /**
   * Subir la tuya: un archivo propio —PNG, WebP, GIF o APNG— que va a tu
   * carpeta y queda elegido con el prefijo `imagen:`. Es la misma puerta que
   * la foto de perfil; lo que subís es tuyo y se ve en tu perfil.
   */
  async function subirPropia() {
    if (!user || progreso !== null) return
    try {
      const elegida = await pickImage({ cuadrada: false })
      if (!elegida) return
      setProgreso(0)
      const ruta = await uploadIlustracionConProgreso(
        user.id,
        elegida.blob,
        elegida.fileName,
        elegida.mime,
        setProgreso,
      )
      elegir(`${PREFIJO_PROPIA}${ruta}`)
      avisar('Subida. Tocá el tilde para aplicarla.')
    } catch (e) {
      avisar(mensajeError(e), true)
    } finally {
      setProgreso(null)
    }
  }

  /* La vidriera de la pestaña: los dibujados primero, después los del catálogo. */
  const deImagen: Opcion[] = (decoraciones ?? [])
    .filter((d) => d.tipo === pestana)
    .map((d) => ({ id: d.id, nombre: d.nombre, familia: d.familia, imagen: d }))
  const dibujados: Opcion[] = esEfecto
    ? EFECTOS.map((e) => ({ id: e.id, nombre: e.nombre, familia: e.familia }))
    : MARCOS.map((m) => ({ id: m.id, nombre: m.nombre, familia: m.familia }))
  const opciones: Opcion[] = [...dibujados, ...deImagen]
  const porId = new Map(opciones.map((o) => [o.id, o]))
  const propia: Opcion | undefined = esDecoracionPropia(seleccion)
    ? { id: seleccion, nombre: 'Tu decoración', familia: 'propias', imagen: decoracionPropia(seleccion, pestana) }
    : undefined
  const elegido = propia ?? porId.get(seleccion ?? '')
  const coleccionDe = (id: string) =>
    COLECCIONES.find((c) => (esEfecto ? c.efectos : c.marcos).includes(id))

  /* Las colecciones con lo que tienen de esta pestaña, en su orden. */
  const estantes = COLECCIONES.map((c) => ({
    ...c,
    piezas: (esEfecto ? c.efectos : c.marcos).map((id) => porId.get(id)).filter((o): o is Opcion => !!o),
  })).filter((c) => c.piezas.length > 0)

  const texto = busqueda.trim().toLocaleLowerCase()
  const buscando = texto.length > 0
  const encontradas = opciones.filter((o) => o.nombre.toLocaleLowerCase().includes(texto))

  /* Cuántas celdas entran en la grilla: nunca menos de tres, y el sobrante repartido. */
  const [anchoGrilla, setAnchoGrilla] = useState(0)
  const columnas = Math.max(3, Math.floor((anchoGrilla + HUECO) / (CELDA_MAX + HUECO)))
  const celda = anchoGrilla > 0 ? (anchoGrilla - HUECO * (columnas - 1)) / columnas : CELDA_MAX

  const cerrar = () => volver(router, '/profile/editar')

  async function guardar() {
    if (guardando || !cambiado) return
    setGuardando(true)
    try {
      setMyProfile(await saveMyProfile({ marco: marcoSel ?? '', efecto: efectoSel ?? '' }))
      avisar('Decoraciones aplicadas')
      cerrar()
    } catch (e) {
      avisar(mensajeError(e), true)
      setGuardando(false)
    }
  }

  const foto = (marco: string | null, size: number, animado: boolean) => (
    <View style={{ width: size, height: size }}>
      <Avatar name={nombre} path={perfil?.avatarPath} size={size} encuadre={perfil?.avatarEncuadre} />
      <Marco marco={marco} size={size} animado={animado} />
    </View>
  )

  /** Lo que va adentro de una celda, según la pestaña. */
  const muestra = (o: Opcion | null, lado: number, animada: boolean): ReactNode => {
    if (!esEfecto) return foto(o?.id ?? null, MUESTRA, animada)
    if (!o) return <View className="h-14 w-14 rounded-full bg-muted" />
    if (esEfectoDibujado(o.id))
      return (
        <View style={{ width: lado, height: lado }}>
          <EfectoDibujado id={o.id} alto={lado} animado={animada} />
        </View>
      )
    if (o.imagen)
      return (
        <Image
          source={{
            uri: esDecoracionPropia(o.id) ? ilustracionUrl(rutaDePropia(o.id)) : decoracionUrl(o.imagen.archivo),
          }}
          style={{ width: lado, height: lado }}
          contentFit="cover"
          autoplay={animada}
          cachePolicy="memory-disk"
        />
      )
    return null
  }

  const celdaDe = (o: Opcion | null, lado: number) => (
    <Celda
      key={o?.id ?? 'ninguno'}
      lado={lado}
      nombre={o?.nombre ?? 'Ninguno'}
      seleccionada={seleccion === (o?.id ?? null)}
      onPress={() => elegir(o?.id ?? null)}
    >
      {(animada) => muestra(o, lado, animada)}
    </Celda>
  )

  return (
    <Hoja anchoMaximo={720}>
      <View className="flex-1 bg-background">
        <EncabezadoHoja
          titulo="Decoraciones"
          izquierda={<BotonHoja tipo="cerrar" onPress={cerrar} />}
          derecha={
            <BotonConfirmar
              label="Aplicar"
              activo={cambiado}
              ocupado={guardando}
              onPress={() => void guardar()}
            />
          }
        />
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: modal ? 24 : piso }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* La tarjeta de tu perfil, con lo elegido puesto. */}
          <View className="items-center px-4 pt-3">
            <TarjetaDePerfil
              bannerPath={perfil?.bannerPath ?? null}
              encuadre={perfil?.bannerEncuadre ?? null}
              efecto={efectoSel}
              foto={foto(marcoSel, FOTO, true)}
              nombre={nombre}
              usuario={perfil?.username ?? ''}
              bio={perfil?.bio ?? ''}
            />
            <View className="items-center gap-0.5 pt-3">
              <Text className="text-foreground text-[15px] font-semibold">
                {elegido?.nombre ?? (esEfecto ? 'Sin efecto' : 'Sin marco')}
              </Text>
              {elegido?.imagen && !esDecoracionPropia(elegido.id) ? (
                <Atribucion decoracion={elegido.imagen} />
              ) : (
                <Text className="text-muted-foreground text-[13px]">
                  {elegido
                    ? esDecoracionPropia(elegido.id)
                      ? 'Un archivo tuyo'
                      : (coleccionDe(elegido.id)?.nombre ?? 'Sin colección')
                    : 'Tocá una pieza para probarla'}
                </Text>
              )}
            </View>
          </View>

          {/* Marcos o efectos: dos vidrieras, una tarjeta. */}
          <View className="px-4 pt-4">
            <Segmentado
              label="Qué decorar"
              value={pestana}
              options={[
                { value: 'marco', label: 'Marcos' },
                { value: 'efecto', label: 'Efectos' },
              ]}
              onChange={setPestana}
            />
          </View>

          <View className="px-4 pt-3">
            <SearchField
              value={busqueda}
              onChangeText={setBusqueda}
              placeholder={esEfecto ? 'Buscar efectos' : 'Buscar marcos'}
            />
          </View>

          {buscando ? (
            /* La grilla plana con lo encontrado. El ancho se mide adentro del
               margen: las celdas se reparten lo que queda entre los 16px. */
            <View className="px-4 pt-4">
              <View
                className="flex-row flex-wrap"
                style={{ gap: HUECO }}
                onLayout={(e) => setAnchoGrilla(e.nativeEvent.layout.width)}
              >
                {encontradas.map((o) => celdaDe(o, celda))}
              </View>
              {!encontradas.length ? (
                <Text className="text-muted-foreground px-2 py-8 text-center text-[13px]">
                  {esEfecto ? 'No hay efectos con ese nombre.' : 'No hay marcos con ese nombre.'}
                </Text>
              ) : null}
            </View>
          ) : (
            /* Las colecciones: banner y estante, como la tienda de Discord. */
            <View className="gap-7 pt-5">
              {/* Ninguno, subir la tuya, y la tuya si hay una elegida. */}
              <View className="gap-3">
                <FadingRow gap={HUECO} padding={16}>
                  {celdaDe(null, CELDA_ESTANTE)}
                  <Celda
                    lado={CELDA_ESTANTE}
                    nombre="Subir la tuya"
                    seleccionada={false}
                    onPress={() => void subirPropia()}
                  >
                    {() =>
                      progreso !== null ? (
                        <View className="w-full px-3">
                          <BarraDeProgreso valor={progreso} rotulo={porciento(progreso)} />
                        </View>
                      ) : (
                        <View className="h-12 w-12 items-center justify-center rounded-full bg-muted">
                          <IconPlus size={20} color={ICON_COLOR.foreground} />
                        </View>
                      )
                    }
                  </Celda>
                  {propia ? celdaDe(propia, CELDA_ESTANTE) : null}
                </FadingRow>
                <Text className="px-4 text-muted-foreground text-[12px]">
                  {esEfecto
                    ? 'Un archivo tuyo cubre la banda de arriba del fondo. PNG, WebP, GIF o APNG.'
                    : 'Un archivo tuyo va centrado, 1,2 veces la foto, como las decoraciones de Discord. PNG, WebP, GIF o APNG con el centro transparente.'}
                </Text>
              </View>
              {estantes.map((c) => (
                <View key={c.id} className="gap-3">
                  <BannerDeColeccion
                    coleccion={c}
                    muestras={c.piezas.slice(0, 2).map((o) =>
                      esEfecto ? (
                        <View key={o.id} className="overflow-hidden rounded-xl" style={{ width: 56, height: 56 }}>
                          {muestra(o, 56, false)}
                        </View>
                      ) : (
                        <View key={o.id} style={{ width: 44, height: 44, margin: aireDelMarco(44) }}>
                          {foto(o.id, 44, false)}
                        </View>
                      ),
                    )}
                  />
                  <FadingRow gap={HUECO} padding={16}>
                    {c.piezas.map((o) => celdaDe(o, CELDA_ESTANTE))}
                  </FadingRow>
                </View>
              ))}
              {decoraciones === null && !estantes.length ? (
                <Text className="text-muted-foreground px-6 py-8 text-center text-[13px]">Cargando…</Text>
              ) : null}
            </View>
          )}
        </ScrollView>
      </View>
    </Hoja>
  )
}

/**
 * La tarjeta de perfil de la vista previa: el fondo con el efecto, la foto
 * con el marco asomando sobre el borde del fondo, el nombre y la línea. Es
 * la tarjeta que Discord muestra al lado de la tienda, y es la misma
 * anatomía del perfil de acá en chico.
 */
function TarjetaDePerfil({
  bannerPath,
  encuadre,
  efecto,
  foto,
  nombre,
  usuario,
  bio,
}: {
  bannerPath: string | null
  encuadre: Parameters<typeof FondoPerfil>[0]['encuadre']
  efecto: string | null
  foto: ReactNode
  nombre: string
  usuario: string
  bio: string
}) {
  return (
    <View className="w-full overflow-hidden rounded-[22px] bg-card" style={{ maxWidth: ANCHO_TARJETA }}>
      <View className="overflow-hidden" style={{ aspectRatio: 16 / 7 }}>
        <FondoPerfil bannerPath={bannerPath} encuadre={encuadre} efecto={efecto} />
      </View>
      {/* La foto pisa el borde del fondo, como en el perfil de Discord y en el
          de acá; el marco desborda y el aire lo reserva `aireDelMarco`. */}
      <View className="px-5 pb-5" style={{ marginTop: -(FOTO / 2) }}>
        <View style={{ width: FOTO, height: FOTO, marginBottom: aireDelMarco(FOTO) - 4 }}>{foto}</View>
        <Text className="text-foreground text-[17px] font-bold" numberOfLines={1}>
          {nombre}
        </Text>
        <Text className="text-muted-foreground text-[13px]" numberOfLines={1}>
          @{usuario}
        </Text>
        {bio ? (
          <Text className="pt-2 text-foreground text-[13px]" numberOfLines={2}>
            {bio}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

/**
 * El banner de una colección: el nombre y el lema sobre el tinte de su
 * paleta, con un par de piezas de muestra a la derecha. El tinte va muy
 * diluido sobre la placa —la interfaz sigue acromática— y lo que tiene color
 * de verdad son las piezas, que son contenido.
 */
function BannerDeColeccion({ coleccion, muestras }: { coleccion: Coleccion; muestras: ReactNode[] }) {
  const [a, b] = coleccion.tonos
  return (
    <View className="mx-4 overflow-hidden rounded-2xl bg-card" style={{ minHeight: 88 }}>
      <LinearGradient
        colors={[alfa(a, 0.28), alfa(b, 0.1), 'rgba(24,24,24,0)']}
        locations={[0, 0.55, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View className="flex-row items-center justify-between gap-3 px-4 py-4">
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-foreground text-[17px] font-bold" numberOfLines={1}>
            {coleccion.nombre}
          </Text>
          <Text className="text-muted-foreground text-[13px]" numberOfLines={2}>
            {coleccion.lema}
          </Text>
        </View>
        <View className="flex-row items-center">{muestras}</View>
      </View>
    </View>
  )
}

/**
 * Una celda de la vidriera: la muestra, quieta, y el nombre debajo.
 *
 * La elegida se distingue por luminancia —la placa más clara— y por el tilde
 * en la esquina, como una foto elegida en el selector de iOS; nunca por un
 * borde. Se anima cuando es la elegida o cuando tiene el cursor encima.
 */
function Celda({
  lado,
  nombre,
  seleccionada,
  onPress,
  children,
}: {
  lado: number
  nombre: string
  seleccionada: boolean
  onPress: () => void
  children: (animada: boolean) => ReactNode
}) {
  const [encima, setEncima] = useState(false)
  const animada = seleccionada || (TECLADO_FISICO && encima)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Marco ${nombre}`}
      accessibilityState={{ selected: seleccionada }}
      onPress={onPress}
      onPointerEnter={() => setEncima(true)}
      onPointerLeave={() => setEncima(false)}
      className="gap-1.5 active:opacity-80"
      style={{ width: lado }}
    >
      <View
        className={`items-center justify-center overflow-hidden rounded-2xl ${
          seleccionada ? 'bg-muted' : encima ? 'bg-muted/70' : 'bg-card'
        }`}
        style={{ width: lado, height: lado }}
      >
        {children(animada)}
        {seleccionada ? (
          <View className="absolute right-2 top-2 h-[22px] w-[22px] items-center justify-center rounded-full bg-primary">
            <IconCheck size={12} color={ICON_COLOR.onPrimary} strokeWidth={3} />
          </View>
        ) : null}
      </View>
      <Text
        className={`text-center text-[12px] ${seleccionada ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}
        numberOfLines={1}
      >
        {nombre}
      </Text>
    </Pressable>
  )
}
