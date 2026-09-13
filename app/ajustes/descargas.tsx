import { Fragment, useMemo, useState } from 'react'
import { ActivityIndicator, Image, Platform, Pressable, SectionList, Text, useWindowDimensions, View } from 'react-native'
import { Stack, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Panel } from '../../src/ui/Panel'
import { GrupoAjustes, FilaInterruptor, ListaAjustes, FilaAccion, FilaDato, FilaOpciones, FilaAjuste } from '../../src/ui/Ajustes'
import { BotonLateral, CabeceraLateral } from '../../src/ui/CabeceraLateral'
import { BotonVolver } from '../../src/ui/BotonVolver'
import { Hoja, usePisoHoja } from '../../src/ui/Hoja'
import { Menu } from '../../src/ui/Menu'
import { SearchField } from '../../src/ui/SearchField'
import { ScrollArea as ScrollView } from '../../src/ui/ScrollArea'
import { artworkSource } from '../../src/lib/artwork'
import { ICON_COLOR, IconDisk, IconDownload, IconMusic, IconPlay, IconWifi } from '../../src/ui/icons'
import {
  cargarDescargas, formatoBytes, HAY_DESCARGAS, limpiarCache, quitarDescarga, reanudarDescargas,
  setLimiteCacheMB, useDescargas,
} from '../../src/state/descargas'
import { setPrecargaAutomatica, setPrecargaDatos, setSoloWifi, useAjustes } from '../../src/state/ajustes'
import { playQueue } from '../../src/state/playback'
import { avisar } from '../../src/state/aviso'
import { usePiso } from '../../src/state/shell'
import { volver } from '../../src/lib/volver'
import {
  colaDescargada, DETALLE_PRECARGA_SESION, DETALLE_RED_PC, estadoDescarga, inventarioDescargas, LIMITES_CACHE_MB, menuDescarga,
  type EntradaDescarga,
} from '../../src/ui/descargasControl'

/** Un inventario local: buscar y reproducir no requiere consultar la biblioteca. */
export default function Descargas() {
  const router = useRouter()
  const ajustes = useAjustes()
  const { items, esperandoWifi, esperandoRed, limiteCacheMB, cargado, error: errorDescargas } = useDescargas()
  const [filtro, setFiltro] = useState('')
  const ancho = useWindowDimensions().width >= 780
  const piso = usePiso(24)
  const pisoHoja = usePisoHoja(24)
  const inventario = useMemo(() => inventarioDescargas(items), [items])
  const visibles = useMemo(() => inventarioDescargas(items, filtro), [items, filtro])
  const manuales = inventario.filter(e => !e.descarga.temporal)
  const temporales = inventario.filter(e => e.descarga.temporal)
  const bytesCache = temporales.reduce((n, e) => n + e.descarga.bytes, 0)
  const bytesManual = manuales.reduce((n, e) => n + e.descarga.bytes, 0)
  const cola = useMemo(() => colaDescargada(visibles), [visibles])
  const secciones = [
    { title: 'Descargas', data: visibles.filter(e => !e.descarga.temporal), total: manuales.length, bytes: bytesManual },
    { title: 'Caché temporal', data: visibles.filter(e => e.descarga.temporal), total: temporales.length, bytes: bytesCache },
  ]
  const cerrar = () => volver(router, '/ajustes')
  const reproducir = (clave?: string) => {
    const index = clave ? cola.findIndex(e => e.clave === clave) : 0
    if (index < 0 || !cola.length) return
    playQueue(cola.map(e => e.track), index, null)
  }
  const preferencias = <View className="gap-5">
    {HAY_DESCARGAS ? <GrupoAjustes titulo="Descargas manuales" pie="Se conservan hasta que las quites. Pausar mantiene las canciones que ya terminaron.">
      <FilaInterruptor iconoPlano rotulo="Descargar solo con Wi-Fi"
        detalle={Platform.OS === 'web' ? DETALLE_RED_PC : esperandoWifi ? 'Hay canciones esperando Wi-Fi. Podés reanudarlas al conectarte.' : undefined}
        icono={<IconWifi size={16} color={ICON_COLOR.muted} />} activo={ajustes.soloWifi}
        onCambiar={v => { setSoloWifi(v); reanudarDescargas() }} ultima />
    </GrupoAjustes> : null}
    <GrupoAjustes titulo={HAY_DESCARGAS ? 'Caché automática' : 'Precarga'} pie={HAY_DESCARGAS ? 'Prepara música para reducir las esperas. El espacio se reutiliza automáticamente; tus descargas manuales se conservan.' : DETALLE_PRECARGA_SESION}>
      <FilaInterruptor iconoPlano rotulo="Precarga automática" activo={ajustes.precargaAutomatica}
        icono={<IconDownload size={16} color={ICON_COLOR.muted} />}
        onCambiar={v => { setPrecargaAutomatica(v); if (HAY_DESCARGAS) reanudarDescargas() }} />
      <FilaInterruptor iconoPlano rotulo="Precargar con datos móviles" activo={ajustes.precargaDatos}
        icono={<IconWifi size={16} color={ICON_COLOR.muted} />}
        onCambiar={v => { setPrecargaDatos(v); if (HAY_DESCARGAS) reanudarDescargas() }} ultima />
    </GrupoAjustes>
    {HAY_DESCARGAS ? <View className="gap-3 px-3">
      <View className="flex-row items-center gap-2.5">
        <IconDisk size={16} color={ICON_COLOR.muted} />
        <Text className="min-w-0 flex-1 text-foreground text-subheadline">Límite de caché</Text>
        <Menu label="Elegir límite de caché" items={LIMITES_CACHE_MB.map(n => ({
          label: `${n} MB`, selected: limiteCacheMB === n, onPress: () => setLimiteCacheMB(n),
        }))} trigger={<View className="min-h-[44px] justify-center px-2"><Text className="text-foreground text-subheadline">{limiteCacheMB} MB</Text></View>} />
      </View>
      <Text className="text-muted-foreground text-footnote">{formatoBytes(bytesCache)} de caché · {formatoBytes(bytesManual)} de descargas</Text>
      <Menu label="Opciones de almacenamiento" items={[
        { label: 'Limpiar caché temporal', disabled: !temporales.length, destructive: true, sfSymbol: 'trash', onPress: () => {
          limpiarCache(); avisar('Limpiando la caché temporal. Tus descargas se conservan.')
        } },
        { label: 'Quitar descargas terminadas', disabled: !manuales.some(e => e.descarga.estado === 'lista'), destructive: true, sfSymbol: 'trash', onPress: () => {
          manuales.filter(e => e.descarga.estado === 'lista').forEach(e => quitarDescarga(e.clave))
        } },
      ]} />
    </View> : null}
  </View>
  const botonReproducir = HAY_DESCARGAS ? <BotonLateral label="Reproducir disponibles sin conexión" disabled={!cola.length} onPress={() => reproducir()}
    icono={<IconPlay size={16} color={ICON_COLOR.foreground} />} /> : null
  if (Platform.OS === 'ios') {
    return <>
      <Stack.Screen options={{ presentation: 'formSheet', sheetAllowedDetents: [1], sheetGrabberVisible: true }} />
      <SafeAreaView className="min-h-0 flex-1 bg-background" edges={['bottom']}>
        <View className="flex-row items-center gap-2 px-3 py-1"><BotonVolver label="Volver a Ajustes" onPress={cerrar} /><Text accessibilityRole="header" className="flex-1 text-foreground text-body font-semibold">Descargas y caché</Text></View>
        <View className="px-4 py-2"><SearchField value={filtro} onChangeText={setFiltro} placeholder="Buscar por canción o artista" accessibilityLabel="Buscar descargas y caché" /></View>
        <ListaAjustes piso={pisoHoja}>
          <GrupoAjustes titulo="Descargas manuales" pie={esperandoWifi ? 'Hay canciones esperando Wi-Fi.' : 'Las descargas manuales se conservan hasta que las quites.'}>
            <FilaInterruptor rotulo="Descargar solo con Wi-Fi" activo={ajustes.soloWifi} onCambiar={v => { setSoloWifi(v); reanudarDescargas() }} />
            <FilaAccion rotulo="Reproducir disponibles sin conexión" disabled={!cola.length} onPress={() => reproducir()} ultima />
          </GrupoAjustes>
          <GrupoAjustes titulo="Caché automática" pie="Prepara música para reducir las esperas. La caché se reutiliza automáticamente; tus descargas manuales se conservan.">
            <FilaInterruptor rotulo="Precarga automática" activo={ajustes.precargaAutomatica} onCambiar={v => { setPrecargaAutomatica(v); reanudarDescargas() }} />
            <FilaInterruptor rotulo="Precargar con datos móviles" activo={ajustes.precargaDatos} onCambiar={v => { setPrecargaDatos(v); reanudarDescargas() }} />
            <FilaOpciones rotulo="Límite de caché" valor={limiteCacheMB} opciones={LIMITES_CACHE_MB.map(n => ({ value: n, label: `${n} MB` }))} onElegir={setLimiteCacheMB} />
            <FilaDato rotulo="Caché utilizada" valor={formatoBytes(bytesCache)} />
            <FilaDato rotulo="Descargas utilizadas" valor={formatoBytes(bytesManual)} />
            <FilaAccion rotulo="Limpiar caché temporal" disabled={!temporales.length} onPress={() => { limpiarCache(); avisar('Limpiando la caché temporal. Tus descargas se conservan.') }} />
            <FilaAccion rotulo="Quitar descargas terminadas" disabled={!manuales.some(e => e.descarga.estado === 'lista')} onPress={() => { manuales.filter(e => e.descarga.estado === 'lista').forEach(e => quitarDescarga(e.clave)) }} ultima />
          </GrupoAjustes>
          {!cargado || errorDescargas ? <GrupoAjustes error={errorDescargas}>
            <FilaAccion rotulo={errorDescargas ? 'Reintentar lectura' : 'Leyendo descargas…'} busy={!cargado && !errorDescargas} onPress={() => { void cargarDescargas() }} ultima />
          </GrupoAjustes> : null}
          {cargado && !visibles.length ? <GrupoAjustes><FilaDato rotulo={filtro.trim() ? 'No hay canciones que coincidan' : 'Todavía no hay descargas'} valor="" ultima /></GrupoAjustes> : null}
          {secciones.map(seccion => !seccion.data.length ? null : <GrupoAjustes key={seccion.title} titulo={seccion.title} pie={`${seccion.total} canciones · ${formatoBytes(seccion.bytes)}`}>
            {seccion.data.map(item => {
              const d = item.descarga
              const disponible = d.estado === 'lista' && !!d.audioPath
              const opciones = menuDescarga(item)
              const arte = artworkSource(d.artworkPath, d.track?.artworkUrl ?? d.artworkUrl ?? null, 96)
              return <Fragment key={item.clave}>
                <FilaAjuste rotulo={d.title} detalle={`${d.artist} · ${estadoDescarga(d, esperandoWifi, esperandoRed)}`} valor={disponible ? formatoBytes(d.bytes) : ''} vacio="" disabled={!disponible} onPress={() => reproducir(item.clave)}
                  icono={arte ? <Image source={{ uri: arte }} style={{ width: 24, height: 24, borderRadius: 4 }} /> : <IconMusic size={20} color={ICON_COLOR.muted} />} />
                <FilaOpciones rotulo={`Opciones de ${d.title}`} valor={null} opciones={opciones.map((o, i) => ({ value: i, label: o.label, sfSymbol: o.sfSymbol, destructive: o.destructive }))} onElegir={i => opciones[i]?.onPress?.()} ultima />
              </Fragment>
            })}
          </GrupoAjustes>)}
        </ListaAjustes>
      </SafeAreaView>
    </>
  }
  const contenido = <SafeAreaView className="min-h-0 flex-1 bg-background" edges={ancho ? ['top', 'bottom'] : []}>
    <View className="flex-row items-center gap-2 px-3 py-1">
      <BotonVolver label="Volver a Ajustes" onPress={cerrar} />
      <Text accessibilityRole="header" className="min-w-0 flex-1 text-foreground text-body font-semibold">Descargas y caché</Text>
      {ancho ? botonReproducir : null}
    </View>
    {!HAY_DESCARGAS ? <Panel className="min-h-0 flex-1">
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: ancho ? piso : pisoHoja }}>
        <View className="w-full self-center" style={{ maxWidth: 640 }}>{preferencias}</View>
      </ScrollView>
    </Panel> :
      <View className={`min-h-0 flex-1 ${ancho ? 'flex-row' : ''}`}>
        {ancho ? <Panel tone="lateral" style={{ width: 340 }}>
          <CabeceraLateral titulo="Almacenamiento" />
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: piso }}>{preferencias}</ScrollView>
        </Panel> : null}
        <Panel className="min-h-0 min-w-0 flex-1">
          <SectionList sections={secciones} keyExtractor={e => e.clave} stickySectionHeadersEnabled={false}
            keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: ancho ? piso : pisoHoja }}
            ListHeaderComponent={<View className="gap-6 pb-4">
              {!ancho ? preferencias : null}
              <View className="flex-row items-center gap-2">
                <View className="min-w-0 flex-1"><SearchField value={filtro} onChangeText={setFiltro} placeholder="Buscar por canción o artista" accessibilityLabel="Buscar descargas y caché" /></View>
                {!ancho ? botonReproducir : null}
              </View>
              {!cargado && !errorDescargas ? <ActivityIndicator accessibilityLabel="Leyendo descargas" color={ICON_COLOR.muted} /> : null}
              {errorDescargas ? <View className="gap-2">
                <Text accessibilityLiveRegion="polite" className="text-muted-foreground text-footnote">{errorDescargas}</Text>
                {!cargado ? <Pressable accessibilityRole="button" accessibilityLabel="Reintentar lectura"
                  onPress={() => void cargarDescargas()} className="min-h-[44px] self-start justify-center rounded-full bg-muted px-4 active:opacity-70">
                  <Text className="text-foreground text-subheadline font-semibold">Reintentar lectura</Text>
                </Pressable> : null}
              </View> : null}
              {cargado && !visibles.length ? <Text className="text-muted-foreground text-footnote">{filtro.trim() ? 'No hay canciones que coincidan.' : 'Descargá canciones desde sus menús para escucharlas sin conexión.'}</Text> : null}
            </View>}
            renderSectionHeader={({ section }) => <View className="flex-row items-center justify-between gap-2 pb-2 pt-4">
              <Text accessibilityRole="header" className="text-foreground text-subheadline font-semibold">{section.title}</Text>
              <Text className="text-muted-foreground text-caption1">{section.total} · {formatoBytes(section.bytes)}</Text>
            </View>}
            renderItem={({ item }) => <Fila item={item} esperandoWifi={esperandoWifi} esperandoRed={esperandoRed} onPlay={() => reproducir(item.clave)} />} />
        </Panel>
      </View>}
  </SafeAreaView>
  return <>
    <Stack.Screen options={{ presentation: ancho ? 'card' : 'formSheet', sheetAllowedDetents: [1], sheetGrabberVisible: true }} />
    {ancho ? contenido : <Hoja titulo="Descargas y caché" onCerrar={cerrar}>{contenido}</Hoja>}
  </>
}

function Fila({ item, esperandoWifi, esperandoRed, onPlay }: { item: EntradaDescarga; esperandoWifi: boolean; esperandoRed: boolean; onPlay: () => void }) {
  const d = item.descarga
  const arte = artworkSource(d.artworkPath, d.track?.artworkUrl ?? d.artworkUrl ?? null, 96)
  const disponible = d.estado === 'lista' && !!d.audioPath
  return <View className="flex-row items-center gap-2 py-1">
    <Pressable accessibilityRole="button" accessibilityLabel={`Reproducir ${d.title} sin conexión`}
      disabled={!disponible} accessibilityState={{ disabled: !disponible }} onPress={onPlay}
      className="min-h-[52px] min-w-0 flex-1 flex-row items-center gap-3 rounded-md active:bg-muted">
      {arte ? <Image source={{ uri: arte }} style={{ width: 44, height: 44 }} className="rounded" /> :
        <View style={{ width: 44, height: 44 }} className="items-center justify-center"><IconMusic size={16} color={ICON_COLOR.muted} /></View>}
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-foreground text-subheadline" numberOfLines={1}>{d.title}</Text>
        <Text className="text-muted-foreground text-caption1" numberOfLines={1}>{d.artist}</Text>
        <Text className="text-muted-foreground text-caption1" numberOfLines={2}>{estadoDescarga(d, esperandoWifi, esperandoRed)}{disponible ? ` · ${formatoBytes(d.bytes)}` : ''}</Text>
      </View>
    </Pressable>
    <Menu label={`Opciones de descarga de ${d.title}`} items={menuDescarga(item)} size={16} />
  </View>
}
