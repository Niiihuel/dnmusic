import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { cancelarComparacionEcualizador, cargarEcualizador, crearPresetPersonalEcualizador, elegirPresetEcualizador, elegirPresetPersonalEcualizador, eliminarPresetPersonalEcualizador, FRECUENCIAS_EQ, GANANCIA_EQ_MAX, GANANCIA_EQ_MIN, guardarEcualizadorAhora, iniciarComparacionEcualizador, nombrePresetEcualizador, PRESETS_EQ, reintentarEcualizador, renombrarPresetPersonalEcualizador, restablecerEcualizador, seleccionarComparacionEcualizador, setEcualizadorActivo, setGananciaEcualizador, usarComparacionEcualizador, useEcualizador, useSoporteEcualizador } from '../state/ecualizador'
import { useEscuchaEspejoNombre } from '../state/escucha'
import { useJamSilencioso } from '../state/jam'
import { usePiso } from '../state/shell'
import { volver } from '../lib/volver'
import { AjustesCompactos, FilaInterruptor, GrupoAjustes } from './Ajustes'
import { BotonVolver } from './BotonVolver'
import { CurvaEcualizador } from './CurvaEcualizador'
import { EncabezadoHoja } from './EncabezadoHoja'
import { ScrollArea } from './ScrollArea'
import { decibeliosEQ, frecuenciaEQ } from './ecualizadorGeometry'

const PRESETS = Object.keys(PRESETS_EQ) as (keyof typeof PRESETS_EQ)[]
// Scoped to this screen: player seek/volume controls keep their own semantics.
const ESTILOS = `
.dn-eq { color: var(--texto, #fff); font: inherit; }
.dn-eq button { font: inherit; color: inherit; cursor: pointer; }
.dn-eq button:disabled { opacity: .4; cursor: default; }
.dn-eq button:focus-visible, .dn-eq input:focus-visible { outline: 2px solid #fff; outline-offset: 4px; }
.dn-eq-presets { display: flex; flex-wrap: wrap; gap: 8px; }
.dn-eq-presets button, .dn-eq-action { min-height: 38px; padding: 8px 14px; border: 0; border-radius: 999px; background: #242424; box-shadow: inset 0 0 0 1px #ffffff12; }
.dn-eq-presets button[aria-pressed=true] { background: #fff; color: #121212; box-shadow: 0 2px 10px #0003; }
.dn-eq-presets button:not(:disabled):hover, .dn-eq-action:not(:disabled):hover { box-shadow: inset 0 0 0 1px #ffffff45; }
.dn-eq-personal { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.dn-eq-personal input[type=text] { flex: 1 1 230px; min-height: 42px; padding: 8px 12px; border: 1px solid #595959; border-radius: 8px; background: #202020; color: #fff; font: inherit; }
.dn-eq-personal input[type=text]:disabled { opacity: .4; }
.dn-eq-error { color: #ff6961; font-size: 13px; }
.dn-eq-comparison { display: flex; flex-wrap: wrap; gap: 8px; }
.dn-eq-comparison button[aria-pressed=true] { background: #fff; color: #121212; }
.dn-eq-bands { display: grid; grid-template-columns: repeat(10, minmax(0, 1fr)); gap: 8px; border: 0; margin: 0; padding: 0; }
.dn-eq-band { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 10px 0; border-radius: 10px; min-width: 0; }
.dn-eq-band:focus-within { background: #ffffff08; }
.dn-eq-band span { font-size: 12px; color: #b3b3b3; font-variant-numeric: tabular-nums; white-space: nowrap; }
.dn-eq-band output { font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.dn-eq-band input { writing-mode: vertical-lr; direction: rtl; height: 132px; width: 28px; margin: 0; accent-color: #fff; cursor: ns-resize; }
.dn-eq-bands:disabled { opacity: .4; }
.dn-eq-band input:disabled { cursor: default; }
@media (max-width: 600px) {
  .dn-eq-bands { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 20px; }
  .dn-eq-band { display: grid; grid-template-columns: 1fr auto; gap: 4px; }
  .dn-eq-band input { writing-mode: horizontal-tb; direction: ltr; grid-column: 1 / -1; grid-row: 2; width: 100%; height: 32px; cursor: ew-resize; }
}
`

export default function Ecualizador() {
  const router = useRouter()
  const estado = useEcualizador()
  const soporte = useSoporteEcualizador()
  const otroDispositivo = useEscuchaEspejoNombre()
  const jamSilencioso = useJamSilencioso()
  const piso = usePiso(24)
  const [ancho, setAncho] = useState(0)
  const [banda, setBanda] = useState(5)
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState<string | null>(null)
  const remoto = !!otroDispositivo || jamSilencioso
  const bloqueado = !estado.cargado || remoto || soporte === 'no-disponible' || soporte === 'error'
  const edicionBloqueada = bloqueado || !estado.activo
  const seleccionado = estado.presetsPersonales.find(item => item.id === estado.presetPersonalId)
  const aviso = !estado.cargado ? 'Cargando tus ajustes…'
    : remoto ? `El audio está sonando en ${otroDispositivo ?? 'otro dispositivo'}. Ajustá el ecualizador allí.`
      : soporte === 'no-disponible' ? 'El ecualizador no está disponible en este navegador o versión de la app.'
        : soporte === 'error' ? 'No se pudo aplicar el ecualizador. Tu curva sigue guardada.'
          : estado.activo ? 'Solo cambia el sonido de dnmusic en este dispositivo.'
            : 'La música suena sin modificar. Tu curva queda guardada.'

  useEffect(() => {
    void cargarEcualizador()
    const guardar = () => { cancelarComparacionEcualizador(); void guardarEcualizadorAhora() }
    const ocultar = () => { if (document.visibilityState === 'hidden') guardar() }
    window.addEventListener('pagehide', guardar)
    document.addEventListener('visibilitychange', ocultar)
    return () => { window.removeEventListener('pagehide', guardar); document.removeEventListener('visibilitychange', ocultar); guardar() }
  }, [])

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

  return <View style={{ flex: 1, backgroundColor: '#121212' }}>
    <style>{ESTILOS}</style>
    <EncabezadoHoja titulo="Ecualizador" velo={false}
      izquierda={<BotonVolver label="Volver a reproducción" onPress={() => volver(router, '/ajustes?seccion=reproduccion' as never)} />} />
    <ScrollArea style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: piso }}>
      <View style={{ width: '100%', maxWidth: 760, alignSelf: 'center', gap: 24 }}>
        <AjustesCompactos>
          <GrupoAjustes pie={aviso}>
            <FilaInterruptor rotulo="Activar ecualizador" activo={estado.activo}
              disabled={bloqueado} onCambiar={setEcualizadorActivo} ultima />
          </GrupoAjustes>
        </AjustesCompactos>
        {soporte === 'error' ? <div className="dn-eq" role="alert">
          <button className="dn-eq-action" disabled={remoto || !estado.cargado} onClick={reintentarEcualizador}>Reintentar</button>
        </div> : null}

        <View style={{ backgroundColor: '#181818', borderRadius: 18, padding: 16, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <Text accessibilityRole="header" style={{ color: '#FFFFFF', fontSize: 19, fontWeight: '600' }}>{nombrePresetEcualizador(estado)}</Text>
            <Text style={{ color: '#B3B3B3', fontSize: 13 }}>10 bandas · ±12 dB</Text>
          </View>
          <View onLayout={event => setAncho(event.nativeEvent.layout.width)}>
            {ancho > 0 ? <CurvaEcualizador ancho={ancho} ganancias={estado.ganancias} seleccionada={banda}
              onSeleccionar={setBanda} disabled={edicionBloqueada} /> : null}
          </View>
          <div className="dn-eq">
            <fieldset className="dn-eq-bands" disabled={edicionBloqueada} aria-label="Ganancia por frecuencia">
              {FRECUENCIAS_EQ.map((hz, index) => <label className="dn-eq-band" key={hz}>
                <span>{frecuenciaEQ(hz)}</span>
                <input type="range" min={GANANCIA_EQ_MIN} max={GANANCIA_EQ_MAX} step={0.5}
                  value={estado.ganancias[index] ?? 0} aria-label={`Ganancia de ${frecuenciaEQ(hz)}`}
                  aria-valuetext={decibeliosEQ(estado.ganancias[index] ?? 0)}
                  onFocus={() => setBanda(index)} onPointerDown={() => setBanda(index)}
                  onChange={event => { if (!edicionBloqueada) setGananciaEcualizador(index, event.currentTarget.valueAsNumber) }}
                  onPointerUp={() => { void guardarEcualizadorAhora() }}
                  onBlur={() => { void guardarEcualizadorAhora() }} />
                <output aria-hidden="true">{decibeliosEQ(estado.ganancias[index] ?? 0)}</output>
              </label>)}
            </fieldset>
          </div>
          <Text style={{ color: '#B3B3B3', fontSize: 13, lineHeight: 18 }}>
            {estado.activo ? 'Arrastrá la curva o ajustá cada banda. Con teclado, usá las flechas para cambiar de a 0,5 dB.' : 'Activá el ecualizador para ajustar el sonido.'}
          </Text>
        </View>

        <View style={{ gap: 12 }}>
          <Text accessibilityRole="header" style={{ color: '#FFFFFF', fontSize: 19, fontWeight: '600' }}>Preajustes</Text>
          <div className="dn-eq dn-eq-presets" role="group" aria-label="Preajustes de sonido">
            {PRESETS.map(preset => <button key={preset} aria-pressed={estado.preset === preset && !estado.presetPersonalId}
              disabled={edicionBloqueada} onClick={() => { elegirPresetEcualizador(preset); setNombre(''); setError(null) }}>{preset}</button>)}
          </div>
          <Text style={{ color: '#B3B3B3', fontSize: 13, lineHeight: 18 }}>El nivel se compensa para reducir la saturación al subir bandas.</Text>
        </View>

        <View style={{ gap: 12 }}>
          <Text accessibilityRole="header" style={{ color: '#FFFFFF', fontSize: 19, fontWeight: '600' }}>Tus preajustes</Text>
          <div className="dn-eq dn-eq-presets" role="group" aria-label="Tus preajustes de sonido">
            {estado.presetsPersonales.map(personal => <button key={personal.id} aria-pressed={estado.presetPersonalId === personal.id}
              disabled={edicionBloqueada} onClick={() => { elegirPresetPersonalEcualizador(personal.id); setNombre(personal.nombre); setError(null) }}>{personal.nombre}</button>)}
          </div>
          <div className="dn-eq dn-eq-personal">
            <input type="text" value={nombre} maxLength={40} placeholder="Nombre del preajuste" aria-label="Nombre del preajuste"
              disabled={edicionBloqueada || !!estado.comparacion} onChange={event => { setNombre(event.currentTarget.value); setError(null) }} />
            <button className="dn-eq-action" disabled={edicionBloqueada || !!estado.comparacion || !nombre.trim()} onClick={guardarPersonal}>Guardar como nuevo</button>
            {seleccionado ? <button className="dn-eq-action" disabled={edicionBloqueada || !!estado.comparacion || !nombre.trim()} onClick={renombrarPersonal}>Renombrar</button> : null}
            {seleccionado ? <button className="dn-eq-action" disabled={edicionBloqueada || !!estado.comparacion} onClick={() => {
              if (window.confirm(`¿Eliminar «${seleccionado.nombre}»?`)) eliminarPresetPersonalEcualizador(seleccionado.id)
            }}>Eliminar</button> : null}
          </div>
          {error ? <Text accessibilityLiveRegion="polite" style={{ color: '#FF6961', fontSize: 13 }}>{error}</Text> : null}
          <Text style={{ color: '#B3B3B3', fontSize: 13 }}>Editar una banda no cambia el preajuste guardado.</Text>
        </View>

        <View style={{ gap: 12 }}>
          <Text accessibilityRole="header" style={{ color: '#FFFFFF', fontSize: 19, fontWeight: '600' }}>Comparar A/B</Text>
          <Text style={{ color: '#B3B3B3', fontSize: 13 }}>A y B son temporales. Escuchá y editá cada curva; al salir sin usar una, vuelve la anterior.</Text>
          <div className="dn-eq dn-eq-comparison" role="group" aria-label="Comparación de curvas">
            {estado.comparacion ? <>
              <button className="dn-eq-action" aria-pressed={estado.comparacion.seleccion === 'A'} disabled={bloqueado} onClick={() => seleccionarComparacionEcualizador('A')}>Escuchar A</button>
              <button className="dn-eq-action" aria-pressed={estado.comparacion.seleccion === 'B'} disabled={bloqueado} onClick={() => seleccionarComparacionEcualizador('B')}>Escuchar B</button>
              <button className="dn-eq-action" disabled={bloqueado} onClick={usarComparacionEcualizador}>Usar curva {estado.comparacion.seleccion}</button>
              <button className="dn-eq-action" onClick={cancelarComparacionEcualizador}>Descartar</button>
            </> : <button className="dn-eq-action" disabled={edicionBloqueada} onClick={iniciarComparacionEcualizador}>Iniciar comparación</button>}
          </div>
        </View>
        <div className="dn-eq">
          <button className="dn-eq-action" disabled={edicionBloqueada || (estado.preset === 'Plano' && !estado.presetPersonalId)} onClick={restablecerEcualizador}>Restablecer curva</button>
        </div>
      </View>
    </ScrollArea>
  </View>
}
