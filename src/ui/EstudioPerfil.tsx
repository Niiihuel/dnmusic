import { FiltrosCatalogoPerfil } from './FiltrosCatalogoPerfil'
import { FilaSocial } from './FilaSocial'
import { SelectorCatalogo } from './SelectorCatalogo'
import { AccionSocial } from './Social'
import { IconButton } from './IconButton'
import { memo, useDeferredValue, useMemo, useRef, useState, type ReactNode } from 'react'
import { ActivityIndicator, FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import type { Profile } from '../services/profile'
import { useCatalogoDiscord, seleccionPaqueteDiscord, type PiezaDiscord, type TipoPiezaDiscord, type PaqueteDiscord } from '../services/discordCatalogo'
import { useDecoraciones, decoracionUrl, esDecoracionPropia, type Decoracion } from '../services/decoraciones'
import { Avatar } from './Avatar'
import { Marco, MARCOS } from './Marco'
import { EfectoPerfil } from './DecoracionImagen'
import { EFECTOS } from './EfectosDibujados'
import { PlacaDeNombre, PLACAS } from './Placas'
import { DiscordMarcoPerfil } from './DiscordCosmeticos'
import { TarjetaPerfil, CabeceraPerfil, SuperficiePerfil, FondoEstiloPerfil } from './TarjetaPerfil'
import { Vitrinas, Resumen } from './PerfilPublico'
import { SearchField } from './SearchField'
import { ScrollArea } from './ScrollArea'
import { BotonHoja } from './EncabezadoHoja'
import { Menu, type MenuItem } from './Menu'
import { IconCheck, IconChevronDown, IconClose, IconEye, IconSparkles, IconCollapseRight, IconExpandRight } from './icons'

export type EstiloPerfil = Record<TipoPiezaDiscord, string | null>
export const TIPOS_ESTILO: TipoPiezaDiscord[] = ['marco', 'placa', 'efecto', 'marcoPerfil']
export function estiloDelPerfil(p: Profile): EstiloPerfil {
  return { marco: p.marco ?? null, placa: p.placa ?? null, efecto: p.efecto ?? null, marcoPerfil: p.marcoPerfil ?? null }
}
const TITULOS_ESTILO: Record<TipoPiezaDiscord, string> = {
  marco: 'Avatar', placa: 'Placa de nombre', efecto: 'Efecto', marcoPerfil: 'Marco de estadísticas',
}
type FiltroTipo = TipoPiezaDiscord | 'paquete'
type Opcion = { id: string; nombre: string; coleccion: string; coleccionId: string; tipo: FiltroTipo; discord?: PiezaDiscord; paquete?: PaqueteDiscord; imagen?: Decoracion }
const normalizar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const TAM_PAGINA = 30

/** Probador sin persistencia propia: seleccionar nunca escribe en la cuenta. */
export function EstudioPerfil({ perfil, perfilOriginal = perfil, estilo, onCambiar, tipoInicial = 'marco', ocupado = false }: {
  perfil: Profile
  perfilOriginal?: Profile
  estilo: EstiloPerfil
  onCambiar: (valor: EstiloPerfil) => void
  tipoInicial?: FiltroTipo
  ocupado?: boolean
}) {
  const { catalogo, cargando, error, reintentar } = useCatalogoDiscord()
  const propias = useDecoraciones()
  const [tipo, setTipo] = useState<FiltroTipo>(tipoInicial)
  const [coleccion, setColeccion] = useState('todas')
  const [buscar, setBuscar] = useState('')
  const consulta = useDeferredValue(normalizar(buscar.trim()))
  const [paginas, setPaginas] = useState(1)
  const [ancho, setAncho] = useState(0)
  const [verPrevia, setVerPrevia] = useState(false)
  const [previaAbierta, setPreviaAbierta] = useState(true)
  const [verCombinacion, setVerCombinacion] = useState(false)
  const [animado, setAnimado] = useState(true)
  const [comparar, setComparar] = useState(false)
  const [vista, setVista] = useState<'tarjeta' | 'perfil'>('perfil')
  const [replay, setReplay] = useState(0)
  const listaRef = useRef<FlatList<Opcion>>(null)
  const dosPaneles = ancho >= 800
  const conPrevia = dosPaneles && previaAbierta
  const columnas = Math.max(2, Math.floor((ancho - (conPrevia ? 340 : 0) - 32) / 140))
  const nombre = perfil.displayName?.trim() || perfil.username
  const porId = useMemo(() => new Map((catalogo?.piezas ?? []).map(p => [p.id, p])), [catalogo])
  const originales = useMemo<Opcion[]>(() => [
    ...MARCOS.map(p => ({ id: p.id, nombre: p.nombre, tipo: 'marco' as const, coleccion: 'DMusic', coleccionId: 'dmusic' })),
    ...EFECTOS.map(p => ({ id: p.id, nombre: p.nombre, tipo: 'efecto' as const, coleccion: 'DMusic', coleccionId: 'dmusic' })),
    ...PLACAS.map(p => ({ id: p.id, nombre: p.nombre, tipo: 'placa' as const, coleccion: 'DMusic', coleccionId: 'dmusic' })),
    ...(propias ?? []).map(p => ({ id: p.id, nombre: p.nombre, tipo: p.tipo, coleccion: p.familia, coleccionId: p.familia, imagen: p })),
  ], [propias])
  const todas = useMemo<Opcion[]>(() => [
    ...(catalogo?.piezas ?? []).map(p => ({ ...p, discord: p })),
    ...(catalogo?.paquetes ?? []).map(p => ({ ...p, tipo: 'paquete' as const, paquete: p })),
  ], [catalogo])
  const colecciones = useMemo(() => {
    const disponibles = new Set(todas.filter(p => p.tipo === tipo).flatMap(p => [p.coleccionId, ...(p.discord?.coleccionIds ?? [])]))
    return (catalogo?.colecciones ?? []).filter(c => disponibles.has(c.id)).slice().reverse()
  }, [catalogo, todas, tipo])
  const lista = useMemo(() => todas.filter(p => p.tipo === tipo && (coleccion === 'todas' || p.coleccionId === coleccion || p.discord?.coleccionIds?.includes(coleccion))
    && (!consulta || normalizar(`${p.nombre} ${p.coleccion}`).includes(consulta))).reverse(), [todas, tipo, coleccion, consulta])
  const visible = lista.slice(0, paginas * TAM_PAGINA)
  const seleccion = tipo !== 'paquete' ? estilo[tipo] : null
  const perfilPrueba = { ...perfil, ...estilo }
  const mostrado = comparar ? perfilOriginal : perfilPrueba
  const cambiados = TIPOS_ESTILO.filter(t => estilo[t] !== (perfilOriginal[t] ?? null)).length
  const nombrePieza = (id: string | null) => !id ? 'Sin decoración' : porId.get(id)?.nombre ?? originales.find(p => p.id === id)?.nombre ?? (esDecoracionPropia(id) ? 'Tu decoración' : 'Decoración guardada')

  function filtro(cambio: () => void) {
    cambio(); setPaginas(1)
    listaRef.current?.scrollToOffset({ offset: 0, animated: false })
  }
  function elegir(opcion: Opcion) {
    if (ocupado) return
    setComparar(false)
    if (opcion.paquete) {
      const piezas = seleccionPaqueteDiscord(opcion.paquete.id)
      if (!piezas) return
      onCambiar({ ...estilo, ...piezas })
    }
    else if (opcion.tipo !== 'paquete') onCambiar({ ...estilo, [opcion.tipo]: opcion.id })
    setReplay(n => n + 1)
  }
  const seleccionado = (o: Opcion) => o.paquete
    ? Object.entries(o.paquete.piezas).every(([k, id]) => estilo[k as TipoPiezaDiscord] === id)
    : o.tipo !== 'paquete' && estilo[o.tipo] === o.id

  const previa = (
    <View style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden', backgroundColor: '#151515' }}>
    {vista === 'perfil' ? <FondoEstiloPerfil key={replay} perfil={mostrado} animado={animado} /> : null}
    <ScrollArea style={{ flex: 1, minHeight: 0 }} contentInsetAdjustmentBehavior="never" automaticallyAdjustContentInsets={false}
      removeClippedSubviews={false} contentContainerStyle={{ padding: dosPaneles ? 16 : 20, paddingBottom: 32, gap: 8 }}>
      <View style={s.entre}>
        <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>Vista previa</Text>
        <View style={s.fila}>
          <MenuSelector label="Opciones de vista previa" texto={vista === 'perfil' ? 'Perfil' : 'Tarjeta'} items={[
            { label: 'Perfil completo', selected: vista === 'perfil', onPress: () => setVista('perfil') },
            { label: 'Tarjeta de Discord', selected: vista === 'tarjeta', onPress: () => setVista('tarjeta') },
            { label: animado ? 'Pausar animaciones' : 'Reproducir animaciones', separadorAntes: true, onPress: () => setAnimado(!animado) },
            { label: 'Repetir efecto', onPress: () => { setReplay(n => n + 1); setAnimado(true) } },
            { label: comparar ? 'Ver cambios' : 'Ver original', selected: comparar, onPress: () => setComparar(!comparar) },
          ]} />
        </View>
      </View>
      <View style={{ paddingHorizontal: 12, paddingVertical: 16, minHeight: 290 }}>
        {vista === 'tarjeta' ? <TarjetaPerfil key={replay} perfil={mostrado} animado={animado} />
          : <SuperficiePerfil perfil={mostrado} minHeight={480}>
            <CabeceraPerfil perfil={mostrado} banda animado={animado} />
            <Resumen ownerId={mostrado.userId} marcoPerfil={mostrado.marcoPerfil} animado={animado} desde={mostrado.createdAt} />
            <Vitrinas ownerId={mostrado.userId} recarga={0} onCambio={() => undefined} temaGlobal={mostrado.tema}
              vacio={<View style={s.mosaico}><Text style={s.texto}>Tu espacio</Text><Text style={s.secundario}>Todavía no hay vitrinas en este perfil.</Text></View>} />
          </SuperficiePerfil>}
      </View>
      <View style={{ gap: 4 }}>
        <AccionSocial label={verCombinacion ? 'Ocultar tu combinación' : 'Tu combinación'} secundaria onPress={() => setVerCombinacion(!verCombinacion)} />
        {verCombinacion ? TIPOS_ESTILO.map(t => <View key={t} style={s.seleccion}>
          <View style={{ flex: 1 }}><FilaSocial titulo={nombrePieza(estilo[t])} detalle={TITULOS_ESTILO[t]} onPress={() => { filtro(() => { setTipo(t); setColeccion('todas') }); setVerPrevia(false) }} /></View>
          {estilo[t] ? <IconButton label={`Quitar ${TITULOS_ESTILO[t].toLowerCase()}`} symbol="xmark" disabled={ocupado} onPress={() => { onCambiar({ ...estilo, [t]: null }); setComparar(false) }} icon={<IconClose size={14} color="#b3b3b3" />} /> : null}
        </View>) : null}
      </View>
      <Text style={s.secundario}>{cambiados ? `${cambiados} ${cambiados === 1 ? 'pieza modificada' : 'piezas modificadas'}.` : 'Probá tu combinación.'}</Text>
    </ScrollArea>
    </View>
  )
  const explorar = (
    <View testID="catalogo-perfil" style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden', backgroundColor: '#121212' }}>
      <View testID="filtros-catalogo-perfil" style={{ flexShrink: 0, zIndex: 1, backgroundColor: '#121212', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 4 : 16, paddingBottom: 8, gap: Platform.OS === 'ios' ? 8 : 12 }}>
        {Platform.OS === 'ios' ? <FiltrosCatalogoPerfil tipo={tipo}
          tipos={[...TIPOS_ESTILO, 'paquete' as const].map(t => ({ id: t, nombre: t === 'paquete' ? 'Paquetes' : TITULOS_ESTILO[t] }))}
          onTipo={t => filtro(() => { setTipo(t as FiltroTipo); setColeccion('todas') })}
          buscar={buscar} onBuscar={v => filtro(() => setBuscar(v))}
          coleccion={coleccion} colecciones={[{ id: 'todas', nombre: 'Todas las colecciones' }, ...colecciones]}
          onColeccion={id => filtro(() => setColeccion(id))} ocupado={ocupado}
          onPrevia={() => dosPaneles ? setPreviaAbierta(!previaAbierta) : setVerPrevia(true)} /> : <>
        <View style={s.entre}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <SearchField density="compact" value={buscar} onChangeText={v => filtro(() => setBuscar(v))} placeholder="Buscar una pieza o colección" />
          </View>
          <IconButton label={dosPaneles ? (previaAbierta ? 'Ocultar vista previa' : 'Mostrar vista previa') : 'Ver vista previa del perfil'} symbol="eye" selected={dosPaneles ? previaAbierta : verPrevia} onPress={() => dosPaneles ? setPreviaAbierta(!previaAbierta) : setVerPrevia(true)} icon={dosPaneles ? previaAbierta ? <IconCollapseRight size={19} color="#aaa" /> : <IconExpandRight size={19} color="#aaa" /> : <IconEye size={20} color="#eee" />} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <SelectorCatalogo etiqueta="Tipo de decoración" valor={tipo} opciones={[...TIPOS_ESTILO, 'paquete' as const].map(t => ({ id: t, nombre: t === 'paquete' ? 'Paquetes' : TITULOS_ESTILO[t] }))}
            onChange={t => filtro(() => { setTipo(t as FiltroTipo); setColeccion('todas') })} />
          <SelectorCatalogo etiqueta="Colección" valor={coleccion} opciones={[{ id: 'todas', nombre: 'Todas las colecciones' }, ...colecciones]}
            onChange={id => filtro(() => setColeccion(id))} />
        </View>
        </>}
      </View>
      <FlatList key={columnas} ref={listaRef} data={[
          ...(tipo !== 'paquete' ? [{ id: '__ninguna', nombre: '', coleccion: '', coleccionId: '', tipo }] : []),
          ...visible,
        ]} numColumns={columnas}
        keyExtractor={o => o.id} extraData={estilo} style={{ flex: 1, minHeight: 0, overflow: 'hidden', backgroundColor: '#121212' }}
        contentInsetAdjustmentBehavior="never" automaticallyAdjustContentInsets={false} removeClippedSubviews={false}
        renderScrollComponent={props => <ScrollArea {...props} />}
        contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 10 }} columnWrapperStyle={{ gap: 10 }}
        keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} initialNumToRender={15} maxToRenderPerBatch={12} windowSize={5}
        onEndReachedThreshold={0.6} onEndReached={() => { if (visible.length < lista.length) setPaginas(n => n + 1) }}
        renderItem={({ item: o }) => o.id === '__ninguna' ? <Pressable accessibilityRole="button" accessibilityLabel={`Sin decoración de ${TITULOS_ESTILO[tipo as TipoPiezaDiscord].toLowerCase()}`} accessibilityState={{ selected: !seleccion, disabled: ocupado }} disabled={ocupado}
            onPress={() => { onCambiar({ ...estilo, [tipo]: null }); setComparar(false) }} style={[s.item, !seleccion ? s.elegido : null]}>
            <View style={s.imagen}><IconClose size={24} color="#777" /></View><Text style={s.itemNombre}>Sin decoración</Text><Text style={s.itemDetalle}>Dejarlo simple</Text>
            {!seleccion ? <MarcaSeleccion /> : null}
          </Pressable> : <TarjetaPieza opcion={o} elegida={seleccionado(o)} nombre={nombre} avatarPath={perfil.avatarPath} ocupado={ocupado} onPress={() => elegir(o)} />}
        ListHeaderComponent={<View style={{ gap: 16 }}>
        {cargando ? <View style={s.estado}><ActivityIndicator color="#fff" /><Text style={s.secundario}>Abriendo el catálogo…</Text></View> : null}
        {error ? <View style={s.estado}><Text style={s.texto}>No se pudo abrir el catálogo.</Text><Pildora texto="Reintentar" onPress={reintentar} /></View> : null}
        <View style={s.entre}><Text style={s.seccion}>{tipo === 'paquete' ? 'PAQUETES' : TITULOS_ESTILO[tipo].toUpperCase()}</Text><Text style={s.secundario}>{lista.length} opciones</Text></View>
        </View>}
        ListFooterComponent={<View style={{ gap: 16 }}>
        {!cargando && !error && lista.length === 0 ? <View style={s.estado}><IconSparkles size={24} color="#888" /><Text style={s.texto}>No encontramos piezas</Text><Text style={s.secundario}>Probá otro nombre o cambiá los filtros.</Text>
          <Pildora texto="Limpiar filtros" onPress={() => filtro(() => { setBuscar(''); setColeccion('todas') })} /></View> : null}
        {visible.length < lista.length ? <View style={s.estado} accessibilityLiveRegion="polite"><ActivityIndicator color="#aaa" /><Text style={s.secundario}>Cargando más piezas…</Text></View> : null}
        {catalogo ? <Text style={s.nota}>Catálogo de Discord · {catalogo.actualizado.slice(0, 10)}. Las colecciones nuevas pueden tardar en aparecer.</Text> : null}
      </View>} />
    </View>
  )
  return <View style={{ flex: 1, minHeight: 0, backgroundColor: '#121212', overflow: 'hidden' }} onLayout={e => setAncho(e.nativeEvent.layout.width)}>
    {!dosPaneles && verPrevia ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 8 }}>
      <BotonHoja tipo="volver" label="Volver al catálogo" onPress={() => setVerPrevia(false)} /><Text style={s.texto}>Catálogo</Text>
    </View> : null}
    <View style={{ flex: 1, flexDirection: dosPaneles ? 'row' : 'column', minHeight: 0 }}>
      {dosPaneles || !verPrevia ? explorar : null}
      {conPrevia ? <View style={{ width: 340 }}>{previa}</View> : !dosPaneles && verPrevia ? previa : null}
    </View>
  </View>
}

function Pildora({ texto, activa = false, onPress, pequena = false }: { texto: string; activa?: boolean; onPress: () => void; pequena?: boolean; discreta?: boolean }) {
  return <AccionSocial label={texto} selected={activa} secundaria={!activa} compacta={pequena} expandida={false} onPress={onPress} />
}
function MenuSelector({ label, texto, items }: { label: string; texto: string; items: MenuItem[] }) {
  return <Menu label={label} items={items} trigger={
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#242424' }}>
      <Text numberOfLines={1} style={s.texto}>{texto}</Text><IconChevronDown size={14} color="#aaa" />
    </View>} />
}
function MarcaSeleccion() { return <View style={s.check}><IconCheck size={12} color="#121212" /></View> }
const TarjetaPieza = memo(function TarjetaPieza({ opcion: o, elegida, nombre, avatarPath, ocupado, onPress }: { opcion: Opcion; elegida: boolean; nombre: string; avatarPath: string | null; ocupado: boolean; onPress: () => void }) {
  const [hover, setHover] = useState(false)
  const [foco, setFoco] = useState(false)
  const noDisponible = o.discord?.disponible === false || o.paquete?.disponible === false
  return <Pressable accessibilityRole="button" accessibilityLabel={`${noDisponible ? 'No disponible' : 'Probar'} ${o.nombre}, ${o.tipo === 'paquete' ? 'paquete' : TITULOS_ESTILO[o.tipo]}`}
    accessibilityState={{ selected: elegida, disabled: ocupado || noDisponible }} disabled={ocupado || noDisponible} onPress={onPress}
    onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)} onFocus={event => setFoco(Platform.OS === 'web' && !!(event.target as unknown as HTMLElement).matches?.(':focus-visible'))} onBlur={() => setFoco(false)} style={[s.item, elegida ? s.elegido : null]}>
    <View style={s.imagen}><Muestra opcion={o} nombre={nombre} avatarPath={avatarPath} animado={hover || foco} /></View>
    <Text style={s.itemNombre} numberOfLines={2}>{o.nombre}</Text><Text style={s.itemDetalle} numberOfLines={1}>{o.coleccion}</Text>
    {noDisponible ? <Text style={s.itemDetalle}>Sin recursos disponibles</Text> : null}
    {o.paquete ? <Text style={s.itemDetalle}>{Object.keys(o.paquete.piezas).length} piezas</Text> : null}
    {o.imagen?.autor ? <Text style={s.itemDetalle} numberOfLines={2}>{o.imagen.autor} · {o.imagen.licencia}</Text> : null}
    {elegida ? <MarcaSeleccion /> : null}
  </Pressable>
})
function Muestra({ opcion: o, nombre, avatarPath, animado }: { opcion: Opcion; nombre: string; avatarPath: string | null; animado: boolean }): ReactNode {
  if (o.tipo === 'paquete') {
    if (animado && o.paquete) {
      const piezas = o.paquete.piezas
      return <View style={{ width: 76, paddingVertical: 8 }}><DiscordMarcoPerfil id={piezas.marcoPerfil} animado>
        <View style={{ height: 98, backgroundColor: '#303030', borderRadius: 6, padding: 8, gap: 8, overflow: 'hidden' }}>
          <View style={{ width: 24, height: 24, marginTop: 20 }}><Avatar name={nombre} path={avatarPath} size={24} /><Marco marco={piezas.marco} size={24} animado /></View>
          <PlacaDeNombre id={piezas.placa} animado compacta radio={3}><Text style={{ color: '#fff', fontSize: 8 }} numberOfLines={1}>{nombre}</Text></PlacaDeNombre>
          <EfectoPerfil id={piezas.efecto} alto={98} animado />
        </View>
      </DiscordMarcoPerfil></View>
    }
    return o.paquete?.preview ? <ImagenMuestra uri={o.paquete.preview} /> : <IconSparkles size={32} color="#aaa" />
  }
  if (o.tipo === 'marco') return <View style={{ width: 58, height: 58 }}><Avatar name={nombre} path={avatarPath} size={58} /><Marco marco={o.id} size={58} animado={animado} /></View>
  if (o.tipo === 'placa') return <View style={{ width: '100%', paddingHorizontal: 8 }}><PlacaDeNombre id={o.id} animado={animado} compacta radio={8}><Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }} numberOfLines={1}>{nombre}</Text></PlacaDeNombre></View>
  if (o.tipo === 'marcoPerfil') return <View style={{ width: 76, paddingVertical: 8 }}><DiscordMarcoPerfil id={o.id} animado={animado}><View style={{ height: 84, borderRadius: 6, backgroundColor: '#303030', padding: 8 }}><View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#666', marginTop: 18 }} /><View style={{ height: 4, width: 32, backgroundColor: '#666', marginTop: 8 }} /></View></DiscordMarcoPerfil></View>
  if (animado && o.tipo === 'efecto') return <View style={{ width: 100, height: 110, overflow: 'hidden' }}><EfectoPerfil id={o.id} alto={110} animado /></View>
  const preview = o.discord?.staticPreview ?? o.discord?.reducedMotionSrc ?? o.discord?.preview
  if (preview) return <ImagenMuestra uri={preview} />
  if (o.imagen) return <ImagenMuestra uri={decoracionUrl(o.imagen.archivo)} />
  return <View style={{ width: 100, height: 100, overflow: 'hidden' }}><EfectoPerfil id={o.id} alto={100} animado={animado} /></View>
}
function ImagenMuestra({ uri }: { uri: string }) {
  const [fallo, setFallo] = useState(false)
  const [cargada, setCargada] = useState(false)
  return fallo ? <Text style={s.secundario}>Sin vista previa</Text> : <View style={{ width: '100%', height: '100%' }}>{!cargada ? <View style={[StyleSheet.absoluteFill, { backgroundColor: '#292929', borderRadius: 8, alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator size="small" color="#777" /></View> : null}<Image onLoad={() => setCargada(true)} source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="contain" autoplay={false} onError={() => setFallo(true)} cachePolicy="memory-disk" /></View>
}
const s = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  entre: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  icono: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  redondo: { width: 44, height: 44, borderRadius: 24, backgroundColor: '#242424', alignItems: 'center', justifyContent: 'center' },
  seccion: { fontSize: 11, fontWeight: '700', letterSpacing: 1.3, color: '#999' },
  titulo: { color: '#fff', fontSize: 22, fontWeight: '700' },
  texto: { color: '#eee', fontSize: 13, fontWeight: '500' },
  secundario: { color: '#aaa', fontSize: 12, lineHeight: 18 },
  nota: { color: '#888', fontSize: 11, lineHeight: 16, paddingVertical: 8 },
  grilla: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  item: { flex: 1, minWidth: 0, maxWidth: 210, minHeight: 168, borderRadius: 10, backgroundColor: '#1e1e1e', paddingBottom: 12, overflow: 'hidden' },
  elegido: { backgroundColor: '#353535' },
  imagen: { height: 116, alignItems: 'center', justifyContent: 'center', padding: 8 },
  itemNombre: { color: '#fff', fontSize: 12, fontWeight: '700', paddingHorizontal: 12 },
  itemDetalle: { color: '#aaa', fontSize: 10, marginTop: 4, paddingHorizontal: 12 },
  check: { position: 'absolute', top: 8, right: 8, width: 21, height: 21, borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  estado: { paddingVertical: 24, alignItems: 'center', gap: 12 },
  seleccion: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mosaico: { padding: 18, borderRadius: 8, backgroundColor: '#202020', gap: 8 },
})
