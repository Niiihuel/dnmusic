import { useEffect, useState } from 'react'
import { Alert, AppState, View, useWindowDimensions } from 'react-native'
import { useRouter } from 'expo-router'
import { Button, Host, HStack, Image, List, Menu, NavigationStack, RNHostView, Section, Slider, Spacer, Text, TextField, Toggle, Toolbar, VStack, useNativeState } from '@expo/ui/swift-ui'
import { accessibilityLabel, accessibilityValue, buttonStyle, disabled, font, foregroundStyle, frame, listRowBackground, listRowInsets, listRowSeparator, listStyle, navigationTitle, scrollContentBackground, tint, toggleStyle } from '@expo/ui/swift-ui/modifiers'
import { cancelarComparacionEcualizador, cargarEcualizador, crearPresetPersonalEcualizador, elegirPresetEcualizador, elegirPresetPersonalEcualizador, eliminarPresetPersonalEcualizador, FRECUENCIAS_EQ, guardarEcualizadorAhora, iniciarComparacionEcualizador, nombrePresetEcualizador, PRESETS_EQ, reintentarEcualizador, renombrarPresetPersonalEcualizador, restablecerEcualizador, seleccionarComparacionEcualizador, setEcualizadorActivo, setGananciaEcualizador, usarComparacionEcualizador, useEcualizador, useSoporteEcualizador } from '../state/ecualizador'
import { useEscuchaEspejoNombre } from '../state/escucha'
import { useJamSilencioso } from '../state/jam'
import { usePiso } from '../state/shell'
import { volver } from '../lib/volver'
import { BordeScrollNativo } from './CollectionScrollEdge'
import { CurvaEcualizador } from './CurvaEcualizador'
import { decibeliosEQ, EQ_GRAPH_HEIGHT, frecuenciaEQ } from './ecualizadorGeometry'

const PRESETS = Object.keys(PRESETS_EQ) as (keyof typeof PRESETS_EQ)[]
const FILA = '#181818', MUTED = '#B3B3B3'

export default function Ecualizador() {
  const router = useRouter()
  const estado = useEcualizador()
  const soporte = useSoporteEcualizador()
  const otroDispositivo = useEscuchaEspejoNombre()
  const jamSilencioso = useJamSilencioso()
  const [banda, setBanda] = useState(5)
  const nombre = useNativeState('')
  const [nombreValido, setNombreValido] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { width } = useWindowDimensions()
  const piso = usePiso(24)
  const ancho = Math.max(180, width - 40)
  const remoto = !!otroDispositivo || jamSilencioso
  const noDisponible = soporte === 'no-disponible' || soporte === 'error'
  const bloqueado = !estado.cargado || remoto || noDisponible
  const edicionBloqueada = bloqueado || !estado.activo
  const ganancia = estado.ganancias[banda] ?? 0
  const seleccionado = estado.presetsPersonales.find(item => item.id === estado.presetPersonalId)
  const aviso = !estado.cargado ? 'Cargando tus ajustes…'
    : remoto ? `El audio está sonando en ${otroDispositivo ?? 'otro dispositivo'}. Ajustá el ecualizador allí.`
      : soporte === 'no-disponible' ? 'Esta versión de la app necesita una actualización para ecualizar el audio.'
        : soporte === 'error' ? 'No se pudo aplicar el ecualizador. Podés reintentar sin perder tu curva.'
          : 'Solo cambia el sonido de dnmusic en este iPhone.'

  useEffect(() => {
    void cargarEcualizador()
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') { cancelarComparacionEcualizador(); void guardarEcualizadorAhora() }
    })
    return () => { sub.remove(); cancelarComparacionEcualizador(); void guardarEcualizadorAhora() }
  }, [])

  const guardarPersonal = () => {
    const resultado = crearPresetPersonalEcualizador(nombre.get())
    setError(resultado)
    if (!resultado) { nombre.set(''); setNombreValido(false) }
  }
  const renombrarPersonal = () => {
    if (!seleccionado) return
    const resultado = renombrarPresetPersonalEcualizador(seleccionado.id, nombre.get())
    setError(resultado)
    if (!resultado) { nombre.set(''); setNombreValido(false) }
  }

  return <View style={{ flex: 1, backgroundColor: '#121212' }}>
    <Host style={{ flex: 1 }} colorScheme="dark" seedColor="#FFFFFF">
      <NavigationStack>
        <Toolbar>
          <List modifiers={[navigationTitle('Ecualizador'), listStyle('insetGrouped'), scrollContentBackground('hidden'), tint('#FFFFFF')]}>
            <Section footer={<Text>{aviso}</Text>}>
              <Toggle isOn={estado.activo} onIsOnChange={setEcualizadorActivo}
                modifiers={[listRowBackground(FILA), toggleStyle('switch'), tint('#34C759'), disabled(bloqueado)]}>
                <Text>Activar ecualizador</Text>
              </Toggle>
              {soporte === 'error' ? <Button label="Reintentar" onPress={reintentarEcualizador} modifiers={[listRowBackground(FILA), disabled(remoto)]} /> : null}
            </Section>
            <Section title="Sonido" footer={<Text>{estado.activo ? 'Tocá una banda y arrastrá hacia arriba o abajo. El nivel se compensa para reducir la saturación.' : 'Activá el ecualizador para ajustar el sonido. Tu curva queda guardada.'}</Text>}>
              <HStack modifiers={[listRowBackground(FILA)]}><Text>{nombrePresetEcualizador(estado)}</Text><Spacer /><Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle(MUTED)]}>10 bandas</Text></HStack>
              <VStack modifiers={[listRowInsets({ top: 0, bottom: 0, leading: 0, trailing: 0 }), listRowBackground(FILA), listRowSeparator('hidden'), frame({ height: EQ_GRAPH_HEIGHT })]}>
                <RNHostView matchContents><CurvaEcualizador ancho={ancho} ganancias={estado.ganancias} seleccionada={banda} onSeleccionar={setBanda} disabled={edicionBloqueada} /></RNHostView>
              </VStack>
              <VStack spacing={8} modifiers={[listRowBackground(FILA)]}>
                <HStack>
                  <Menu label={<HStack spacing={6}><Text>{frecuenciaEQ(FRECUENCIAS_EQ[banda])}</Text><Image systemName="chevron.up.chevron.down" size={11} /></HStack>}>
                    {FRECUENCIAS_EQ.map((hz, index) => <Button key={hz} label={frecuenciaEQ(hz)} systemImage={index === banda ? 'checkmark' : undefined} onPress={() => setBanda(index)} />)}
                  </Menu>
                  <Spacer /><Text modifiers={[font({ textStyle: 'body', weight: 'semibold' })]}>{decibeliosEQ(ganancia)}</Text>
                </HStack>
                <Slider key={banda} min={-12} max={12} step={0.5} value={ganancia}
                  onValueChange={value => { if (!edicionBloqueada) setGananciaEcualizador(banda, value) }}
                  onEditingChanged={editing => { if (!editing) void guardarEcualizadorAhora() }}
                  minimumValueLabel={<Text modifiers={[font({ textStyle: 'caption' }), foregroundStyle(MUTED)]}>−12</Text>}
                  maximumValueLabel={<Text modifiers={[font({ textStyle: 'caption' }), foregroundStyle(MUTED)]}>+12</Text>}
                  modifiers={[disabled(edicionBloqueada), accessibilityLabel(`Ganancia de ${frecuenciaEQ(FRECUENCIAS_EQ[banda])}`), accessibilityValue(decibeliosEQ(ganancia)), frame({ minHeight: 44 })]} />
              </VStack>
            </Section>
            <Section title="Preajustes">
              {PRESETS.map(preset => <Button key={preset} onPress={() => { elegirPresetEcualizador(preset); nombre.set(''); setNombreValido(false); setError(null) }}
                modifiers={[listRowBackground(FILA), buttonStyle('plain'), disabled(edicionBloqueada), accessibilityValue(estado.preset === preset && !estado.presetPersonalId ? 'Seleccionado' : '')]}>
                <HStack modifiers={[frame({ minHeight: 44 })]}><Text>{preset}</Text><Spacer />{estado.preset === preset && !estado.presetPersonalId ? <Image systemName="checkmark" size={17} /> : null}</HStack>
              </Button>)}
            </Section>
            <Section title="Tus preajustes" footer={<Text modifiers={error ? [foregroundStyle('#FF6961')] : []}>{error ?? 'Guardá la curva actual con un nombre. Editarla después no cambia el preajuste guardado.'}</Text>}>
              {estado.presetsPersonales.map(personal => <Button key={personal.id} onPress={() => {
                elegirPresetPersonalEcualizador(personal.id); nombre.set(personal.nombre); setNombreValido(true); setError(null)
              }} modifiers={[listRowBackground(FILA), buttonStyle('plain'), disabled(edicionBloqueada), accessibilityValue(estado.presetPersonalId === personal.id ? 'Seleccionado' : '')]}>
                <HStack modifiers={[frame({ minHeight: 44 })]}><Text>{personal.nombre}</Text><Spacer />{estado.presetPersonalId === personal.id ? <Image systemName="checkmark" size={17} /> : null}</HStack>
              </Button>)}
              <TextField text={nombre} placeholder="Nombre del preajuste" maxLength={40}
                onTextChange={value => { setNombreValido(!!value.trim()); setError(null) }}
                modifiers={[listRowBackground(FILA), disabled(edicionBloqueada || !!estado.comparacion), accessibilityLabel('Nombre del preajuste')]} />
              <Button label="Guardar como nuevo" onPress={guardarPersonal} modifiers={[listRowBackground(FILA), disabled(edicionBloqueada || !!estado.comparacion || !nombreValido)]} />
              {seleccionado ? <Button label={`Renombrar «${seleccionado.nombre}»`} onPress={renombrarPersonal}
                modifiers={[listRowBackground(FILA), disabled(edicionBloqueada || !!estado.comparacion || !nombreValido)]} /> : null}
              {seleccionado ? <Button label={`Eliminar «${seleccionado.nombre}»`} role="destructive" onPress={() => Alert.alert('Eliminar preajuste', `¿Querés eliminar «${seleccionado.nombre}»?`, [
                { text: 'Cancelar', style: 'cancel' }, { text: 'Eliminar', style: 'destructive', onPress: () => eliminarPresetPersonalEcualizador(seleccionado.id) },
              ])} modifiers={[listRowBackground(FILA), disabled(edicionBloqueada || !!estado.comparacion)]} /> : null}
            </Section>
            <Section title="Comparar A/B" footer={<Text>A y B son temporales. Escuchá y editá cada curva; al salir sin usar una, vuelve la anterior.</Text>}>
              {estado.comparacion ? <>
                <Button label="Escuchar A" onPress={() => seleccionarComparacionEcualizador('A')} modifiers={[listRowBackground(FILA), disabled(bloqueado), accessibilityValue(estado.comparacion.seleccion === 'A' ? 'Seleccionado' : '')]} />
                <Button label="Escuchar B" onPress={() => seleccionarComparacionEcualizador('B')} modifiers={[listRowBackground(FILA), disabled(bloqueado), accessibilityValue(estado.comparacion.seleccion === 'B' ? 'Seleccionado' : '')]} />
                <Button label={`Usar curva ${estado.comparacion.seleccion}`} onPress={usarComparacionEcualizador} modifiers={[listRowBackground(FILA), disabled(bloqueado)]} />
                <Button label="Descartar comparación" role="cancel" onPress={cancelarComparacionEcualizador} modifiers={[listRowBackground(FILA)]} />
              </> : <Button label="Iniciar comparación" onPress={iniciarComparacionEcualizador} modifiers={[listRowBackground(FILA), disabled(edicionBloqueada)]} />}
            </Section>
            <Section>
              <Button label="Restablecer curva" onPress={restablecerEcualizador} modifiers={[listRowBackground(FILA), disabled(edicionBloqueada || (estado.preset === 'Plano' && !estado.presetPersonalId))]} />
            </Section>
            <Text modifiers={[frame({ height: piso }), listRowBackground('clear'), listRowSeparator('hidden'), accessibilityLabel('')]}>{' '}</Text>
          </List>
          <Toolbar.Content><Button label="Volver" role="cancel" systemImage="chevron.left" onPress={() => volver(router, '/ajustes?seccion=reproduccion' as never)} /></Toolbar.Content>
        </Toolbar>
      </NavigationStack>
    </Host>
    <BordeScrollNativo nativeNavigation />
  </View>
}
