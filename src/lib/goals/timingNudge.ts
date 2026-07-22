// SIR V2 — Nudge "buen momento para avanzar un objetivo con una persona".
//
// EL LOOP ORIGINAL DEL READER (caso Dayana / Marlab): Aaron tenía pendiente
// pedirle a Dayana el contacto de un proveedor; su historia de IG mostró que
// estaba de viaje = mal timing. SIR computaba la actividad social (contact_
// activity) Y sabe qué objetivos están ligados a qué personas (goal.
// relatedPersons) — pero NUNCA cruzaba las dos cosas. Esto lo cierra: cuando una
// persona ligada a un objetivo activo con acción pendiente muestra BUEN momento
// (historia activa hoy), SIR lo avisa proactivo en el brief. PURO.

export interface GoalTimingCandidate {
  personName: string
  goalTitle: string
  /** La acción pendiente del objetivo con esa persona (next_action / obstáculo). */
  pendingAction: string
  /** Por qué es buen momento ("anda activa hoy"). */
  signalDetail: string
  /** ISO de la señal — para quedarse con la más fresca. */
  observedAt: string
}

const ACTION_CAP = 70
const GOAL_CAP = 44

function clip(s: string, n: number): string {
  const t = s.trim()
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t
}

/**
 * Arma el nudge de la MEJOR oportunidad (persona con buen momento + objetivo
 * activo + acción pendiente). Se queda con la señal más reciente. null si no hay.
 */
export function buildGoalTimingNudge(candidates: GoalTimingCandidate[]): string | null {
  const valid = candidates.filter(
    (c) => c.personName.trim() && c.goalTitle.trim() && c.pendingAction.trim() && c.signalDetail.trim(),
  )
  if (valid.length === 0) return null

  const best = [...valid].sort((a, b) => (a.observedAt < b.observedAt ? 1 : a.observedAt > b.observedAt ? -1 : 0))[0]
  const who = best.personName.split(' ')[0] // primer nombre, más cálido
  return `⏳ Buen momento con ${who}: ${best.signalDetail.trim()}. Tienes pendiente «${clip(best.pendingAction, ACTION_CAP)}» (${clip(best.goalTitle, GOAL_CAP)}).`
}
