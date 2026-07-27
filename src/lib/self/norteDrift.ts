// SIR V2 — Indicador de DERIVA hacia el norte (E5, "Tu rumbo").
// Determinístico, sin IA: lee tus objetivos y dice si tu energía reciente
// converge en tu NORTE (el objetivo-ancla) o se dispersa. No moraliza ni
// diagnostica — describe el patrón con números y deja que vos leas.
//
// Señales (de Goal[], lo que el panel ya tiene):
//   - ¿hay norte? (un objetivo activo con isAnchor)
//   - hace cuánto lo tocaste (updatedAt del ancla)
//   - cuántos OTROS objetivos activos se movieron hace poco (≤14d)
// Umbrales = heurística declarada (tweakable), NO ciencia.

import type { Goal, ObjectiveStep } from '@/types'
import { resolveAnchorGoal } from '@/lib/year-compass/build'
import { computeGoalAdvance } from '@/lib/goals/advance'

export type NorteDriftState = 'sin_norte' | 'enfocado' | 'a_medias' | 'disperso' | 'estancado'

export interface NorteDrift {
  state: NorteDriftState
  norteTitle: string | null
  norteProgress: number | null
  /** Días desde el último cambio del ancla (null si no hay norte). */
  daysSinceTouch: number | null
  /** Objetivos activos (sin contar el ancla). */
  activeOthers: number
  /** De esos, cuántos se movieron en los últimos 14 días. */
  othersMovedRecently: number
  message: string
}

const DAY = 86_400_000
const RECENT_DAYS = 14
const STALE_DAYS = 45

function daysBetween(now: Date, iso: string): number | null {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  return Math.floor((now.getTime() - t) / DAY)
}

/** ISO más reciente de una lista (ignora inválidos/null). null si no hay ninguno. */
function mostRecentISO(isos: Array<string | null | undefined>): string | null {
  let best: string | null = null
  let bestT = -Infinity
  for (const iso of isos) {
    if (!iso) continue
    const t = Date.parse(iso)
    if (Number.isFinite(t) && t > bestT) { bestT = t; best = iso }
  }
  return best
}

/**
 * @param relatedActivityISO Actividad LIGADA al norte más reciente que el caller
 *   pueda conocer (contacto con personas del objetivo, eventos/recordatorios
 *   ligados). El cómputo de sub-pasos (milestones) se hace acá desde el Goal.
 *   Sin esto el "último avance" ignoraba todo salvo la edición del objetivo →
 *   marcaba "estancado" con movimiento real (mismo bug que la recencia de #941).
 */
export function computeNorteDrift(goals: Goal[], now: Date = new Date(), relatedActivityISO: string | null = null): NorteDrift {
  const active = goals.filter((g) => g.status === 'active')
  // El norte REAL es el que ve el usuario en /panel: ancla explícita si la marcó,
  // si no la INFERIDA (buildYearCompass). No usar isAnchor suelto → "sin norte" falso.
  const anchor = resolveAnchorGoal(active, now)
  const others = anchor ? active.filter((g) => g.id !== anchor.id) : active
  const activeOthers = others.length

  if (!anchor) {
    return {
      state: 'sin_norte',
      norteTitle: null,
      norteProgress: null,
      daysSinceTouch: null,
      activeOthers,
      othersMovedRecently: 0,
      message: activeOthers > 0
        ? 'No tienes un norte fijado. Marca un objetivo como tu norte del año para medir si vas hacia él.'
        : 'Todavía no fijaste objetivos ni un norte.',
    }
  }

  // "Último avance" = lo MÁS RECIENTE entre: edición del objetivo, un hito COMPLETADO,
  // y actividad ligada que el caller conozca (contacto con gente del objetivo, eventos).
  // Antes solo miraba anchor.updatedAt → "estancado" falso aunque hubiera movimiento.
  //
  // OJO (26-jul-2026): `milestones` se conserva por compatibilidad pero NO aporta
  // nada en la práctica — nadie marca un hito como completado en todo el código
  // (`Milestone.completedAt` no se setea en ningún sitio fuera de fixtures y no
  // hay UI para cerrarlo). El avance REAL viaja por `relatedActivityISO`, que los
  // callers arman con `relatedActivityISOForAnchor` incluyendo los pasos cerrados
  // de `objective_steps`. Sin eso el norte se veía estancado hicieras lo que hicieras.
  const milestoneDates = (anchor.milestones ?? []).map((m) => m.completedAt)
  const lastAdvanceISO = mostRecentISO([anchor.updatedAt, ...milestoneDates, relatedActivityISO]) ?? anchor.updatedAt
  const daysSinceTouch = daysBetween(now, lastAdvanceISO) ?? 999
  const othersMovedRecently = others.filter((g) => {
    const d = daysBetween(now, g.updatedAt)
    return d !== null && d <= RECENT_DAYS
  }).length

  let state: NorteDriftState
  let message: string
  const norte = anchor.title

  if (daysSinceTouch > STALE_DAYS) {
    state = 'estancado'
    message = `Hace ${daysSinceTouch} días que no mueves tu norte ("${norte}"). Quedó parado mientras la vida sigue.`
  } else if (othersMovedRecently >= 3 && daysSinceTouch > RECENT_DAYS) {
    state = 'disperso'
    message = `Mueves ${othersMovedRecently} frentes a la vez, pero tu norte ("${norte}") quedó atrás hace ${daysSinceTouch} días. Energía dispersa.`
  } else if (daysSinceTouch <= RECENT_DAYS && othersMovedRecently <= 2) {
    state = 'enfocado'
    message = `Tu energía reciente apunta a tu norte ("${norte}") — lo tocaste hace ${daysSinceTouch} día(s) y no estás disperso.`
  } else {
    state = 'a_medias'
    message = `Avanzas tu norte ("${norte}") pero con varios frentes abiertos (${othersMovedRecently} activos en paralelo). Ojo con dispersarte.`
  }

  return {
    state,
    norteTitle: norte,
    norteProgress: typeof anchor.progress === 'number' ? anchor.progress : null,
    daysSinceTouch,
    activeOthers,
    othersMovedRecently,
    message,
  }
}

/** Persona mínima que el helper necesita (subconjunto de `Person`). */
export interface AnchorRelatedPerson {
  id: string
  lastContact?: string | null
}

/**
 * Calcula la actividad LIGADA al norte más reciente disponible client-side:
 * el `lastContact` MÁS reciente entre las personas ligadas al objetivo-ancla
 * (`anchor.relatedPersons`). Es el `relatedActivityISO` que espera
 * computeNorteDrift → tener contacto reciente con gente del norte des-estanca
 * el panel, igual que completar un hito.
 *
 * PURO. `null` si no hay norte, si el norte no tiene personas ligadas, o si
 * ninguna tiene contacto registrado. Solo mira `lastContact` (dato ya presente
 * en el store de personas del cliente) — NO dispara ningún fetch nuevo.
 *
 * Si el caller pasa `steps` (el store de `objective_steps`), también cuenta el
 * ÚLTIMO PASO CERRADO del ancla — que es el avance real y el que faltaba: los
 * "hitos" de `Goal.milestones` nunca se completan en este código, así que sin
 * los pasos el norte quedaba estancado por construcción.
 *
 * LIMITACIÓN CONOCIDA (mínimo viable): "actividad ligada" hoy = último contacto
 * con personas del ancla + último paso cerrado. Eventos/recordatorios ligados al
 * objetivo NO se consideran acá (no están indexados por objetivo en el cliente
 * sin un fetch extra). Ampliar requeriría cablear esas fuentes cuando estén
 * disponibles sin costo.
 */
export function relatedActivityISOForAnchor(
  goals: Goal[],
  people: AnchorRelatedPerson[],
  now: Date = new Date(),
  steps: ObjectiveStep[] = [],
): string | null {
  const active = goals.filter((g) => g.status === 'active')
  const anchor = resolveAnchorGoal(active, now)
  if (!anchor) return null

  // Último paso cerrado del ancla (avance REAL). Independiente de que el
  // objetivo tenga o no personas ligadas.
  const stepISO = steps.length > 0
    ? computeGoalAdvance(steps, anchor.id, now.toISOString().slice(0, 10)).lastAdvanceISO
    : null

  const linkedIds = new Set(anchor.relatedPersons ?? [])
  const contacts = linkedIds.size > 0
    ? people.filter((p) => linkedIds.has(p.id)).map((p) => p.lastContact)
    : []

  return mostRecentISO([...contacts, stepISO])
}
