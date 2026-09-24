import { useEffect, useState } from 'react'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Alert, AppState, Text, View } from 'react-native'
import { Slider } from '@expo/ui/jetpack-compose'
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers'
import { BotonVolver } from './BotonVolver'
import { EncabezadoHoja } from './EncabezadoHoja'
import { FilaAccion, FilaInterruptor, FilaOpciones, FilaTexto, GrupoAjustes, ListaAjustes } from './Ajustes'
import { AndroidHost, ANDROID_COLORS, androidAccessibility } from './AndroidHost'
import { CurvaEcualizador } from './CurvaEcualizador'
import { decibeliosEQ, frecuenciaEQ } from './ecualizadorGeometry'
import { ICON_COLOR, IconSliders } from './icons'
import { cancelarComparacionEcualizador, cargarEcualizador, crearPresetPersonalEcualizador, elegirPresetEcualizador, elegirPresetPersonalEcualizador, eliminarPresetPersonalEcualizador, FRECUENCIAS_EQ, guardarEcualizadorAhora, iniciarComparacionEcualizador, nombrePresetEcualizador, PRESETS_EQ, reintentarEcualizador, renombrarPresetPersonalEcualizador, restablecerEcualizador, seleccionarComparacionEcualizador, setEcualizadorActivo, setGananciaEcualizador, usarComparacionEcualizador, useEcualizador, useSoporteEcualizador } from '../state/ecualizador'
import { useEscuchaEspejoNombre } from '../state/escucha'
import { useJamSilencioso } from '../state/jam'
import { usePiso } from '../state/shell'
import { volver } from '../lib/volver'

export default function Ecualizador() {
  const router = useRouter()
  const piso = usePiso(24)
  const estado = useEcualizador()
  const soporte = useSoporteEcualizador()
  const otroDispositivo = useEscuchaEspejoNombre()
  const jamSilencioso = useJamSilencioso()
  const [ancho, setAncho] = useState(0)
  const [banda, setBanda] = useState(5)
  const [arrastre, setArrastre] = useState<number | null>(null)
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState<string | null>(null)
  const presets = Object.keys(PRESETS_EQ) as (keyof typeof PRESETS_EQ)[]
  const remoto = !!otroDispositivo || jamSilencioso
  const bloqueado = !estado.cargado || remoto || soporte === 'no-disponible' || soporte === 'error'
  const edicionBloqueada = bloqueado || !estado.activo
  const seleccionado = estado.presetsPersonales.find(item => item.id === estado.presetPersonalId)
  const ganancia = arrastre ?? estado.ganancias[banda] ?? 0
  const seleccionarBanda = (indice: number) => { setBanda(indice); setArrastre(null) }
  const aviso = !estado.cargado ? 'Cargando tus ajustes…'
    : remoto ? `El audio está sonando en ${otroDispositivo ?? 'otro dispositivo'}. Ajustá el ecualizador allí.`
      : soporte === 'no-disponible' ? 'Esta versión de la app necesita una actualización para ecualizar el audio.'
        : soporte === 'error' ? 'No se pudo aplicar el ecualizador. Podés reintentar sin perder tu curva.'
          : 'Solo cambia el sonido de DMusic en este dispositivo.'
  const guardarPersonal = () => {
    const resultado = crearPresetPersonalEcualizador(nombre)
    setError(resultado)
    if (!resultado) setNombre('')
  }
  const renombrarPersonal = () => {
    if (!seleccionado) return
    const resultado = renombrarPresetPersonalEcualizador(seleccionado.id, nombre)
    setError(resultado)
    if (!resultado) setNombre('')
  }

  useEffect(() => {
    void cargarEcualizador()
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') { cancelarComparacionEcualizador(); void guardarEcualizadorAhora() }
    })
    return () => { sub.remove(); cancelarComparacionEcualizador(); void guardarEcualizadorAhora() }
  }, [])

  return <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: '#121212' }}>
    <EncabezadoHoja titulo="Ecualizador" izquierda={<BotonVolver label="Volver a configuración" onPress={() => volver(router, '/ajustes')} />} />
    <ListaAjustes piso={piso}>
      <GrupoAjustes pie={aviso}>
        <FilaInterruptor rotulo="Ecualizador" detalle={estado.activo ? 'Procesando la salida de audio' : 'La música sale sin modificar'}
          icono={<IconSliders size={17} color={ICON_COLOR.muted} />} activo={estado.activo} onCambiar={setEcualizadorActivo} disabled={bloqueado} ultima={soporte !== 'error'} />
        {soporte === 'error' ? <FilaAccion rotulo="Reintentar" onPress={reintentarEcualizador} disabled={remoto} ultima /> : null}
      </GrupoAjustes>

      <GrupoAjustes titulo="Sonido" pie={estado.activo ? 'Tocá una banda y arrastrá su punto para modificarla. El nivel se compensa para reducir la saturación.' : 'Activá el ecualizador para ajustar el sonido. Tu curva queda guardada.'}>
        <FilaOpciones<string> rotulo="Preajuste" valor={estado.presetPersonalId ?? estado.preset} opciones={[
          ...presets.map(value => ({ value, label: value, sfSymbol: value === estado.preset && !estado.presetPersonalId ? 'checkmark' as const : 'slider.horizontal.3' as const })),
          ...estado.presetsPersonales.map(item => ({ value: item.id, label: item.nombre, sfSymbol: item.id === estado.presetPersonalId ? 'checkmark' as const : 'slider.horizontal.3' as const })),
        ]} disabled={edicionBloqueada} onElegir={value => {
          const personal = estado.presetsPersonales.find(item => item.id === value)
          if (personal) { elegirPresetPersonalEcualizador(personal.id); setNombre(personal.nombre) }
          else if (value !== 'Personalizado') { elegirPresetEcualizador(value as keyof typeof PRESETS_EQ); setNombre('') }
          setError(null)
        }} ultima />
        <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <Text style={{ color: ANDROID_COLORS.text, fontSize: 17, fontWeight: '600' }}>{nombrePresetEcualizador(estado)}</Text>
            <Text style={{ color: ANDROID_COLORS.muted, fontSize: 12 }}>10 bandas · ±12 dB</Text>
          </View>
          <View onLayout={event => setAncho(event.nativeEvent.layout.width)} style={{ marginTop: 8 }}>
            {ancho > 0 ? <CurvaEcualizador ancho={ancho} ganancias={estado.ganancias} seleccionada={banda}
              onSeleccionar={seleccionarBanda} disabled={edicionBloqueada} /> : null}
          </View>
        </View>
        <FilaOpciones<number> rotulo="Banda" valor={banda}
          opciones={FRECUENCIAS_EQ.map((hz, index) => ({ value: index, label: frecuenciaEQ(hz) }))}
          onElegir={seleccionarBanda} disabled={edicionBloqueada} />
        <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12, opacity: edicionBloqueada ? 0.45 : 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: ANDROID_COLORS.muted, fontSize: 14 }}>Ganancia</Text>
            <Text style={{ color: ANDROID_COLORS.text, fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{decibeliosEQ(ganancia)}</Text>
          </View>
          <AndroidHost style={{ width: '100%', minHeight: 48 }} matchContents={{ vertical: true }}>
            <Slider min={-12} max={12} steps={47} value={ganancia} enabled={!edicionBloqueada}
              colors={{ thumbColor: ANDROID_COLORS.text, activeTrackColor: ANDROID_COLORS.text, inactiveTrackColor: ANDROID_COLORS.raised }}
              modifiers={[fillMaxWidth(), androidAccessibility(`Ganancia de ${frecuenciaEQ(FRECUENCIAS_EQ[banda])}`, decibeliosEQ(ganancia))]}
              onValueChange={value => {
                if (edicionBloqueada || !Number.isFinite(value)) return
                setArrastre(Math.round(value * 2) / 2)
                setGananciaEcualizador(banda, value)
              }}
              onValueChangeFinished={() => { setArrastre(null); void guardarEcualizadorAhora() }} />
          </AndroidHost>
          <View pointerEvents="none" style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: ANDROID_COLORS.muted, fontSize: 12 }}>−12 dB</Text>
            <Text style={{ color: ANDROID_COLORS.muted, fontSize: 12 }}>+12 dB</Text>
          </View>
        </View>
        <FilaAccion rotulo="Restablecer curva plana" onPress={restablecerEcualizador} disabled={edicionBloqueada || (estado.preset === 'Plano' && !estado.presetPersonalId)} ultima />
      </GrupoAjustes>

      <GrupoAjustes titulo="Tus preajustes" pie="Guardá la curva actual con un nombre. Editar una banda no cambia el preajuste guardado." error={error ?? undefined}>
        <FilaTexto rotulo="Nombre" valor={nombre} onCambiar={value => { setNombre(value); setError(null) }} marcador="Mi sonido" editable={!edicionBloqueada && !estado.comparacion} />
        <FilaAccion rotulo="Guardar como nuevo" onPress={guardarPersonal} disabled={edicionBloqueada || !!estado.comparacion || !nombre.trim()} />
        {seleccionado ? <FilaAccion rotulo={`Renombrar «${seleccionado.nombre}»`} onPress={renombrarPersonal} disabled={edicionBloqueada || !!estado.comparacion || !nombre.trim()} /> : null}
        {seleccionado ? <FilaAccion rotulo={`Eliminar «${seleccionado.nombre}»`} onPress={() => Alert.alert('Eliminar preajuste', `¿Querés eliminar «${seleccionado.nombre}»?`, [
          { text: 'Cancelar', style: 'cancel' }, { text: 'Eliminar', style: 'destructive', onPress: () => eliminarPresetPersonalEcualizador(seleccionado.id) },
        ])} disabled={edicionBloqueada || !!estado.comparacion} ultima /> : null}
      </GrupoAjustes>

      <GrupoAjustes titulo="Comparar A/B" pie="A y B son dos versiones temporales. Se escucha la seleccionada; al salir sin usarla vuelve la curva anterior.">
        {estado.comparacion ? <>
          <FilaAccion rotulo={`${estado.comparacion.seleccion === 'A' ? '✓ ' : ''}Escuchar A`} onPress={() => seleccionarComparacionEcualizador('A')} disabled={bloqueado} />
          <FilaAccion rotulo={`${estado.comparacion.seleccion === 'B' ? '✓ ' : ''}Escuchar B`} onPress={() => seleccionarComparacionEcualizador('B')} disabled={bloqueado} />
          <FilaAccion rotulo={`Usar curva ${estado.comparacion.seleccion}`} onPress={usarComparacionEcualizador} disabled={bloqueado} />
          <FilaAccion rotulo="Descartar comparación" onPress={cancelarComparacionEcualizador} ultima />
        </> : <FilaAccion rotulo="Iniciar comparación" onPress={iniciarComparacionEcualizador} disabled={edicionBloqueada} ultima />}
      </GrupoAjustes>
    </ListaAjustes>
  </SafeAreaView>
}
