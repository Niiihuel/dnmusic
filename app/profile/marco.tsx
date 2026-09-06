import { useState, type ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { estiloDeFuente } from '../../src/lib/fuentes'
import { mensajeError } from '../../src/lib/mensajeError'
import { pickImage } from '../../src/lib/pickImage'
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
import { saveMyProfile } from '../../src/services/profile'
import { ilustracionUrl, uploadIlustracionConProgreso } from '../../src/services/showcases'
import { avisar } from '../../src/state/aviso'
import { setMyProfile, useMyProfile, useUser } from '../../src/state/session'
import { usePiso } from '../../src/state/shell'
import { Avatar } from '../../src/ui/Avatar'
import { COLECCIONES, type Coleccion } from '../../src/ui/colecciones'
import { Atribucion } from '../../src/ui/DecoracionImagen'
import { EFECTOS, EfectoDibujado, esEfectoDibujado } from '../../src/ui/EfectosDibujados'
import { BotonHoja, EncabezadoHoja } from '../../src/ui/EncabezadoHoja'
import { FadingRow } from '../../src/ui/FadingScroll'
import { Hoja, useHojaModal } from '../../src/ui/Hoja'
import { aireDelMarco, Marco, MARCOS } from '../../src/ui/Marco'
import { alfa } from '../../src/ui/marcoBase'
import { FondoPerfil } from '../../src/ui/PerfilPublico'
import { PlacaDeNombre, PLACAS } from '../../src/ui/Placas'
import { BarraDeProgreso, porciento } from '../../src/ui/Progreso'
import { SearchField } from '../../src/ui/SearchField'
import { Segmentado } from '../../src/ui/Segmentado'
import { ICON_COLOR, IconCheck, IconChevronRight, IconPlus, IconSearch } from '../../src/ui/icons'

/** El hueco entre tarjetas. */
const HUECO = 10
/** El ancho de una tarjeta de pieza en un estante; en la grilla lo decide la fila. */
const TARJETA = 150
/** Lo que la tarjeta reserva para la muestra, arriba del nombre. */
const MUESTRA_ALTO = 112
/** La foto adentro de una muestra de marco. */
const MUESTRA = 64
/** La foto en la tarjeta de perfil de la vista previa. */
const FOTO = 76
/** El ancho de la tarjeta de perfil y de los banners. */
const ANCHO_TARJETA = 560
/** Cuánto se monta el estante destacado sobre el hero, como en la tienda de Discord. */
const MONTA = 56

/** Qué clase de pieza: las dos del catálogo, más las placas de nombre. */
type Pestana = TipoDecoracion | 'placa'

const ROTULO: Record<Pestana, string> = { marco: 'Marco', efecto: 'Efecto', placa: 'Placa' }
const ROTULO_PLURAL: Record<Pestana, string> = { marco: 'Marcos', efecto: 'Efectos', placa: 'Placas' }

/** Una pieza de la tienda: un marco, un efecto o una placa, dibujados o en imagen. */
type Opcion = {
  id: string
  nombre: string
  pestana: Pestana
  /** Presente cuando es una decoración del catálogo en imagen o una propia. */
  imagen?: Decoracion
}

/** Dónde está la persona adentro de la tienda. */
type Vista =
  | { tipo: 'tienda' }
  | { tipo: 'coleccion'; id: string }
  | { tipo: 'todo' }
  | { tipo: 'pieza'; opcion: Opcion }

/**
 * La tienda de decoraciones del perfil, con la anatomía de la tienda de
 * Discord y las reglas de acá.
 *
 * **La portada**: un hero de la colección destacada —el efecto de la
 * colección corriendo sobre el tinte de su paleta, el logo en su
 * tipografía, la flecha para pasar a la siguiente— y, montado sobre su
 * borde de abajo, el estante de sus piezas en tarjetas. Debajo, un banner
 * por colección, con el logo y una composición de muestra (la foto con el
 * marco, la tarjeta con el efecto, la placa con tu nombre), que abre la
 * colección. Al pie, «Encontrá tu estilo» y el botón para explorar todo.
 *
 * **Una colección**: su hero y sus estantes por clase. **Una pieza**: tu
 * tarjeta de perfil con la pieza puesta, de qué colección es, y «Aplicar»,
 * que guarda al toque —como en Discord, donde se prueba y se aplica desde
 * la pieza y no desde un tilde general—. **Explorar todo**: Marcos /
 * Efectos / Placas, el buscador, «Subir la tuya» y la grilla.
 *
 * Nada de acá es un activo de nadie: los marcos, los efectos y las placas
 * se dibujan (`ui/Marco`, `ui/EfectosDibujados`, `ui/Placas`), y lo que es
 * imagen viene del catálogo propio (`services/decoraciones`) o de tu
 * carpeta. Las de imagen muestran autor y licencia, que es lo que CC BY pide.
 *
 * La hoja es la de siempre (`EncabezadoHoja`, pegada arriba con su velo).
 * Se ve quieta: se anima el hero, la pieza abierta y, con cursor, la
 * tarjeta que tiene el cursor encima.
 */
export default function Tienda() {
  const router = useRouter()
  const perfil = useMyProfile()
  const user = useUser()
  const piso = usePiso(24)
  const modal = useHojaModal()
  const { width } = useWindowDimensions()
  const { tipo: tipoCrudo } = useLocalSearchParams<{ tipo?: string }>()
  const decoraciones = useDecoraciones()

  const [vista, setVista] = useState<Vista>(
    tipoCrudo === 'efecto' || tipoCrudo === 'placa' || tipoCrudo === 'marco' ? { tipo: 'todo' } : { tipo: 'tienda' },
  )
  const [pestana, setPestana] = useState<Pestana>(
    tipoCrudo === 'efecto' ? 'efecto' : tipoCrudo === 'placa' ? 'placa' : 'marco',
  )
  const [destacada, setDestacada] = useState(0)
  const [busqueda, setBusqueda] = useState('')
  const [guardando, setGuardando] = useState(false)
  /** Cuánto subió tu archivo, de 0 a 1; `null` mientras no se sube. */
  const [progreso, setProgreso] = useState<number | null>(null)

  const nombre = perfil?.displayName?.trim() || perfil?.username || 'Vos'
  const actuales: Record<Pestana, string | null> = {
    marco: perfil?.marco ?? null,
    efecto: perfil?.efecto ?? null,
    placa: perfil?.placa ?? null,
  }

  /* Todas las piezas, de las tres clases: las dibujadas y las del catálogo. */
  const todas: Opcion[] = [
    ...MARCOS.map((m) => ({ id: m.id, nombre: m.nombre, pestana: 'marco' as const })),
    ...EFECTOS.map((e) => ({ id: e.id, nombre: e.nombre, pestana: 'efecto' as const })),
    ...PLACAS.map((p) => ({ id: p.id, nombre: p.nombre, pestana: 'placa' as const })),
    ...(decoraciones ?? []).map((d) => ({ id: d.id, nombre: d.nombre, pestana: d.tipo, imagen: d })),
  ]
  const porId = new Map(todas.map((o) => [o.id, o]))
  /** Una pieza por id, incluidas las propias (`imagen:…`), que no están en ninguna lista. */
  const opcionDe = (id: string | null, clase: Pestana): Opcion | null => {
    if (!id) return null
    if (esDecoracionPropia(id) && clase !== 'placa')
      return { id, nombre: 'Tu decoración', pestana: clase, imagen: decoracionPropia(id, clase) }
    return porId.get(id) ?? null
  }
  const idsDe = (c: Coleccion, clase: Pestana) =>
    clase === 'efecto' ? c.efectos : clase === 'placa' ? c.placas : c.marcos
  const piezasDe = (c: Coleccion, clase: Pestana) =>
    idsDe(c, clase).map((id) => porId.get(id)).filter((o): o is Opcion => !!o)
  const coleccionDe = (o: Opcion) => COLECCIONES.find((c) => idsDe(c, o.pestana).includes(o.id))
  const conPiezas = COLECCIONES.filter((c) => (['marco', 'efecto', 'placa'] as Pestana[]).some((k) => piezasDe(c, k).length))
  const laDestacada = conPiezas[destacada % Math.max(1, conPiezas.length)]

  const cerrar = () => volver(router, '/profile/editar')
  const irATienda = () => setVista({ tipo: 'tienda' })

  /** Aplicar una pieza: se guarda al toque, como en la tienda de Discord. */
  async function aplicar(o: Opcion | null, clase: Pestana) {
    if (guardando) return
    setGuardando(true)
    try {
      const cambio = { [clase]: o?.id ?? '' } as Partial<Record<Pestana, string>>
      setMyProfile(await saveMyProfile(cambio))
      avisar(o ? `${ROTULO[clase]} aplicado` : `${ROTULO[clase]} quitado`)
    } catch (e) {
      avisar(mensajeError(e), true)
    } finally {
      setGuardando(false)
    }
  }

  /**
   * Subir la tuya: un archivo propio —PNG, WebP, GIF o APNG— que va a tu
   * carpeta y se abre como pieza, lista para aplicar. Es la misma puerta que
   * la foto de perfil; lo que subís es tuyo y se ve en tu perfil.
   */
  async function subirPropia(clase: TipoDecoracion) {
    if (!user || progreso !== null) return
    try {
      const elegida = await pickImage({ cuadrada: false })
      if (!elegida) return
      setProgreso(0)
      const ruta = await uploadIlustracionConProgreso(user.id, elegida.blob, elegida.fileName, elegida.mime, setProgreso)
      const id = `${PREFIJO_PROPIA}${ruta}`
      setVista({ tipo: 'pieza', opcion: { id, nombre: 'Tu decoración', pestana: clase, imagen: decoracionPropia(id, clase) } })
    } catch (e) {
      avisar(mensajeError(e), true)
    } finally {
      setProgreso(null)
    }
  }

  const foto = (marco: string | null, size: number, animado: boolean) => (
    <View style={{ width: size, height: size }}>
      <Avatar name={nombre} path={perfil?.avatarPath} size={size} encuadre={perfil?.avatarEncuadre} />
      <Marco marco={marco} size={size} animado={animado} />
    </View>
  )

  /** La muestra de una pieza, según su clase: la foto con el marco, una banda con el efecto, la placa con tu nombre. */
  const muestra = (o: Opcion | null, clase: Pestana, ancho: number, animada: boolean): ReactNode => {
    if (clase === 'placa')
      return (
        <View style={{ width: ancho - 24 }}>
          <PlacaDeNombre id={o?.id ?? null} animado={animada} radio={10}>
            <Text className="text-foreground text-[13px] font-bold" numberOfLines={1}>
              {nombre}
            </Text>
          </PlacaDeNombre>
        </View>
      )
    if (clase === 'efecto') {
      if (!o) return <View className="h-14 w-14 rounded-full bg-muted" />
      const w = ancho - 24
      const h = Math.round(w * 0.62)
      return (
        <View className="overflow-hidden rounded-xl bg-muted" style={{ width: w, height: h }}>
          {esEfectoDibujado(o.id) ? (
            <EfectoDibujado id={o.id} alto={h} animado={animada} />
          ) : o.imagen ? (
            <Image
              source={{ uri: esDecoracionPropia(o.id) ? ilustracionUrl(rutaDePropia(o.id)) : decoracionUrl(o.imagen.archivo) }}
              style={{ width: w, height: h }}
              contentFit="cover"
              autoplay={animada}
              cachePolicy="memory-disk"
            />
          ) : null}
        </View>
      )
    }
    return foto(o?.id ?? null, MUESTRA, animada)
  }

  const tarjetaDe = (o: Opcion, ancho: number) => (
    <TarjetaPieza
      key={o.id}
      ancho={ancho}
      clase={ROTULO[o.pestana]}
      nombre={o.nombre}
      detalle={`${ROTULO[o.pestana]} · ${coleccionDe(o)?.nombre ?? (o.imagen ? 'Insignia' : 'Suelto')}`}
      actual={actuales[o.pestana] === o.id}
      onPress={() => setVista({ tipo: 'pieza', opcion: o })}
    >
      {(animada) => muestra(o, o.pestana, ancho, animada)}
    </TarjetaPieza>
  )

  /* ── Las vistas ──────────────────────────────────────────────────────── */

  const encabezado =
    vista.tipo === 'tienda' ? (
      <EncabezadoHoja
        titulo="Tienda"
        izquierda={<BotonHoja tipo="cerrar" onPress={cerrar} />}
        derecha={
          <BotonHoja label="Explorar todo" onPress={() => setVista({ tipo: 'todo' })}>
            <IconSearch size={16} color={ICON_COLOR.foreground} />
          </BotonHoja>
        }
      />
    ) : (
      <EncabezadoHoja
        titulo={
          vista.tipo === 'coleccion'
            ? (COLECCIONES.find((c) => c.id === vista.id)?.nombre ?? 'Colección')
            : vista.tipo === 'todo'
              ? 'Explorar todo'
              : vista.opcion.nombre
        }
        sobre={vista.tipo === 'pieza' ? ROTULO[vista.opcion.pestana] : undefined}
        izquierda={<BotonHoja tipo="volver" onPress={irATienda} />}
      />
    )

  const tarjetaDePerfil = (marco: string | null, efecto: string | null, placa: string | null, animado: boolean) => (
    <TarjetaDePerfil
      bannerPath={perfil?.bannerPath ?? null}
      encuadre={perfil?.bannerEncuadre ?? null}
      efecto={efecto}
      placa={placa}
      foto={foto(marco, FOTO, animado)}
      nombre={nombre}
      usuario={perfil?.username ?? ''}
      bio={perfil?.bio ?? ''}
    />
  )

  /** El estante de una colección para una clase, con sus tarjetas. */
  const estante = (c: Coleccion, clase: Pestana, titulo?: string) => {
    const piezas = piezasDe(c, clase)
    if (!piezas.length) return null
    return (
      <View key={`${c.id}-${clase}`} className="gap-3">
        {titulo ? <Text className="px-4 text-foreground text-[15px] font-semibold">{titulo}</Text> : null}
        <FadingRow gap={HUECO} padding={16}>
          {piezas.map((o) => tarjetaDe(o, TARJETA))}
        </FadingRow>
      </View>
    )
  }

  let cuerpo: ReactNode
  if (vista.tipo === 'pieza') {
    const o = vista.opcion
    const clase = o.pestana
    const esActual = actuales[clase] === o.id
    const col = coleccionDe(o)
    cuerpo = (
      <View className="gap-5 px-4 pt-3">
        <View className="items-center">
          {tarjetaDePerfil(
            clase === 'marco' ? o.id : actuales.marco,
            clase === 'efecto' ? o.id : actuales.efecto,
            clase === 'placa' ? o.id : actuales.placa,
            true,
          )}
        </View>
        <View className="items-center gap-1">
          <Text className="text-foreground text-[20px] font-bold">{o.nombre}</Text>
          {o.imagen && !esDecoracionPropia(o.id) ? (
            <Atribucion decoracion={o.imagen} />
          ) : (
            <Text className="text-muted-foreground text-center text-[13px]">
              {esDecoracionPropia(o.id)
                ? 'Un archivo tuyo, en tu carpeta.'
                : col
                  ? `${col.nombre} · ${col.lema}`
                  : ROTULO[clase]}
            </Text>
          )}
        </View>
        <View className="items-center gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={esActual ? `${ROTULO[clase]} aplicado` : `Aplicar ${o.nombre}`}
            accessibilityState={{ disabled: esActual || guardando }}
            disabled={esActual || guardando}
            onPress={() => void aplicar(o, clase)}
            className={`h-12 w-full max-w-[360px] items-center justify-center rounded-full ${
              esActual ? 'bg-muted' : 'bg-primary active:opacity-80'
            }`}
          >
            <Text className={`text-[15px] font-bold ${esActual ? 'text-muted-foreground' : 'text-primary-foreground'}`}>
              {esActual ? 'Aplicada' : guardando ? 'Aplicando…' : 'Aplicar'}
            </Text>
          </Pressable>
          {esActual ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Quitar ${ROTULO[clase].toLowerCase()}`}
              disabled={guardando}
              onPress={() => void aplicar(null, clase)}
              className="h-11 items-center justify-center px-5 active:opacity-70"
            >
              <Text className="text-muted-foreground text-[14px] font-semibold">Quitar</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    )
  } else if (vista.tipo === 'coleccion') {
    const c = COLECCIONES.find((x) => x.id === vista.id)
    cuerpo = c ? (
      <View className="gap-7">
        <Hero coleccion={c} ancho={Math.min(width, 720)} muestra={foto(piezasDe(c, 'marco')[0]?.id ?? null, 96, true)} />
        {estante(c, 'marco', 'Marcos')}
        {estante(c, 'efecto', 'Efectos')}
        {estante(c, 'placa', 'Placas')}
      </View>
    ) : null
  } else if (vista.tipo === 'todo') {
    const texto = busqueda.trim().toLocaleLowerCase()
    const lista = todas.filter((o) => o.pestana === pestana && o.nombre.toLocaleLowerCase().includes(texto))
    const actual = opcionDe(actuales[pestana], pestana)
    cuerpo = (
      <View className="gap-4 pt-3">
        <View className="px-4">
          <Segmentado
            label="Qué explorar"
            value={pestana}
            options={[
              { value: 'marco', label: 'Marcos' },
              { value: 'efecto', label: 'Efectos' },
              { value: 'placa', label: 'Placas' },
            ]}
            onChange={setPestana}
          />
        </View>
        <View className="px-4">
          <SearchField value={busqueda} onChangeText={setBusqueda} placeholder={`Buscar ${ROTULO_PLURAL[pestana].toLowerCase()}`} />
        </View>
        {/* Lo tuyo primero: la que tenés puesta y, si es marco o efecto, subir una propia. */}
        {!texto && (actual || pestana !== 'placa') ? (
          <View className="gap-3">
            <Text className="px-4 text-foreground text-[15px] font-semibold">Lo tuyo</Text>
            <FadingRow gap={HUECO} padding={16}>
              {actual ? tarjetaDe(actual, TARJETA) : null}
              {pestana !== 'placa' ? (
                <TarjetaPieza
                  ancho={TARJETA}
                  clase={ROTULO[pestana]}
                  nombre="Subir la tuya"
                  detalle="PNG, WebP, GIF o APNG"
                  actual={false}
                  onPress={() => void subirPropia(pestana)}
                >
                  {() =>
                    progreso !== null ? (
                      <View className="w-full px-4">
                        <BarraDeProgreso valor={progreso} rotulo={porciento(progreso)} />
                      </View>
                    ) : (
                      <View className="h-12 w-12 items-center justify-center rounded-full bg-muted">
                        <IconPlus size={20} color={ICON_COLOR.foreground} />
                      </View>
                    )
                  }
                </TarjetaPieza>
              ) : null}
            </FadingRow>
          </View>
        ) : null}
        <Grilla piezas={lista} render={tarjetaDe} />
        {!lista.length ? (
          <Text className="text-muted-foreground px-6 py-6 text-center text-[13px]">
            {decoraciones === null ? 'Cargando…' : `No hay ${ROTULO_PLURAL[pestana].toLowerCase()} con ese nombre.`}
          </Text>
        ) : null}
      </View>
    )
  } else {
    cuerpo = (
      <View className="gap-7">
        {/* El hero de la destacada, y su estante montado sobre el borde. */}
        {laDestacada ? (
          <View>
            <Hero
              coleccion={laDestacada}
              ancho={Math.min(width, 720)}
              muestra={foto(piezasDe(laDestacada, 'marco')[0]?.id ?? null, 96, true)}
              onSiguiente={conPiezas.length > 1 ? () => setDestacada((n) => n + 1) : undefined}
            />
            <View style={{ marginTop: -MONTA }}>
              <FadingRow gap={HUECO} padding={16}>
                {(['marco', 'efecto', 'placa'] as Pestana[]).flatMap((k) => piezasDe(laDestacada, k)).map((o) => tarjetaDe(o, TARJETA))}
              </FadingRow>
            </View>
          </View>
        ) : null}

        {/* Un banner por colección, que la abre. */}
        <View className="gap-4 px-4">
          {conPiezas.map((c) => {
            const efectoId = piezasDe(c, 'efecto')[0]?.id
            const efectoMuestra = esEfectoDibujado(efectoId) ? efectoId : null
            return (
            <BannerColeccion
              key={c.id}
              coleccion={c}
              onPress={() => setVista({ tipo: 'coleccion', id: c.id })}
              muestras={
                <View className="flex-row items-center gap-3">
                  {piezasDe(c, 'marco')[0] ? (
                    <View style={{ width: 52, height: 52, margin: aireDelMarco(52) }}>{foto(piezasDe(c, 'marco')[0].id, 52, false)}</View>
                  ) : null}
                  <View className="gap-2">
                    {efectoMuestra ? (
                      <View className="overflow-hidden rounded-lg bg-muted" style={{ width: 76, height: 48 }}>
                        <EfectoDibujado id={efectoMuestra} alto={48} animado={false} />
                      </View>
                    ) : null}
                    {piezasDe(c, 'placa')[0] ? (
                      <View style={{ width: 84 }}>
                        <PlacaDeNombre id={piezasDe(c, 'placa')[0].id} animado={false} radio={8}>
                          <Text className="text-foreground text-[11px] font-bold" numberOfLines={1}>
                            {nombre}
                          </Text>
                        </PlacaDeNombre>
                      </View>
                    ) : null}
                  </View>
                </View>
              }
            />
            )
          })}
        </View>

        {/* Al pie, como Discord: el estilo es tuyo, y todo lo demás está a un toque. */}
        <View className="flex-row items-center justify-between gap-3 px-4 pt-2">
          <Text className="min-w-0 flex-1 text-foreground text-[22px] font-bold" numberOfLines={1}>
            Encontrá tu estilo
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Explorar todo"
            onPress={() => setVista({ tipo: 'todo' })}
            className="h-11 items-center justify-center rounded-full bg-primary px-5 active:opacity-80"
          >
            <Text className="text-primary-foreground text-[14px] font-bold">Explorar todo</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  return (
    <Hoja anchoMaximo={720}>
      <ScrollView
        className="flex-1 bg-background"
        stickyHeaderIndices={[0]}
        contentContainerStyle={{ paddingBottom: modal ? 24 : piso }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {encabezado}
        <View>{cuerpo}</View>
      </ScrollView>
    </Hoja>
  )
}

/* ── Piezas ──────────────────────────────────────────────────────────────── */

/**
 * La tarjeta de una pieza, como las de la tienda de Discord: la placa
 * oscura con la muestra arriba, el nombre en negrita y una línea chica
 * debajo. La que tenés puesta lleva el tilde en la esquina. Se anima con el
 * cursor encima; quieta, posa.
 */
function TarjetaPieza({
  ancho,
  clase,
  nombre,
  detalle,
  actual,
  onPress,
  children,
}: {
  ancho: number
  /** Qué es, para quien escucha: «Marco», «Efecto», «Placa». */
  clase: string
  nombre: string
  detalle: string
  actual: boolean
  onPress: () => void
  children: (animada: boolean) => ReactNode
}) {
  const [encima, setEncima] = useState(false)
  const animada = actual || (TECLADO_FISICO && encima)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${clase} ${nombre}`}
      accessibilityState={{ selected: actual }}
      onPress={onPress}
      onPointerEnter={() => setEncima(true)}
      onPointerLeave={() => setEncima(false)}
      className={`overflow-hidden rounded-2xl active:opacity-80 ${encima ? 'bg-muted/70' : 'bg-card'}`}
      style={{ width: ancho }}
    >
      <View className="items-center justify-center" style={{ height: MUESTRA_ALTO }}>
        {children(animada)}
      </View>
      <View className="gap-0.5 px-3 pb-3">
        <Text className="text-foreground text-[14px] font-bold" numberOfLines={1}>
          {nombre}
        </Text>
        <Text className="text-muted-foreground text-[12px]" numberOfLines={1}>
          {detalle}
        </Text>
      </View>
      {actual ? (
        <View className="absolute right-2 top-2 h-[22px] w-[22px] items-center justify-center rounded-full bg-primary">
          <IconCheck size={12} color={ICON_COLOR.onPrimary} strokeWidth={3} />
        </View>
      ) : null}
    </Pressable>
  )
}

/**
 * El tamaño del logo de una colección: el pedido para un nombre corto, y
 * menos cuanto más largo, así «Después de medianoche» entra en dos líneas
 * enteras y no parte una palabra. Cada tipografía escala lo suyo después
 * (`estiloDeFuente`), pero el ancho lo decide el largo del nombre.
 */
function tamanoDeLogo(nombre: string, base: number): number {
  const palabraMasLarga = Math.max(...nombre.split(' ').map((p) => p.length))
  if (palabraMasLarga >= 9 || nombre.length >= 16) return Math.round(base * 0.72)
  if (nombre.length >= 11) return Math.round(base * 0.85)
  return base
}

/** La grilla de piezas que llena la fila: cuántas entran del ancho deseable, y el sobrante repartido. */
function Grilla({ piezas, render }: { piezas: Opcion[]; render: (o: Opcion, ancho: number) => ReactNode }) {
  const [ancho, setAncho] = useState(0)
  const columnas = Math.max(2, Math.floor((ancho + HUECO) / (TARJETA + HUECO)))
  const lado = ancho > 0 ? (ancho - HUECO * (columnas - 1)) / columnas : TARJETA
  return (
    <View className="px-4">
      <View className="flex-row flex-wrap" style={{ gap: HUECO }} onLayout={(e) => setAncho(e.nativeEvent.layout.width)}>
        {piezas.map((o) => render(o, lado))}
      </View>
    </View>
  )
}

/* ── Colecciones ─────────────────────────────────────────────────────────── */

/**
 * El hero de una colección: su efecto corriendo sobre el tinte de la paleta,
 * el logo en su tipografía y el lema, y la flecha para pasar a la siguiente.
 * Es el arte de la tienda de Discord, dibujado: acá no hay ilustración que
 * subir, hay piezas que se mueven.
 */
function Hero({
  coleccion,
  ancho,
  muestra,
  onSiguiente,
}: {
  coleccion: Coleccion
  ancho: number
  /** La foto con el primer marco, grande, a la derecha. */
  muestra: ReactNode
  onSiguiente?: () => void
}) {
  const alto = Math.round(Math.min(ancho * 0.62, 300))
  const [a, b] = coleccion.tonos
  const efecto = coleccion.efectos[0]
  return (
    <View className="overflow-hidden bg-card" style={{ height: alto }}>
      <LinearGradient
        colors={[alfa(a, 0.45), alfa(b, 0.25), 'rgba(18,18,18,1)']}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {efecto && esEfectoDibujado(efecto) ? <EfectoDibujado id={efecto} alto={alto} /> : null}
      <View pointerEvents="none" className="absolute right-6" style={{ top: alto * 0.16 }}>
        {muestra}
      </View>
      <View pointerEvents="none" className="absolute left-4 right-20" style={{ bottom: MONTA + 16 }}>
        <Text
          className="text-foreground font-bold"
          style={[
            { fontSize: tamanoDeLogo(coleccion.nombre, 40), textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 8 },
            estiloDeFuente(coleccion.fuente, tamanoDeLogo(coleccion.nombre, 40)),
          ]}
          numberOfLines={2}
        >
          {coleccion.nombre}
        </Text>
        <Text className="text-foreground/80 text-[13px]" numberOfLines={2}>
          {coleccion.lema}
        </Text>
      </View>
      {onSiguiente ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Siguiente colección"
          onPress={onSiguiente}
          className="absolute right-3 h-10 w-10 items-center justify-center rounded-full bg-black/45 active:opacity-70"
          style={{ bottom: MONTA + 20 }}
        >
          <IconChevronRight size={18} color="#fff" />
        </Pressable>
      ) : null}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(18,18,18,0)', 'rgba(18,18,18,0.85)']}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: MONTA + 24 }}
      />
    </View>
  )
}

/**
 * El banner de una colección en la portada: el tinte de su paleta, el logo
 * en su tipografía a la izquierda y la composición de muestra a la derecha
 * —la foto con el marco, la tarjeta con el efecto, la placa con tu nombre—,
 * como los banners de colección de la tienda de Discord. Tocarlo abre la
 * colección.
 */
function BannerColeccion({
  coleccion,
  muestras,
  onPress,
}: {
  coleccion: Coleccion
  muestras: ReactNode
  onPress: () => void
}) {
  const [a, b] = coleccion.tonos
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Colección ${coleccion.nombre}`}
      onPress={onPress}
      className="overflow-hidden rounded-2xl bg-card active:opacity-90"
      style={{ minHeight: 150 }}
    >
      <LinearGradient
        colors={[alfa(a, 0.38), alfa(b, 0.18), 'rgba(24,24,24,0)']}
        locations={[0, 0.55, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View className="flex-row items-center justify-between gap-4 px-5 py-5">
        <View className="min-w-0 flex-1 gap-1">
          <Text
            className="text-foreground font-bold"
            style={[
              { fontSize: tamanoDeLogo(coleccion.nombre, 30), textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 6 },
              estiloDeFuente(coleccion.fuente, tamanoDeLogo(coleccion.nombre, 30)),
            ]}
            numberOfLines={2}
          >
            {coleccion.nombre}
          </Text>
          <Text className="text-muted-foreground text-[13px]" numberOfLines={2}>
            {coleccion.lema}
          </Text>
        </View>
        <View className="shrink-0">{muestras}</View>
      </View>
    </Pressable>
  )
}

/* ── La tarjeta de perfil ────────────────────────────────────────────────── */

/**
 * La tarjeta de perfil de la vista previa: el fondo con el efecto, la foto
 * con el marco pisando el borde del fondo, la placa detrás del nombre y la
 * línea. Es la tarjeta que Discord muestra al probar una pieza, y es la
 * misma anatomía del perfil de acá en chico.
 */
function TarjetaDePerfil({
  bannerPath,
  encuadre,
  efecto,
  placa,
  foto,
  nombre,
  usuario,
  bio,
}: {
  bannerPath: string | null
  encuadre: Parameters<typeof FondoPerfil>[0]['encuadre']
  efecto: string | null
  placa: string | null
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
      <View className="px-5 pb-5" style={{ marginTop: -(FOTO / 2) }}>
        <View style={{ width: FOTO, height: FOTO, marginBottom: aireDelMarco(FOTO) - 4 }}>{foto}</View>
        <View className="items-start">
          <PlacaDeNombre id={placa}>
            <Text className="text-foreground text-[17px] font-bold" numberOfLines={1}>
              {nombre}
            </Text>
            <Text className="text-muted-foreground text-[13px]" numberOfLines={1}>
              @{usuario}
            </Text>
          </PlacaDeNombre>
        </View>
        {bio ? (
          <Text className="pt-2 text-foreground text-[13px]" numberOfLines={2}>
            {bio}
          </Text>
        ) : null}
      </View>
    </View>
  )
}
