// SIR V2 — Cruce estaciones × sustrato vivido (E5, Life Direction System).
//
// Las estaciones (lifeSeasons) segmentan la vida en capítulos DESDE LOS OBJETIVOS
// —qué te propusiste y cerraste—. Pero el capítulo también se VIVIÓ: cómo dormiste,
// con qué ánimo/energía andabas, qué momentos marcaste. Ese sustrato vive en /linea
// (selfMetrics, sleepRecords, memories) pero nunca tocaba las estaciones: dos ejes
// temporales separados.
//
// Este módulo los cruza: por la ventana [startDate, endDate] de una estación, resume
// el sustrato vivido en un puñado de "vitals" honestos + una línea "cómo la viviste".
// PURO: recibe el sustrato ya cargado (sin red, sin stores), compara por día ISO
// (YYYY-MM-DD, sin TZ para evitar off-by-one). Estados null explícitos cuando no hay
// datos —jamás inventa un promedio de la nada.

/** Un registro de ánimo/energía (subconjunto de SelfMetric). */
export interface SubstrateMetric {
  category: string // 'mood' | 'energy' | 'stress' | …
  value: number // escala /10 (como lo muestra /linea)
  timestamp: string // ISO
}

/** Una noche (subconjunto de SleepRecord). */
export interface SubstrateSleep {
  date: string // ISO date-only
  duration: number // horas
  quality: number // 1-10
}

/** Un momento (subconjunto de Memory). */
export interface SubstrateMemory {
  type: string // 'episodic' | 'emotional' | 'temporal' | … (solo esos cuentan)
  timestamp: string // ISO
  importance: number
  title?: string
  content?: string
  source?: string
  isPrivate?: boolean
}

export interface SeasonSubstrateInput {
  metrics: SubstrateMetric[]
  sleep: SubstrateSleep[]
  memories: SubstrateMemory[]
}

export interface SeasonVitals {
  /** Promedio de ánimo (/10) en la ventana; null si no hubo registros. */
  moodAvg: number | null
  /** Promedio de energía (/10); null si no hubo registros. */
  energyAvg: number | null
  /** Horas de sueño promedio; null si no hubo registros. */
  sleepHoursAvg: number | null
  /** Momentos que marcaste (memorias importantes, no privadas) en la ventana. */
  markedMoments: number
  /** Título del momento más importante de la ventana, o null. */
  topMoment: string | null
  /** ¿Hubo algún sustrato en la ventana? (si no, el panel no muestra nada). */
  hasSubstrate: boolean
  /** Una línea "cómo la viviste", o null si no hay nada que decir. */
  line: string | null
}

/** Mismo criterio que lifeThread.memoryMilestones: solo memorias que son un
 *  MOMENTO real (episódica/emocional/temporal), importantes o marcadas a mano —
 *  no registros de sistema ni perfiles. Sin esto, "94 momentos" es puro ruido. */
const MIN_MEMORY_IMPORTANCE = 7
const EVENT_TYPES = new Set(['episodic', 'emotional', 'temporal'])
const GENERIC_TITLES = new Set(['Interacción registrada', 'Conversación reciente (WhatsApp)'])
const TOP_MOMENT_MAX = 60

/** Texto legible del momento: título si es real (no genérico), si no el contenido. */
function momentText(m: SubstrateMemory): string {
  const t = (m.title ?? '').trim()
  if (t && !GENERIC_TITLES.has(t)) return t
  return (m.content ?? '').trim()
}

/** ¿La memoria es un MOMENTO que vale contar en el capítulo? */
function isMoment(m: SubstrateMemory): boolean {
  if (m.isPrivate) return false
  if (!EVENT_TYPES.has(m.type)) return false
  if (!(m.importance >= MIN_MEMORY_IMPORTANCE || m.source === 'manual')) return false
  return momentText(m).length > 0
}

/** El día ISO (YYYY-MM-DD) de un timestamp ISO. '' si no parsea. */
function dayOf(iso: string): string {
  if (typeof iso !== 'string' || iso.length < 10) return ''
  const day = iso.slice(0, 10)
  // Validación barata: YYYY-MM-DD.
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : ''
}

/** ¿El día cae dentro de [start, end] inclusive? (comparación lexicográfica ISO). */
function inWindow(day: string, start: string, end: string): boolean {
  return day !== '' && day >= start && day <= end
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null
  const sum = nums.reduce((a, b) => a + b, 0)
  return Math.round((sum / nums.length) * 10) / 10
}

function truncate(s: string, max: number): string {
  const clean = s.trim()
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`
}

/**
 * Resume el sustrato vivido en la ventana [startDate, endDate] de una estación.
 * Fechas ISO date-only (las que expone LifeSeason). PURO.
 */
export function summarizeSeasonSubstrate(
  startDate: string,
  endDate: string,
  input: SeasonSubstrateInput,
): SeasonVitals {
  const mood: number[] = []
  const energy: number[] = []
  for (const m of input.metrics ?? []) {
    if (!inWindow(dayOf(m.timestamp), startDate, endDate)) continue
    if (m.category === 'mood') mood.push(m.value)
    else if (m.category === 'energy') energy.push(m.value)
  }

  const sleepHours: number[] = []
  for (const s of input.sleep ?? []) {
    if (inWindow(dayOf(s.date), startDate, endDate) && Number.isFinite(s.duration)) {
      sleepHours.push(s.duration)
    }
  }

  let markedMoments = 0
  let topMoment: string | null = null
  let topImportance = -Infinity
  for (const mem of input.memories ?? []) {
    if (!inWindow(dayOf(mem.timestamp), startDate, endDate)) continue
    if (!isMoment(mem)) continue
    markedMoments += 1
    if (mem.importance > topImportance) {
      topImportance = mem.importance
      topMoment = truncate(momentText(mem), TOP_MOMENT_MAX)
    }
  }

  const moodAvg = avg(mood)
  const energyAvg = avg(energy)
  const sleepHoursAvg = avg(sleepHours)
  // La línea es solo lo PROMEDIABLE (sueño/ánimo/energía). Los "momentos" NO se
  // cuentan en la frase: con imports masivos de chat el conteo se infla (90+) y
  // deja de significar nada. Se representan por el que MÁS pesó (topMoment).
  const line = buildLine(sleepHoursAvg, moodAvg, energyAvg)
  const hasSubstrate = line !== null || topMoment !== null

  return {
    moodAvg,
    energyAvg,
    sleepHoursAvg,
    markedMoments,
    topMoment,
    hasSubstrate,
    line,
  }
}

/** "Cómo la viviste" en una frase — solo las métricas con datos. null si ninguna. */
function buildLine(sleep: number | null, mood: number | null, energy: number | null): string | null {
  const bits: string[] = []
  if (sleep !== null) bits.push(`dormiste ${sleep}h`)
  if (mood !== null) bits.push(`ánimo ${mood}/10`)
  if (energy !== null) bits.push(`energía ${energy}/10`)
  if (bits.length === 0) return null
  return `${capitalize(bits.join(', '))}.`
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1)
}
