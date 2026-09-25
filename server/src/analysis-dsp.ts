/**
 * Análisis v1 de audio PCM mono a 8 kHz. Los tiempos provienen de muestras
 * decodificadas, no de etiquetas del contenedor ni de metadatos de terceros.
 *
 * La detección rítmica es deliberadamente conservadora: un pulso regular con
 * ataques claros produce BPM y una grilla; música ambigua produce `null`.
 * La tonalidad no se calcula aquí.
 */

import { medirOndaFrecuencias, type FrequencyBands } from './frequency-bands.js'

export const ANALYSIS_VERSION = 1 as const
export const ANALYSIS_SAMPLE_RATE = 8_000
export const ANALYSIS_WAVEFORM_BUCKETS = 256
export const ANALYSIS_MAX_DURATION_MS = 20 * 60_000
const FRAME_SAMPLES = 160 // 20 ms
const FRAME_MS = 20

export type RhythmV1 = {
  bpm: number
  /** 0..1: periodicidad, estabilidad entre ventanas y regularidad de beats; no es probabilidad. */
  confidence: number
  beatMs: number[]
  /** Solo se ofrece un compás de cuatro si hay un acento dominante repetido. */
  meter: 4 | null
  barMs: number[] | null
}

export type TempoEstimateV1 = {
  /** BPM central medido en ventanas de 30 s. No contiene una grilla de beats. */
  bpm: number
  minBpm: number
  maxBpm: number
  /** 0..1: periodicidad y acuerdo entre ventanas; no es probabilidad. */
  confidence: number
  /** Las ventanas discrepan; puede ser tempo variable o incertidumbre de medición. */
  varying: boolean
  /** Otra lectura mitad/doble respaldada por autocorrelación, si existe. */
  alternateBpm: number | null
}

export type LoudnessV1 = {
  /** Loudness integrado EBU R128, expresado en LUFS (numéricamente LKFS). */
  integratedLufs: number
  /** Máximo interpolado entre muestras, en dBTP; puede superar 0 dBTP. */
  truePeakDbtp: number
}

export type AnalysisFeaturesV1 = {
  durationMs: number
  waveform: {
    /** RMS normalizado al tramo más fuerte. */ rms: number[]
    /** Energía real filtrada de 0–160, 160–1000 y >1000 Hz. */ bands?: FrequencyBands
    bucketMs: number
  }
  energy: { /** RMS lineal de la señal decodificada. */ meanRms: number; peakRms: number; dynamicsDb: number }
  silence: { introEndMs: number; outroStartMs: number; regions: { startMs: number; endMs: number }[] }
  /** Estimación temporal de BPM, incluso si no existe una grilla de beats fiable. */
  tempo: TempoEstimateV1 | null
  rhythm: RhythmV1 | null
  /** Medido sobre todos los canales originales; `null` si FFmpeg no pudo medirlo. */
  loudness?: LoudnessV1 | null
}

type Onset = { frame: number; strength: number }
const redondear = (valor: number, decimales = 3) => Number(valor.toFixed(decimales))

function mediana(valores: number[]): number {
  const ordenados = [...valores].sort((a, b) => a - b)
  const mitad = Math.floor(ordenados.length / 2)
  return ordenados.length % 2 ? ordenados[mitad] : (ordenados[mitad - 1] + ordenados[mitad]) / 2
}

function detectarSilencios(rms: Float64Array, duracionMs: number, medio: number) {
  // Umbral absoluto acotado y relativo al tema: una masterización baja no
  // debería desaparecer, pero una cola casi muda sí debería detectarse.
  const umbral = Math.max(0.004, Math.min(0.016, medio * 0.1))
  const regiones: { startMs: number; endMs: number }[] = []
  let comienzo = -1
  for (let i = 0; i <= rms.length; i++) {
    const silencioso = i < rms.length && rms[i] < umbral
    if (silencioso && comienzo < 0) comienzo = i
    if ((!silencioso || i === rms.length) && comienzo >= 0) {
      const inicio = comienzo * FRAME_MS
      const fin = Math.min(duracionMs, i * FRAME_MS)
      if (fin - inicio >= 250) regiones.push({ startMs: inicio, endMs: fin })
      comienzo = -1
    }
  }
  return {
    introEndMs: regiones[0]?.startMs === 0 ? regiones[0].endMs : 0,
    outroStartMs: regiones.at(-1)?.endMs === duracionMs ? regiones.at(-1)!.startMs : duracionMs,
    regions: regiones.slice(0, 128),
  }
}

function novedadRitmica(rms: Float64Array, bajos: Float64Array, altos: Float64Array): Float64Array {
  const novedad = new Float64Array(rms.length)
  for (let i = 1; i < rms.length; i++) {
    const salto = (actual: number, anterior: number) =>
      Math.max(0, Math.log(actual + 0.003) - Math.log(anterior + 0.003))
    novedad[i] = 0.45 * salto(rms[i], rms[i - 1]) +
      0.35 * salto(bajos[i], bajos[i - 1]) + 0.20 * salto(altos[i], altos[i - 1])
  }
  return novedad
}

export function detectarAtaques(rms: Float64Array, bajos: Float64Array, altos: Float64Array): Onset[] {
  const novedad = novedadRitmica(rms, bajos, altos)
  const prefijos = new Float64Array(novedad.length + 1)
  for (let i = 0; i < novedad.length; i++) prefijos[i + 1] = prefijos[i] + novedad[i]
  const candidatos: Onset[] = []
  for (let i = 2; i < novedad.length - 2; i++) {
    const desde = Math.max(0, i - 25), hasta = Math.min(novedad.length, i + 26)
    const mediaLocal = (prefijos[hasta] - prefijos[desde]) / (hasta - desde)
    const valor = novedad[i]
    if (valor < 0.22 || valor < mediaLocal * 2.2 ||
      valor < novedad[i - 1] || valor <= novedad[i + 1]) continue
    candidatos.push({ frame: i, strength: valor })
  }
  // Un ataque puede ocupar varios frames; conservar uno cada 120 ms.
  const ataques: Onset[] = []
  for (const candidato of candidatos) {
    const anterior = ataques.at(-1)
    if (anterior && candidato.frame - anterior.frame < 6) {
      if (candidato.strength > anterior.strength) ataques[ataques.length - 1] = candidato
    } else ataques.push(candidato)
  }
  return ataques
}

function correlacionTempo(novedad: Float64Array, comienzo: number, fin: number, bpm: number): number {
  const lag = 60_000 / (bpm * FRAME_MS)
  let cruzada = 0, energiaA = 0, energiaB = 0
  for (let i = comienzo; i + lag + 1 < fin; i++) {
    const indice = Math.floor(i + lag)
    const fraccion = i + lag - indice
    const a = novedad[i]
    const b = novedad[indice] * (1 - fraccion) + novedad[indice + 1] * fraccion
    cruzada += a * b
    energiaA += a * a
    energiaB += b * b
  }
  return energiaA > 0 && energiaB > 0 ? cruzada / Math.sqrt(energiaA * energiaB) : 0
}

function mejorTempo(novedad: Float64Array, comienzo: number, fin: number) {
  let bpm = 0, score = 0
  for (let candidato = 60; candidato <= 200; candidato += 0.5) {
    const actual = correlacionTempo(novedad, comienzo, fin, candidato)
    if (actual > score) { bpm = candidato; score = actual }
  }
  return { bpm, score }
}

function mejorTempoCercano(novedad: Float64Array, comienzo: number, fin: number, referencia: number) {
  let mejor = { bpm: 0, score: 0 }
  const desde = Math.max(60, Math.ceil(referencia * 0.94 * 2) / 2)
  const hasta = Math.min(200, Math.floor(referencia * 1.06 * 2) / 2)
  for (let bpm = desde; bpm <= hasta; bpm += 0.5) {
    const score = correlacionTempo(novedad, comienzo, fin, bpm)
    if (score > mejor.score) mejor = { bpm, score }
  }
  return mejor
}

function cercaDeFamilia(bpm: number, referencia: number): number | null {
  for (const factor of [1, 2, 0.5]) {
    const normalizado = bpm * factor
    if (Math.abs(normalizado - referencia) / referencia <= 0.025) return normalizado
  }
  return null
}

/** Sigue los ataques sin imponer una fase constante a varios minutos de audio. */
function seguirBeats(novedad: Float64Array, bpm: number, introEndMs: number, outroStartMs: number): number[] {
  const periodo = 60_000 / (bpm * FRAME_MS)
  const minimo = Math.max(1, Math.floor(periodo * 0.84))
  const maximo = Math.ceil(periodo * 1.16)
  const puntuacion = new Float64Array(novedad.length)
  const anterior = new Int32Array(novedad.length).fill(-1)
  const positivos = Array.from(novedad).filter(v => v > 0).sort((a, b) => a - b)
  const referencia = Math.max(0.01, positivos[Math.floor(positivos.length * 0.8)] ?? 0)
  for (let i = 0; i < novedad.length; i++) {
    const ataque = Math.min(2, novedad[i] / referencia)
    let mejor = 0, previo = -1
    for (let lag = minimo; lag <= maximo && lag <= i; lag++) {
      const desviacion = (lag - periodo) / Math.max(2, periodo * 0.08)
      const score = puntuacion[i - lag] - 0.35 * desviacion * desviacion
      if (score > mejor) { mejor = score; previo = i - lag }
    }
    puntuacion[i] = ataque + mejor
    anterior[i] = previo
  }
  const ultimo = Math.min(novedad.length - 1, Math.ceil(outroStartMs / FRAME_MS))
  let mejorFinal = Math.max(0, ultimo - Math.ceil(periodo * 2))
  for (let i = mejorFinal + 1; i <= ultimo; i++) {
    if (puntuacion[i] > puntuacion[mejorFinal]) mejorFinal = i
  }
  const beats: number[] = []
  for (let i = mejorFinal; i >= 0 && beats.length < 4_000; i = anterior[i]) {
    const tiempo = i * FRAME_MS
    if (tiempo >= introEndMs - 55 && tiempo <= outroStartMs + 55) beats.push(tiempo)
    if (anterior[i] < 0) break
  }
  return beats.reverse()
}

function detectarTempoYRitmo(rms: Float64Array, bajos: Float64Array, altos: Float64Array, duracionMs: number, introEndMs: number, outroStartMs: number): { tempo: TempoEstimateV1 | null; rhythm: RhythmV1 | null } {
  const vacio = { tempo: null, rhythm: null }
  if (duracionMs < 15_000) return vacio
  const ataques = detectarAtaques(rms, bajos, altos)
  if (ataques.length < 16) return vacio
  const novedad = novedadRitmica(rms, bajos, altos)
  let global = mejorTempo(novedad, 0, novedad.length)
  if (global.score < 0.30) return vacio
  let globalRitmo = global

  // Mitad/doble tiempo comparten pulsos; se favorece el pulso corto solo
  // cuando su evidencia casi alcanza la del largo.
  if (global.bpm < 110 && global.bpm * 2 <= 190) {
    let doble = { bpm: 0, score: 0 }
    for (let bpm = global.bpm * 2 - 2; bpm <= global.bpm * 2 + 2; bpm += 0.5) {
      const score = correlacionTempo(novedad, 0, novedad.length, bpm)
      if (score > doble.score) doble = { bpm, score }
    }
    if (doble.score >= global.score * 0.78) globalRitmo = doble
    if (doble.score >= global.score * 0.90) global = doble
  }

  const ventanas: number[] = [], ventanasTempo: number[] = []
  let validas = 0
  for (let comienzo = 0; comienzo < novedad.length; comienzo += 1_500) {
    const fin = Math.min(novedad.length, comienzo + 1_500)
    if (fin - comienzo < 750) continue
    const local = mejorTempo(novedad, comienzo, fin)
    if (local.score < 0.25) continue
    validas++
    const normalizado = cercaDeFamilia(local.bpm, globalRitmo.bpm)
    if (normalizado !== null) ventanas.push(normalizado)
    // Una lectura a 2/3 o 3/2 puede ser una subdivisión del mismo pulso.
    // Solo la admitimos para el BPM aproximado cuando la propia periodicidad
    // cercana al tempo global también aparece en esa ventana. Nunca da grid.
    const factor = [1, 2, 0.5].find(valor =>
      Math.abs(local.bpm * valor - global.bpm) / global.bpm <= 0.06)
    const aliasTernario = [1.5, 2 / 3].some(factor =>
      Math.abs(local.bpm * factor - global.bpm) / global.bpm <= 0.03)
    if (factor !== undefined) ventanasTempo.push(local.bpm * factor)
    else if (aliasTernario) {
      const cercano = mejorTempoCercano(novedad, comienzo, fin, global.bpm)
      if (cercano.score >= 0.25 && cercano.score >= local.score * 0.78) ventanasTempo.push(cercano.bpm)
    }
  }
  let tempo: TempoEstimateV1 | null = null
  if (validas && ventanasTempo.length / validas >= 0.75) {
    const bpm = mediana(ventanasTempo)
    const minBpm = Math.min(...ventanasTempo), maxBpm = Math.max(...ventanasTempo)
    const amplitud = (maxBpm - minBpm) / bpm
    if (amplitud <= 0.10) {
      const periodicidad = Math.min(1, (global.score - 0.25) / 0.30)
      const acuerdo = ventanasTempo.length / validas
      const estabilidad = Math.max(0, 1 - amplitud / 0.10)
      const confianza = Math.min(1, 0.50 * periodicidad + 0.30 * acuerdo + 0.20 * estabilidad)
      if (confianza >= 0.55) {
        const alternativas = [bpm / 2, bpm * 2]
          .filter(valor => valor >= 60 && valor <= 200)
          .map(valor => ({ targetBpm: valor, peak: mejorTempoCercano(novedad, 0, novedad.length, valor) }))
          .sort((a, b) => b.peak.score - a.peak.score)
        const alternativa = alternativas[0]
        tempo = {
          bpm: redondear(bpm, 2),
          minBpm: redondear(minBpm, 2),
          maxBpm: redondear(maxBpm, 2),
          confidence: redondear(confianza),
          varying: amplitud > 0.02,
          alternateBpm: alternativa && alternativa.peak.score >= 0.18 && alternativa.peak.score >= global.score * 0.55
            ? redondear(alternativa.targetBpm, 2) : null,
        }
      }
    }
  }
  if (globalRitmo.score < 0.42 || !validas || ventanas.length / validas < 0.75) return { tempo, rhythm: null }
  const bpm = mediana(ventanas)
  const dispersion = mediana(ventanas.map(valor => Math.abs(valor - bpm))) / bpm
  if (dispersion > 0.012) return { tempo, rhythm: null }

  const beatMs = seguirBeats(novedad, bpm, introEndMs, outroStartMs)
  if (beatMs.length < 16 || beatMs.at(-1)! - beatMs[0] < (outroStartMs - introEndMs) * 0.5) return { tempo, rhythm: null }
  const periodoMs = 60_000 / bpm
  let desviacion = 0
  for (let i = 1; i < beatMs.length; i++) desviacion += Math.abs((beatMs[i] - beatMs[i - 1]) - periodoMs) / periodoMs
  desviacion /= beatMs.length - 1
  const estabilidad = Math.max(0, 1 - dispersion / 0.025)
  const regularidad = Math.max(0, 1 - desviacion / 0.15)
  const periodicidad = Math.max(0, Math.min(1, (globalRitmo.score - 0.25) / 0.35))
  const confianza = Math.min(1, 0.35 * periodicidad + 0.35 * ventanas.length / validas * estabilidad + 0.30 * regularidad)
  if (confianza < 0.55) return { tempo, rhythm: null }

  // Inferir cuatro tiempos solo con un acento que predomina cada cuatro beats.
  // Sin ese patrón, el pulso sigue siendo útil pero el compás queda desconocido.
  const acentos = [0, 0, 0, 0], cuentas = [0, 0, 0, 0]
  for (let i = 0; i < beatMs.length; i++) {
    let maximo = 0
    const centro = Math.round(beatMs[i] / FRAME_MS)
    for (let frame = Math.max(0, centro - 2); frame <= Math.min(rms.length - 1, centro + 3); frame++) {
      maximo = Math.max(maximo, rms[frame])
    }
    acentos[i % 4] += maximo
    cuentas[i % 4]++
  }
  const medias = acentos.map((suma, i) => suma / Math.max(1, cuentas[i]))
  const orden = [0, 1, 2, 3].sort((a, b) => medias[b] - medias[a])
  const dominante = orden[0]
  const compasConfiable = beatMs.length >= 32 && medias[dominante] > 0 &&
    medias[dominante] >= medias[orden[1]] * 1.7 &&
    medias[dominante] >= (medias.reduce((a, b) => a + b, 0) - medias[dominante]) / 3 * 1.8
  const barMs = compasConfiable ? beatMs.filter((_, i) => i % 4 === dominante) : null

  const ritmo: RhythmV1 = {
    bpm: redondear(bpm, 2),
    confidence: redondear(confianza),
    beatMs,
    meter: compasConfiable ? 4 : null,
    barMs,
  }
  // Si el seguimiento de beats es fiable, su lectura mitad/doble prevalece
  // sobre la estimación general para que ambos campos describan el mismo pulso.
  if (tempo) {
    const factor = ritmo.bpm / tempo.bpm
    const octava = Math.abs(factor - 2) < 0.08 ? 2 : Math.abs(factor - 0.5) < 0.02 ? 0.5 : null
    if (octava) tempo = {
      ...tempo,
      bpm: redondear(tempo.bpm * octava, 2),
      minBpm: redondear(tempo.minBpm * octava, 2),
      maxBpm: redondear(tempo.maxBpm * octava, 2),
      alternateBpm: tempo.bpm,
    }
  } else tempo = {
    bpm: ritmo.bpm, minBpm: ritmo.bpm, maxBpm: ritmo.bpm,
    confidence: ritmo.confidence, varying: false, alternateBpm: null,
  }
  return { tempo, rhythm: ritmo }
}

export function analizarPcm(muestras: Int16Array): AnalysisFeaturesV1 {
  if (muestras.length === 0) throw new Error('Audio vacío')
  if (muestras.length > ANALYSIS_SAMPLE_RATE * ANALYSIS_MAX_DURATION_MS / 1_000) {
    throw new Error('Audio demasiado largo para análisis')
  }
  const duracionMs = Math.round(muestras.length / ANALYSIS_SAMPLE_RATE * 1_000)
  const frames = Math.ceil(muestras.length / FRAME_SAMPLES)
  const rms = new Float64Array(frames), bajos = new Float64Array(frames), altos = new Float64Array(frames)
  const alfaBajo = Math.exp(-2 * Math.PI * 160 / ANALYSIS_SAMPLE_RATE)
  const alfaAlto = Math.exp(-2 * Math.PI * 1_500 / ANALYSIS_SAMPLE_RATE)
  let filtroBajo = 0, filtroAlto = 0, sumaGlobal = 0, picoRms = 0
  for (let frame = 0; frame < frames; frame++) {
    const desde = frame * FRAME_SAMPLES
    const hasta = Math.min(muestras.length, desde + FRAME_SAMPLES)
    let suma = 0, sumaBajo = 0, sumaAlto = 0
    for (let i = desde; i < hasta; i++) {
      const v = muestras[i] / 32768
      filtroBajo = alfaBajo * filtroBajo + (1 - alfaBajo) * v
      filtroAlto = alfaAlto * filtroAlto + (1 - alfaAlto) * v
      suma += v * v
      sumaBajo += filtroBajo * filtroBajo
      const alta = v - filtroAlto
      sumaAlto += alta * alta
    }
    const cantidad = hasta - desde
    rms[frame] = Math.sqrt(suma / cantidad)
    bajos[frame] = Math.sqrt(sumaBajo / cantidad)
    altos[frame] = Math.sqrt(sumaAlto / cantidad)
    picoRms = Math.max(picoRms, rms[frame])
    sumaGlobal += suma
  }
  const medio = Math.sqrt(sumaGlobal / muestras.length)
  const onda = medirOndaFrecuencias(muestras, ANALYSIS_WAVEFORM_BUCKETS, ANALYSIS_SAMPLE_RATE)
  const silence = detectarSilencios(rms, duracionMs, medio)
  const { tempo, rhythm } = detectarTempoYRitmo(rms, bajos, altos, duracionMs, silence.introEndMs, silence.outroStartMs)
  return {
    durationMs: duracionMs,
    waveform: { rms: onda.peaks, bands: onda.bands,
      bucketMs: redondear(duracionMs / ANALYSIS_WAVEFORM_BUCKETS) },
    energy: {
      meanRms: redondear(medio, 6), peakRms: redondear(picoRms, 6),
      dynamicsDb: picoRms && medio ? redondear(20 * Math.log10(picoRms / medio), 2) : 0,
    },
    silence,
    tempo,
    rhythm,
  }
}
