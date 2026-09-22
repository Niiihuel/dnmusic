import { useEffect, useState } from 'react'
import { View, useWindowDimensions } from 'react-native'
import { useRouter } from 'expo-router'
import { Button, Host, HStack, Image, List, Menu, NavigationStack, RNHostView, Section, Slider, Spacer, Text, Toggle, Toolbar, VStack } from '@expo/ui/swift-ui'
import { accessibilityLabel, accessibilityValue, buttonStyle, disabled, font, foregroundStyle, frame, listRowBackground, listRowInsets, listRowSeparator, listStyle, navigationTitle, scrollContentBackground, tint, toggleStyle } from '@expo/ui/swift-ui/modifiers'
import { cargarEcualizador, elegirPresetEcualizador, FRECUENCIAS_EQ, guardarEcualizadorAhora, PRESETS_EQ, reintentarEcualizador, restablecerEcualizador, setEcualizadorActivo, setGananciaEcualizador, useEcualizador, useSoporteEcualizador } from '../state/ecualizador'
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
  const { width } = useWindowDimensions()
  const piso = usePiso(24)
  const ancho = Math.max(180, width - 40)
  const remoto = !!otroDispositivo || jamSilencioso
  const noDisponible = soporte === 'no-disponible' || soporte === 'error'
  const bloqueado = !estado.cargado || remoto || noDisponible
  const edicionBloqueada = bloqueado || !estado.activo
  const ganancia = estado.ganancias[banda] ?? 0
  const aviso = !estado.cargado ? 'Cargando tus ajustes…'
    : remoto ? `El audio está sonando en ${otroDispositivo ?? 'otro dispositivo'}. Ajustá el ecualizador allí.`
      : soporte === 'no-disponible' ? 'Esta versión de la app necesita una actualización para ecualizar el audio.'
        : soporte === 'error' ? 'No se pudo aplicar el ecualizador. Podés reintentar sin perder tu curva.'
          : 'Solo cambia el sonido de dnmusic en este iPhone.'

  useEffect(() => { void cargarEcualizador(); return () => { void guardarEcualizadorAhora() } }, [])

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
              <HStack modifiers={[listRowBackground(FILA)]}><Text>{estado.preset}</Text><Spacer /><Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle(MUTED)]}>10 bandas</Text></HStack>
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
              {PRESETS.map(preset => <Button key={preset} onPress={() => elegirPresetEcualizador(preset)}
                modifiers={[listRowBackground(FILA), buttonStyle('plain'), disabled(edicionBloqueada), accessibilityValue(estado.preset === preset ? 'Seleccionado' : '')]}>
                <HStack modifiers={[frame({ minHeight: 44 })]}><Text>{preset}</Text><Spacer />{estado.preset === preset ? <Image systemName="checkmark" size={17} /> : null}</HStack>
              </Button>)}
            </Section>
            <Section>
              <Button label="Restablecer curva" onPress={restablecerEcualizador} modifiers={[listRowBackground(FILA), disabled(bloqueado || estado.preset === 'Plano')]} />
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
