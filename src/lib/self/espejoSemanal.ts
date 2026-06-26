// SIR V2 — Espejo Semanal (Motor #1).
//
// NO es un reporte: es una confrontación honesta entre lo que DECLARASTE querer
// (tu norte + objetivos) y lo que tu DATA dice que hiciste en los últimos 7 días
// (pasos completados, si tocaste el norte, sueño, estrés, y — si se le pasa — las
// interacciones/conflictos de la semana). Aprendizaje de doble bucle: el espejo
// no te informa, te devuelve la brecha a la cara, con números y con cariño
// (también marca lo que SÍ hiciste).
//
// Determinístico, sin IA, sin red. `now` inyectable para tests. La parte
// relacional (interacciones/conflictos) vive en el servidor → se le pasa ya
// resumida (ver /api/self/espejo-relacional); si no se pasa, el espejo igual
// funciona con lo local. Reusa computeNorteDrift (E5).

import type { Goal, ObjectiveStep, SleepRecord, SelfMetric } from '@/types'
import { computeNorteDrift } from './norteDrift'

export type EspejoState = 'sin_datos' | 'sin_norte' | 'a_la_deriva' | 'a_medias' | 'alineado'
export type EspejoSeverity = 'alta' | 'media' | 'leve'

export interface EspejoGap {
  key: string
  label: string
  observed: string
  severity: EspejoSeverity
}

/** Resumen relacional de la semana, calculado en el servidor. Opcional. */
export interface EspejoRelational {
  /** Interacciones (person_logs kind=interaction) en la ventana. */
  interactions: number
  /** De esas, cuántas en tono tenso (value <= 2). */
  tense: number
  /** Conflictos/temas abiertos sin resolver (relationship_moments). */
  openConflicts: number
  /** Título de un conflicto abierto representativo. */
  topConflict?: string | null
}

export interface EspejoSemanal {
  state: EspejoState
  headline: string
  norteTitle: string | null
  gaps: EspejoGap[]
  wins: string[]
  windowDays: number
}

const DAY = 86_400_000
const WINDOW = 7
const SLEEP_TARGET = 7
const STRESS_HIGH = 6.5
const STRESS_CALM = 4

function inWindow(now: Date, iso: string | undefined): boolean {
  if (!iso) return false
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return false
  const age = (now.getTime() - t) / DAY
  return age >= 0 && age <= WINDOW
}
function round1(n: number): string {
  return (Math.round(n * 10) / 10).toString()
}
function avg(nums: number[]): number | null {
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

export function computeEspejoSemanal(
  goals: Goal[],
  steps: ObjectiveStep[],
  sleepRecords: SleepRecord[],
  selfMetrics: SelfMetric[],
  now: Date = new Date(),
  relational?: EspejoRelational,
): EspejoSemanal {
  const drift = computeNorteDrift(goals, now)
  const anchor = goals.find((g) => g.status === 'active' && g.isAnchor) ?? null

  const stepsDone = steps.filter((s) => s.status === 'hecho' && inWindow(now, s.completedAt))
  const norteStepsDone = anchor ? stepsDone.filter((s) => s.objectiveId === anchor.id) : []

  const sleepWin = sleepRecords.filter((r) => inWindow(now, `${r.date}T00:00:00.000Z`))
  const sleepAvg = avg(sleepWin.map((r) => r.duration))

  const stressAvg = avg(
    selfMetrics.filter((m) => m.category === 'stress' && inWindow(now, m.timestamp)).map((m) => m.value),
  )

  const rel = relational
  const hasRel = !!rel && (rel.interactions > 0 || rel.openConflicts > 0)
  const hasAnySignal =
    goals.length > 0 || stepsDone.length > 0 || sleepWin.length > 0 || stressAvg !== null || hasRel

  const gaps: EspejoGap[] = []
  const wins: string[] = []

  // ── NORTE ───────────────────────────────────────────────────────────
  const norteTouched = drift.daysSinceTouch !== null && drift.daysSinceTouch <= WINDOW
  if (anchor) {
    if (norteStepsDone.length === 0 && !norteTouched) {
      gaps.push({
        key: 'norte',
        label: `Tu norte: «${anchor.title}» — lo declaraste como lo más importante`,
        observed: drift.daysSinceTouch !== null
          ? `0 pasos esta semana y sin tocarlo hace ${drift.daysSinceTouch} días`
          : '0 pasos esta semana',
        severity: 'alta',
      })
    } else if (norteStepsDone.length === 0 && norteTouched) {
      gaps.push({
        key: 'norte',
        label: `Tu norte: «${anchor.title}»`,
        observed: 'lo tocaste, pero no cerraste ningún paso concreto esta semana',
        severity: 'media',
      })
    } else {
      wins.push(`Diste ${norteStepsDone.length} paso(s) en tu norte esta semana.`)
    }

    const otherStepsDone = stepsDone.length - norteStepsDone.length
    if (otherStepsDone > 0 && norteStepsDone.length === 0) {
      gaps.push({
        key: 'dispersion',
        label: 'Te moviste, pero no hacia tu norte',
        observed: `${otherStepsDone} paso(s) cerrados esta semana, ninguno en tu norte`,
        severity: 'media',
      })
    }
  }

  // ── RELACIONAL (interacciones / conflictos de la semana) ────────────
  if (rel) {
    if (rel.openConflicts > 0) {
      gaps.push({
        key: 'conflicto_abierto',
        label: rel.openConflicts === 1 ? 'Tenés un conflicto abierto sin cerrar' : `Tenés ${rel.openConflicts} conflictos abiertos sin cerrar`,
        observed: rel.topConflict ? `el más caliente: «${rel.topConflict}»` : 'siguen pendientes de resolverse',
        severity: rel.openConflicts >= 2 ? 'alta' : 'media',
      })
    }
    if (rel.tense >= 2) {
      gaps.push({
        key: 'conflicto',
        label: 'Semana áspera con tu gente',
        observed: `${rel.tense} de ${rel.interactions} charlas en tono tenso`,
        severity: rel.tense >= 3 ? 'alta' : 'media',
      })
    } else if (rel.interactions > 0 && rel.tense === 0) {
      wins.push('Tus charlas de la semana fueron en buen tono.')
    }
  }

  // ── SUEÑO ───────────────────────────────────────────────────────────
  if (sleepAvg !== null) {
    if (sleepAvg < 6) {
      gaps.push({ key: 'sueño', label: 'Sueño: tu cuerpo es la base de todo lo que querés lograr', observed: `dormiste ${round1(sleepAvg)} h promedio esta semana`, severity: 'alta' })
    } else if (sleepAvg < 6.5) {
      gaps.push({ key: 'sueño', label: 'Sueño: venís corto', observed: `${round1(sleepAvg)} h promedio (apuntá a ${SLEEP_TARGET})`, severity: 'media' })
    } else if (sleepAvg >= SLEEP_TARGET) {
      wins.push(`Dormiste bien (${round1(sleepAvg)} h promedio).`)
    }
  }

  // ── ESTRÉS ──────────────────────────────────────────────────────────
  if (stressAvg !== null) {
    if (stressAvg >= STRESS_HIGH) {
      gaps.push({ key: 'estrés', label: 'Estrés: la semana te pesó', observed: `${round1(stressAvg)}/10 promedio`, severity: stressAvg >= 8 ? 'alta' : 'media' })
    } else if (stressAvg <= STRESS_CALM) {
      wins.push(`Semana tranquila (estrés ${round1(stressAvg)}/10).`)
    }
  }

  // ── ESTADO + TITULAR ────────────────────────────────────────────────
  let state: EspejoState
  let headline: string
  if (!hasAnySignal) {
    state = 'sin_datos'
    headline = 'Todavía no hay suficientes registros de esta semana para devolverte un reflejo honesto.'
  } else if (!anchor) {
    state = 'sin_norte'
    headline = 'No tenés un norte fijado. Sin él no hay vara para medir si la semana te acercó o te alejó.'
  } else {
    const hasAlta = gaps.some((g) => g.severity === 'alta')
    if (hasAlta) {
      state = 'a_la_deriva'
      headline = 'Esta semana te alejaste de lo que dijiste querer.'
    } else if (gaps.length > 0) {
      state = 'a_medias'
      headline = 'Vas hacia tu norte, pero con fugas.'
    } else {
      state = 'alineado'
      headline = 'Esta semana caminaste hacia tu norte.'
    }
  }

  return { state, headline, norteTitle: anchor?.title ?? null, gaps, wins, windowDays: WINDOW }
}
