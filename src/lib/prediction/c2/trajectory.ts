// SIR V2 — Motor de predicción C2: pronóstico de trayectoria del vínculo. PURO.
//
// "C2 = los demás". A diferencia del motor proactivo (que dice a quién contactar
// AHORA) esto es la capa FORECAST: proyecta qué vínculos se van a quedar DORMIDOS
// —y en cuántas semanas— si sigue el ritmo de silencio actual. Base científica:
// los lazos decaen de forma predecible sin mantenimiento (Roberts & Dunbar: la
// fuerza del vínculo cae con la falta de contacto; Granovetter: fuerza ~ frecuencia).
//
// Señal: la CADENCIA de contacto (mediana de los gaps entre interacciones) vs el
// silencio actual. Si el silencio ya superó la cadencia normal y se agranda, se
// proyecta cuándo cruza el umbral de "dormido". Honesto: `insufficient` con < 3
// contactos; confianza según cantidad y regularidad. Es orientativo — proyecta el
// silencio, no lee la relación.

import { median } from '@/lib/stats/regression'
import { contactDays, gapsBetweenDays } from '@/lib/people/contactRhythm'

const DAY = 86_400_000
const MIN_CONTACTS = 3
const DORMANT_MIN_DAYS = 60 // piso del umbral de "dormido" (aunque la cadencia sea corta)

export type TrajectoryStatus = 'steady' | 'cooling' | 'going_dormant' | 'dormant' | 'insufficient'

export interface TrajectoryInput {
  id: string
  name: string
  /** Timestamps (ms) de contactos REALES (no marcadores de import). */
  interactionsMs: number[]
  /** Último contacto conocido (ms), si la app lo mantiene aparte. Se usa el más
   *  reciente entre este y el último de interactionsMs. */
  lastContactMs?: number | null
}

export interface PersonTrajectory {
  id: string
  name: string
  status: TrajectoryStatus
  /** Cadencia histórica (mediana de gaps), en días. null si insuficiente. */
  cadenceDays: number | null
  /** Días desde el último contacto. */
  silenceDays: number | null
  /** Umbral de "dormido" para esta persona (días). */
  dormantThresholdDays: number | null
  /** Semanas hasta quedar dormido al ritmo actual. null si steady/dormant/insuf. */
  weeksToDormant: number | null
  confidence: 'baja' | 'media'
  basis: string
}

function round1(x: number): number {
  return Math.round(x * 10) / 10
}

/** Pronostica la trayectoria de cada vínculo. Determinístico. */
export function forecastTrajectories(people: TrajectoryInput[], nowMs: number): PersonTrajectory[] {
  const out: PersonTrajectory[] = []

  for (const p of people) {
    // Un "contacto" es un DÍA, no un log: varios logs el mismo día colapsan a uno
    // (primitivo compartido con la cadencia de /relaciones y el proactivo →
    // mismo ritmo en toda la app). lastMs se toma de los ms CRUDOS (hora real).
    const days = contactDays(p.interactionsMs, nowMs)
    const lastMs = p.interactionsMs
      .filter((t) => Number.isFinite(t) && t <= nowMs)
      .reduce((mx, t) => Math.max(mx, t), p.lastContactMs ?? -Infinity)

    if (days.length < MIN_CONTACTS || !Number.isFinite(lastMs)) {
      out.push({
        id: p.id, name: p.name, status: 'insufficient',
        cadenceDays: null, silenceDays: null, dormantThresholdDays: null,
        weeksToDormant: null, confidence: 'baja',
        basis: `pocos contactos registrados (${days.length}) para leer una cadencia`,
      })
      continue
    }

    // Gaps (días enteros) entre días de contacto consecutivos.
    const gaps = gapsBetweenDays(days)
    const cadence = median(gaps) ?? 0
    const silenceDays = (nowMs - lastMs) / DAY
    const dormantThreshold = Math.max(DORMANT_MIN_DAYS, cadence * 3)

    // Regularidad: baja dispersión de gaps → más confianza. (coef. variación)
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length
    const sd = Math.sqrt(gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length)
    const cv = mean > 0 ? sd / mean : 1
    const confidence: 'baja' | 'media' = days.length >= 6 && cv <= 0.8 ? 'media' : 'baja'

    let status: TrajectoryStatus
    let weeksToDormant: number | null = null

    if (silenceDays >= dormantThreshold) {
      status = 'dormant'
    } else if (silenceDays <= cadence * 1.3) {
      status = 'steady' // dentro del ritmo normal
    } else {
      // El silencio ya superó la cadencia normal → el vínculo se está enfriando.
      // Al ritmo actual, faltan (umbral - silencio) días para quedar dormido.
      const daysLeft = Math.max(0, dormantThreshold - silenceDays)
      weeksToDormant = round1(daysLeft / 7)
      status = weeksToDormant <= 3 ? 'going_dormant' : 'cooling'
    }

    const basis =
      status === 'dormant'
        ? `sin contacto hace ${Math.round(silenceDays)}d (cadencia normal ~${Math.round(cadence)}d)`
        : status === 'steady'
          ? `al día con su ritmo (~cada ${Math.round(cadence)}d)`
          : `hace ${Math.round(silenceDays)}d sin contacto vs cadencia ~${Math.round(cadence)}d`

    out.push({
      id: p.id, name: p.name, status,
      cadenceDays: round1(cadence), silenceDays: Math.round(silenceDays),
      dormantThresholdDays: Math.round(dormantThreshold), weeksToDormant, confidence, basis,
    })
  }

  return out
}

/** Solo los vínculos con trayectoria de enfriamiento, del más urgente al menos
 *  (menos semanas para quedar dormido primero). Para surfacear. */
export function coolingSoon(trajectories: PersonTrajectory[]): PersonTrajectory[] {
  return trajectories
    .filter((t) => t.status === 'going_dormant' || t.status === 'cooling')
    .sort((a, b) => (a.weeksToDormant ?? Infinity) - (b.weeksToDormant ?? Infinity))
}
