import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Text, View } from 'react-native'
import { BotonVolver } from './BotonVolver'
import { EncabezadoHoja } from './EncabezadoHoja'
import { FilaAccion, FilaInterruptor, FilaOpciones, GrupoAjustes, ListaAjustes } from './Ajustes'
import { SeekBar } from './SeekBar'
import { ICON_COLOR, IconSliders } from './icons'
import { FRECUENCIAS_EQ, GANANCIA_EQ_MAX, GANANCIA_EQ_MIN, PRESETS_EQ, elegirPresetEcualizador, restablecerEcualizador, setEcualizadorActivo, setGananciaEcualizador, useEcualizador, type PresetEcualizador } from '../state/ecualizador'
import { usePiso } from '../state/shell'
import { volver } from '../lib/volver'

const nombresFrecuencia = (hz: number) => hz >= 1000 ? `${hz / 1000} kHz` : `${hz} Hz`

export default function Ecualizador() {
  const router = useRouter()
  const piso = usePiso(24)
  const estado = useEcualizador()
  const presets = Object.keys(PRESETS_EQ) as (keyof typeof PRESETS_EQ)[]

  return <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: '#121212' }}>
    <EncabezadoHoja titulo="Ecualizador" izquierda={<BotonVolver label="Volver a configuración" onPress={() => volver(router, '/ajustes')} />} />
    <ListaAjustes piso={piso}>
      <GrupoAjustes pie="Se aplica solo a DMusic en este dispositivo. Los cambios se oyen al instante y se conservan al cerrar la app.">
        <FilaInterruptor rotulo="Ecualizador" detalle={estado.activo ? 'Procesando la salida de audio' : 'La música sale sin modificar'}
          icono={<IconSliders size={17} color={ICON_COLOR.muted} />} activo={estado.activo} onCambiar={setEcualizadorActivo} ultima />
      </GrupoAjustes>

      <GrupoAjustes titulo="Curva" pie="Cada control ajusta ±12 dB. En Android la curva se adapta a las bandas que ofrece el dispositivo.">
        <FilaOpciones<PresetEcualizador> rotulo="Preset" valor={estado.preset} opciones={[...presets.map(value => ({ value: value as PresetEcualizador, label: value, sfSymbol: value === estado.preset ? 'checkmark' as const : 'slider.horizontal.3' as const })),
          { value: 'Personalizado', label: 'Personalizado', sfSymbol: 'slider.horizontal.3' as const }]}
          onElegir={preset => { if (preset !== 'Personalizado') elegirPresetEcualizador(preset) }} ultima />
        <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, opacity: estado.activo ? 1 : 0.55 }}>
          {FRECUENCIAS_EQ.map((frecuencia, indice) => {
            const ganancia = estado.ganancias[indice] ?? 0
            const progress = (ganancia - GANANCIA_EQ_MIN) / (GANANCIA_EQ_MAX - GANANCIA_EQ_MIN)
            return <View key={frecuencia} style={{ minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text style={{ width: 55, color: '#B3B3B3', fontSize: 13, fontVariant: ['tabular-nums'] }}>{nombresFrecuencia(frecuencia)}</Text>
              <View style={{ flex: 1 }}><SeekBar label={nombresFrecuencia(frecuencia)} progress={progress} elapsedMs={0} totalMs={1} compact envivo
                onSeek={fraccion => setGananciaEcualizador(indice, GANANCIA_EQ_MIN + fraccion * (GANANCIA_EQ_MAX - GANANCIA_EQ_MIN))} /></View>
              <Text style={{ width: 48, textAlign: 'right', color: '#FFFFFF', fontSize: 13, fontVariant: ['tabular-nums'] }}>{ganancia > 0 ? '+' : ''}{ganancia.toFixed(1)}</Text>
            </View>
          })}
        </View>
        <FilaAccion rotulo="Restablecer curva plana" onPress={restablecerEcualizador} disabled={estado.preset === 'Plano'} ultima />
      </GrupoAjustes>
    </ListaAjustes>
  </SafeAreaView>
}
