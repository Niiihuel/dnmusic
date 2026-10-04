import { useEffect, useRef, useState } from 'react'
import { Platform, View } from 'react-native'
import { Stack, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  cargarDiagnosticoAudio, crearInformeDiagnosticoAudio, limpiarDiagnosticoAudio,
  useDiagnosticoAudio, type TipoIncidenciaAudio,
} from '../../src/state/diagnosticoAudio'
import { ListaAgrupada } from '../../src/ui/ListaAgrupada'
import type { SeccionAgrupada } from '../../src/ui/ListaAgrupada.types'
import { BotonVolver } from '../../src/ui/BotonVolver'
import { EncabezadoHoja } from '../../src/ui/EncabezadoHoja'
import { usePiso } from '../../src/state/shell'
import { copiarAlPortapapeles } from '../../src/lib/portapapeles'
import { volver } from '../../src/lib/volver'

const TITULOS: Record<TipoIncidenciaAudio, string> = {
  fallo: 'Fallo de audio', reintento: 'Reintento', recuperado: 'Audio recuperado', agotado: 'Reintentos agotados',
}

/** Historial del dispositivo, sin consulta remota ni envío automático. */
export default function DiagnosticoAudio() {
  const router = useRouter()
  const { cargado, incidencias, error } = useDiagnosticoAudio()
  const piso = usePiso(24)
  const [ocupado, setOcupado] = useState(false)
  const [resultado, setResultado] = useState<string | null>(null)
  const enVuelo = useRef(false)
  useEffect(() => { void cargarDiagnosticoAudio() }, [])

  async function ejecutar(accion: 'copiar' | 'limpiar') {
    if (enVuelo.current) return
    enVuelo.current = true
    setOcupado(true)
    setResultado(null)
    try {
      if (accion === 'copiar') {
        const copiado = await copiarAlPortapapeles(crearInformeDiagnosticoAudio())
        setResultado(copiado ? 'Informe copiado. Podés pegarlo donde prefieras.' : 'El portapapeles no está disponible. El historial sigue visible en esta pantalla.')
      } else if (await limpiarDiagnosticoAudio()) setResultado('Historial local borrado.')
    } finally {
      enVuelo.current = false
      setOcupado(false)
    }
  }

  const secciones: SeccionAgrupada[] = [
    {
      id: 'resumen', titulo: 'En este dispositivo', error: error ?? undefined,
      pie: resultado ?? 'Se conservan los últimos 30 eventos. No se guardan títulos, usuarios, URLs ni credenciales. El informe sólo se copia si lo pedís.',
      filas: [
        { tipo: 'dato', id: 'total', rotulo: cargado ? 'Eventos registrados' : 'Leyendo historial', valor: cargado ? String(incidencias.length) : '…' },
        { tipo: 'accion', id: 'copiar', copyText: Platform.OS === 'web' ? crearInformeDiagnosticoAudio() : undefined, rotulo: 'Copiar informe', symbol: 'doc.on.doc', onPress: () => { void ejecutar('copiar') }, disabled: !cargado || ocupado || !incidencias.length },
        { tipo: 'accion', id: 'limpiar', rotulo: 'Borrar historial local', symbol: 'trash', destructiva: true, onPress: () => { void ejecutar('limpiar') }, disabled: !cargado || ocupado || (!incidencias.length && !error) },
      ],
    },
    ...[...incidencias].reverse().map((fila, i): SeccionAgrupada => ({
      id: `evento:${fila.timestamp}:${i}`, titulo: TITULOS[fila.tipo],
      pie: new Date(fila.timestamp).toLocaleString('es-AR'),
      filas: [
        { tipo: 'dato', id: 'motivo', rotulo: 'Motivo', valor: fila.motivo },
        { tipo: 'dato', id: 'estado', rotulo: 'Estado de la app', valor: fila.enSegundoPlano ? 'Segundo plano' : 'Primer plano' },
        ...(fila.intento !== undefined ? [{ tipo: 'dato' as const, id: 'intento', rotulo: 'Intento', valor: String(fila.intento) }] : []),
      ],
    })),
    ...(cargado && !incidencias.length ? [{ id: 'vacio', titulo: 'Sin incidencias', pie: 'Si el audio falla o intenta recuperarse, el detalle quedará acá para consultarlo después.', filas: [] }] : []),
  ]

  return <SafeAreaView className="flex-1 bg-background" edges={['top']}>
    <Stack.Screen options={{ headerShown: false }} />
    <EncabezadoHoja titulo="Diagnóstico de audio" velo={false}
      izquierda={<BotonVolver label="Volver a reproducción" onPress={() => volver(router, '/ajustes?seccion=reproduccion')} />} />
    <View style={{ flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center' }}>
      <ListaAgrupada label="Historial de diagnóstico de audio" secciones={secciones} piso={piso} />
    </View>
  </SafeAreaView>
}
