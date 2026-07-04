// SIR V2 — Salud del vínculo: tendencia de tono + cadencia vs esperada (15·3),
// ramificada afectivo vs profesional (15·6).
//
// El doc 15 marca que SIR es fuerte DISPARANDO contacto (silencio, fechas) pero
// débil LEYENDO la salud del vínculo: si el tono se enfría, si el contacto se
// ralentiza MÁS de lo normal PARA SU CAPA. Un íntimo enfriándose = señal; un
// peripheral con contacto raro = normal, no alerta. La clave es que el umbral
// dependa de la capa, no un absoluto (aproxima la ratio de Gottman sin fingir
// medirla fina).
//
// LÍNEA ÉTICA (doc 15): NO es un CRM. Nada de "salud 72/100", ni rankings, ni
// cuotas. La lectura es andamiaje para SUGERIR bien, cualitativa. Y el modo
// ramifica el vocabulario: afectivo = presencia/cariño (JAMÁS "gestión" ni
// contacto "estratégico"); profesional = reciprocidad/valor (admite estrategia).
//
// PURO y determinístico (`now` inyectable).

import type { RelationshipType, PersonCategory } from '@/types'

const DAY_MS = 86_400_000

export type RelationshipMode = 'affective' | 'professional'

/** Afectivo (fin en sí mismo) vs profesional/instrumental (admite estrategia). */
export function relationshipMode(rel: RelationshipType): RelationshipMode {
  return rel === 'family' || rel === 'friend' || rel === 'romantic' ? 'affective' : 'professional'
}

export type ToneTrend = 'warming' | 'cooling' | 'steady' | 'insufficient'
export type Cadence = 'ok' | 'stretching' | 'overdue' | 'unknown'

/** Cadencia SANA esperada por capa (días). Un íntimo se espera seguido; un
 *  peripheral, esporádico. El umbral de "atención" es relativo a esto. */
const EXPECTED_DAYS: Record<PersonCategory, number> = {
  inner_circle: 12,
  close: 30,
  network: 90,
  peripheral: 180,
}

export interface InteractionPoint {
  /** Calidad/tono 1-5 (person_logs.value). */
  quality: number
  /** ISO del registro (person_logs.logged_at). */
  at: string
}

export interface LinkHealth {
  mode: RelationshipMode
  toneTrend: ToneTrend
  recentAvgTone: number | null
  earlierAvgTone: number | null
  daysSinceContact: number | null
  expectedDays: number
  cadence: Cadence
  /** true SOLO cuando amerita cuidar/atender (relativo a la capa y el modo). */
  attention: boolean
  /** Guía cualitativa ramificada por modo. null si no hay nada que sugerir. */
  guidance: string | null
}

function avg(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length
}
function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export interface LinkHealthInput {
  relationship: RelationshipType
  category: PersonCategory
  /** ISO del último contacto conocido (people.last_contact), o null. */
  lastContactAt?: string | null
  /** Interacciones registradas (person_logs kind='interaction'), cualquier orden. */
  interactions: InteractionPoint[]
  personName?: string
}

/**
 * Lee la salud del vínculo: hacia dónde va el tono y si la cadencia se estiró
 * más de lo normal PARA SU CAPA. Devuelve una guía cualitativa según el modo.
 */
export function assessLinkHealth(input: LinkHealthInput, now: Date = new Date()): LinkHealth {
  const mode = relationshipMode(input.relationship)
  const expectedDays = EXPECTED_DAYS[input.category] ?? 90
  const nowMs = now.getTime()

  // Ordenar interacciones válidas por fecha asc.
  const pts = input.interactions
    .map((p) => ({ q: Math.round(Number(p.quality)), t: new Date(p.at).getTime() }))
    .filter((p) => Number.isFinite(p.t) && p.q >= 1 && p.q <= 5)
    .sort((a, b) => a.t - b.t)

  // ── Tendencia de tono: mitad vieja vs mitad reciente (necesita ≥4). ──
  let toneTrend: ToneTrend = 'insufficient'
  let recentAvgTone: number | null = null
  let earlierAvgTone: number | null = null
  if (pts.length >= 4) {
    const mid = Math.floor(pts.length / 2)
    earlierAvgTone = round1(avg(pts.slice(0, mid).map((p) => p.q)))
    recentAvgTone = round1(avg(pts.slice(mid).map((p) => p.q)))
    const diff = recentAvgTone - earlierAvgTone
    toneTrend = diff >= 0.5 ? 'warming' : diff <= -0.5 ? 'cooling' : 'steady'
  } else if (pts.length > 0) {
    recentAvgTone = round1(avg(pts.map((p) => p.q)))
  }

  // ── Cadencia: días desde el último contacto vs esperado por capa. ──
  const lastMs = input.lastContactAt
    ? new Date(input.lastContactAt).getTime()
    : pts.length > 0
      ? pts[pts.length - 1].t
      : NaN
  let daysSinceContact: number | null = null
  let cadence: Cadence = 'unknown'
  if (Number.isFinite(lastMs) && lastMs <= nowMs) {
    daysSinceContact = Math.floor((nowMs - lastMs) / DAY_MS)
    const ratio = daysSinceContact / expectedDays
    cadence = ratio > 1.5 ? 'overdue' : ratio > 1 ? 'stretching' : 'ok'
  }

  // ── ¿Amerita atención? Relativo a la capa (no un absoluto). ──
  const closeLayer = input.category === 'inner_circle' || input.category === 'close'
  const coolingNow = toneTrend === 'cooling'
  // Capa cercana: enfriándose O muy pasado de cadencia. Capa lejana: solo si el
  // tono cae y ya está bajo (un vínculo activo que se agria), no por silencio.
  const attention = closeLayer
    ? coolingNow || cadence === 'overdue'
    : coolingNow && (recentAvgTone ?? 5) < 3

  const guidance = buildGuidance({ mode, attention, toneTrend, cadence, daysSinceContact, personName: input.personName })

  return {
    mode,
    toneTrend,
    recentAvgTone,
    earlierAvgTone,
    daysSinceContact,
    expectedDays,
    cadence,
    attention,
    guidance,
  }
}

function firstName(name?: string): string {
  const n = (name ?? '').trim().split(/\s+/)[0]
  return n || 'esta persona'
}

/** Vocabulario ramificado: afectivo = presencia; profesional = valor/reciprocidad. */
function buildGuidance(x: {
  mode: RelationshipMode
  attention: boolean
  toneTrend: ToneTrend
  cadence: Cadence
  daysSinceContact: number | null
  personName?: string
}): string | null {
  if (!x.attention) {
    // Sin atención: solo devolvemos una nota si el tono viene MEJORANDO (refuerzo).
    if (x.toneTrend === 'warming') {
      return x.mode === 'affective'
        ? `El vínculo con ${firstName(x.personName)} viene cálido. Buen momento para estar presente.`
        : `El vínculo con ${firstName(x.personName)} viene en alza. Buen momento para apoyarte en él.`
    }
    return null
  }
  const first = firstName(x.personName)
  if (x.mode === 'affective') {
    if (x.toneTrend === 'cooling') {
      return `El tono con ${first} viene enfriándose. Un momento juntos sin motivo — presencia, no agenda — suele hacer más que cualquier mensaje.`
    }
    return `Hace un tiempo que no se ven${x.daysSinceContact ? ` (${x.daysSinceContact}d)` : ''}. Un gesto de presencia con ${first}, sin nada que resolver.`
  }
  // Profesional: reciprocidad y valor, estrategia sin culpa.
  if (x.toneTrend === 'cooling') {
    return `El vínculo con ${first} se está enfriando. Un aporte de valor (algo útil para él/ella) lo reactiva mejor que un "¿cómo va?".`
  }
  return `Hace ${x.daysSinceContact ?? 'un tiempo'}d sin contacto con ${first}. Un mensaje con valor concreto mantiene la red tibia.`
}
