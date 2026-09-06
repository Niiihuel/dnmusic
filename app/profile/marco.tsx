import { useState, type ReactNode } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { mensajeError } from '../../src/lib/mensajeError'
import { TECLADO_FISICO } from '../../src/lib/teclado'
import { volver } from '../../src/lib/volver'
import {
  decoracionUrl,
  useDecoraciones,
  type Decoracion,
  type TipoDecoracion,
} from '../../src/services/decoraciones'
import { saveMyProfile } from '../../src/services/profile'
import { avisar } from '../../src/state/aviso'
import { setMyProfile, useMyProfile } from '../../src/state/session'
import { usePiso } from '../../src/state/shell'
import { Avatar } from '../../src/ui/Avatar'
import { COLECCIONES } from '../../src/ui/colecciones'
import { Atribucion } from '../../src/ui/DecoracionImagen'
import { EFECTOS, EfectoDibujado, esEfectoDibujado } from '../../src/ui/EfectosDibujados'
import { BotonConfirmar, BotonHoja, EncabezadoHoja } from '../../src/ui/EncabezadoHoja'
import { FadingRow } from '../../src/ui/FadingScroll'
import { Hoja, useHojaModal } from '../../src/ui/Hoja'
import { aireDelMarco, FAMILIAS_MARCO, Marco, MARCOS } from '../../src/ui/Marco'
import { FondoPerfil } from '../../src/ui/PerfilPublico'
import { SearchField } from '../../src/ui/SearchField'
import { ICON_COLOR, IconCheck } from '../../src/ui/icons'

/** El hueco entre celdas de la grilla. */
const HUECO = 10
/** Lo que mide, como mucho, una celda: de ahí sale cuántas entran por fila. */
const CELDA_MAX = 118
/** La celda de un estante de colección: fija, porque el estante se desplaza. */
const CELDA_ESTANTE = 104
/** La foto de la vista previa, arriba. */
const PREVIA = 128
/** La foto adentro de cada celda. */
const MUESTRA = 56

/** Una opción de la vidriera: un marco o efecto dibujado, o una decoración en imagen. */
type Opcion = {
  id: string
  nombre: string
  familia: string
  /** Presente cuando es una decoración del catálogo en imagen. */
  imagen?: Decoracion
}

/**
 * Elegir el marco de la foto, o el efecto del perfil (`?tipo=efecto`).
 *
 * Es la hoja de siempre (`EncabezadoHoja`): la cruz cierra, el tilde aplica,
 * y nada flota al pie tapando la grilla. Arriba la vista previa —tu foto con
 * el marco elegido, o tu fondo con el efecto—, después los filtros y el
 * buscador, y abajo la vidriera.
 *
 * **La vidriera se recorre por colecciones**, como la tienda de Discord: cada
 * colección (`ui/colecciones`) es un estante con su nombre, su lema y sus
 * piezas en una fila que se desplaza — Arcade, Gótico, Después de
 * medianoche… Una colección se reconoce de lejos porque sus piezas
 * comparten paleta y manera de moverse. «Todos» y las familias muestran la
 * grilla plana, con «Ninguno» como primera celda, que es el selector de
 * fondos de iOS.
 *
 * Las decoraciones en imagen del catálogo (`services/decoraciones`) entran
 * en las mismas colecciones y muestran su autor y su licencia debajo de la
 * vista previa, que es lo que CC BY pide.
 *
 * La vidriera se ve quieta: se anima la celda elegida y, con cursor, la que
 * tiene el cursor encima. Animar cincuenta a la vez tartamudeaba.
 */
export default function ElegirMarco() {
  const router = useRouter()
  const perfil = useMyProfile()
  const piso = usePiso(24)
  const modal = useHojaModal()
  const { tipo: tipoCrudo } = useLocalSearchParams<{ tipo?: string }>()
  const tipo: TipoDecoracion = tipoCrudo === 'efecto' ? 'efecto' : 'marco'
  const esEfecto = tipo === 'efecto'
  const decoraciones = useDecoraciones()

  const actual = (esEfecto ? perfil?.efecto : perfil?.marco) ?? null
  const [seleccion, setSeleccion] = useState<string | null>(actual)
  const [familia, setFamilia] = useState('colecciones')
  const [busqueda, setBusqueda] = useState('')
  const [guardando, setGuardando] = useState(false)
  const nombre = perfil?.displayName?.trim() || perfil?.username || 'Vos'
  const cambiado = seleccion !== actual

  /* La vidriera entera: los dibujados primero, después los del catálogo. */
  const deImagen: Opcion[] = (decoraciones ?? [])
    .filter((d) => d.tipo === tipo)
    .map((d) => ({ id: d.id, nombre: d.nombre, familia: d.familia, imagen: d }))
  const dibujados: Opcion[] = esEfecto
    ? EFECTOS.map((e) => ({ id: e.id, nombre: e.nombre, familia: e.familia }))
    : MARCOS.map((m) => ({ id: m.id, nombre: m.nombre, familia: m.familia }))
  const opciones: Opcion[] = [...dibujados, ...deImagen]
  const porId = new Map(opciones.map((o) => [o.id, o]))
  const elegido = porId.get(seleccion ?? '')

  /* Las familias: las de siempre, más las que traiga el catálogo. */
  const familias: { id: string; titulo: string }[] = [...FAMILIAS_MARCO]
  for (const o of deImagen) {
    if (!familias.some((f) => f.id === o.familia)) familias.push({ id: o.familia, titulo: rotulo(o.familia) })
  }
  const familiaDe = (id: string) => familias.find((f) => f.id === id)?.titulo ?? rotulo(id)

  /* Las colecciones con lo que tienen de este tipo, en su orden. */
  const estantes = COLECCIONES.map((c) => ({
    ...c,
    piezas: (esEfecto ? c.efectos : c.marcos).map((id) => porId.get(id)).filter((o): o is Opcion => !!o),
  })).filter((c) => c.piezas.length > 0)

  const texto = busqueda.trim().toLocaleLowerCase()
  const buscando = texto.length > 0
  const enGrilla = buscando || familia !== 'colecciones'
  const tarjetas = opciones.filter(
    (o) =>
      (familia === 'todos' || familia === 'colecciones' || o.familia === familia) &&
      o.nombre.toLocaleLowerCase().includes(texto),
  )

  /* Cuántas celdas entran en la grilla: nunca menos de tres, y el sobrante repartido. */
  const [anchoGrilla, setAnchoGrilla] = useState(0)
  const columnas = Math.max(3, Math.floor((anchoGrilla + HUECO) / (CELDA_MAX + HUECO)))
  const celda = anchoGrilla > 0 ? (anchoGrilla - HUECO * (columnas - 1)) / columnas : CELDA_MAX

  const cerrar = () => volver(router, '/profile/editar')

  async function guardar() {
    if (guardando || !cambiado) return
    setGuardando(true)
    try {
      setMyProfile(
        await saveMyProfile(esEfecto ? { efecto: seleccion ?? '' } : { marco: seleccion ?? '' }),
      )
      avisar(
        esEfecto
          ? seleccion
            ? 'Efecto aplicado'
            : 'Efecto quitado'
          : seleccion
            ? 'Marco aplicado'
            : 'Marco quitado',
      )
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

  /** Lo que va adentro de una celda, según qué se elige. */
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
          source={{ uri: decoracionUrl(o.imagen.archivo) }}
          style={{ width: lado, height: lado }}
          contentFit="cover"
          autoplay={animada}
          cachePolicy="memory-disk"
        />
      )
    return null
  }

  /* La vista previa del efecto: tu fondo como se ve en el perfil, con el
     efecto encima; en una banda apaisada, que es donde el efecto vive. */
  const previaDeEfecto = (efecto: string | null) => (
    <View className="w-full overflow-hidden rounded-2xl bg-muted" style={{ maxWidth: 520, aspectRatio: 16 / 9 }}>
      <FondoPerfil bannerPath={perfil?.bannerPath ?? null} encuadre={perfil?.bannerEncuadre ?? null} efecto={efecto} />
    </View>
  )

  const celdaDe = (o: Opcion | null, lado: number) => (
    <Celda
      key={o?.id ?? 'ninguno'}
      lado={lado}
      nombre={o?.nombre ?? 'Ninguno'}
      seleccionada={seleccion === (o?.id ?? null)}
      onPress={() => setSeleccion(o?.id ?? null)}
    >
      {(animada) => muestra(o, lado, animada)}
    </Celda>
  )

  return (
    <Hoja anchoMaximo={720}>
      <View className="flex-1 bg-background">
        <EncabezadoHoja
          titulo={esEfecto ? 'Efecto' : 'Marco'}
          izquierda={<BotonHoja tipo="cerrar" onPress={cerrar} />}
          derecha={
            <BotonConfirmar
              label={seleccion ? 'Aplicar' : 'Quitar'}
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
          {/* La vista previa, con el aire que un marco necesita para
              desbordar (las alas salen más allá). */}
          <View
            className="items-center gap-3 px-6"
            style={{ paddingVertical: esEfecto ? 16 : aireDelMarco(PREVIA) + 12 }}
          >
            {esEfecto ? previaDeEfecto(seleccion) : foto(seleccion, PREVIA, true)}
            <View className="items-center gap-0.5" style={{ marginTop: esEfecto ? 0 : aireDelMarco(PREVIA) - 6 }}>
              <Text className="text-foreground text-[17px] font-semibold">
                {elegido?.nombre ?? (esEfecto ? 'Sin efecto' : 'Sin marco')}
              </Text>
              {elegido?.imagen ? (
                <Atribucion decoracion={elegido.imagen} />
              ) : (
                <Text className="text-muted-foreground text-[13px]">
                  {elegido
                    ? (COLECCIONES.find((c) => (esEfecto ? c.efectos : c.marcos).includes(elegido.id))?.nombre ??
                      familiaDe(elegido.familia))
                    : esEfecto
                      ? 'Tu fondo, tal cual'
                      : 'Tu foto, tal cual'}
                </Text>
              )}
            </View>
          </View>

          {/* Los filtros: píldoras que se desplazan, como las de Música. Solo
              las familias que tienen algo que mostrar en esta vidriera. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
          >
            {[{ id: 'colecciones', titulo: 'Colecciones' }, { id: 'todos', titulo: 'Todos' }, ...familias]
              .filter((f) => f.id === 'colecciones' || f.id === 'todos' || opciones.some((o) => o.familia === f.id))
              .map((f) => {
                const activa = familia === f.id
                return (
                  <Pressable
                    key={f.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: activa }}
                    onPress={() => setFamilia(f.id)}
                    className={`h-9 items-center justify-center rounded-full px-4 ${
                      activa ? 'bg-primary' : 'bg-card active:bg-muted'
                    }`}
                  >
                    <Text
                      className={`text-[13px] font-semibold ${
                        activa ? 'text-primary-foreground' : 'text-foreground'
                      }`}
                    >
                      {f.titulo}
                    </Text>
                  </Pressable>
                )
              })}
          </ScrollView>

          <View className="px-4 pt-3">
            <SearchField
              value={busqueda}
              onChangeText={setBusqueda}
              placeholder={esEfecto ? 'Buscar efectos' : 'Buscar marcos'}
            />
          </View>

          {enGrilla ? (
            /* La grilla plana. El ancho se mide adentro del margen: las
               celdas se reparten lo que queda entre los 16px de cada lado. */
            <View className="px-4 pt-4">
              <View
                className="flex-row flex-wrap"
                style={{ gap: HUECO }}
                onLayout={(e) => setAnchoGrilla(e.nativeEvent.layout.width)}
              >
                {familia === 'todos' && !buscando ? celdaDe(null, celda) : null}
                {tarjetas.map((o) => celdaDe(o, celda))}
              </View>
              {!tarjetas.length ? (
                <Text className="text-muted-foreground px-2 py-8 text-center text-[13px]">
                  {decoraciones === null && esEfecto && !dibujados.length
                    ? 'Cargando…'
                    : esEfecto
                      ? 'No hay efectos con ese nombre.'
                      : 'No hay marcos con ese nombre.'}
                </Text>
              ) : null}
            </View>
          ) : (
            /* Los estantes: una colección por fila, como la tienda de Discord. */
            <View className="gap-7 pt-5">
              {/* «Ninguno» va primero, solo, con su estante propio y sin lema:
                  es una opción, no una colección. */}
              <View className="gap-3">
                <FadingRow gap={HUECO} padding={16}>
                  {celdaDe(null, CELDA_ESTANTE)}
                </FadingRow>
              </View>
              {estantes.map((c) => (
                <View key={c.id} className="gap-3">
                  <View className="px-4">
                    <Text className="text-foreground text-[17px] font-semibold">{c.nombre}</Text>
                    <Text className="text-muted-foreground text-[13px]" numberOfLines={1}>
                      {c.lema}
                    </Text>
                  </View>
                  <FadingRow gap={HUECO} padding={16}>
                    {c.piezas.map((o) => celdaDe(o, CELDA_ESTANTE))}
                  </FadingRow>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    </Hoja>
  )
}

/** «insignias» → «Insignias»: el rótulo de una familia que solo trae el catálogo. */
function rotulo(familia: string): string {
  return familia.charAt(0).toLocaleUpperCase() + familia.slice(1)
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
