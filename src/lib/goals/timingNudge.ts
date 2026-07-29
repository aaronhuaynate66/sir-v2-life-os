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
  /**
   * ISO de la última vez que se TOCÓ el objetivo (`goals.updated_at`). Sirve para
   * no presentar como pendiente vivo un texto viejo.
   *
   * POR QUÉ (fricción real, 29-jul-2026). Aaron: *"sigo sin entender por qué me
   * habla de pasarle cotización de las cámaras, algo está mal y ya habíamos
   * hablado de esto"*. Era `next_action = "Pasarle cotización a Miluska
   * (landing/cámaras)"`, escrito el **16-jun** y nunca tocado: 43 días. Él ya lo
   * había cuestionado el 24-jul ("¿qué cotización me hablas?") y SIR le DEFENDIÓ
   * el campo en vez de leer su duda como la señal de que estaba viejo.
   *
   * `next_action` es texto libre SIN ciclo de vida: nadie lo marca hecho, nada lo
   * vence. Presentarlo sin decir su edad lo hace parecer fresco.
   */
  goalUpdatedAt?: string | null
}

const ACTION_CAP = 70
const GOAL_CAP = 44
/** Más viejo que esto, la acción pendiente se muestra CON su edad. */
export const STALE_ACTION_DAYS = 21
/** Y más viejo que esto ya no se propone: es un residuo, no un pendiente. */
export const DEAD_ACTION_DAYS = 60

function daysSince(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  return Math.floor((now.getTime() - t) / 86_400_000)
}

function clip(s: string, n: number): string {
  const t = s.trim()
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t
}

/**
 * Arma el nudge de la MEJOR oportunidad (persona con buen momento + objetivo
 * activo + acción pendiente). Se queda con la señal más reciente. null si no hay.
 */
export function buildGoalTimingNudge(
  candidates: GoalTimingCandidate[],
  now: Date = new Date(),
): string | null {
  const valid = candidates.filter((c) => {
    if (!c.personName.trim() || !c.goalTitle.trim() || !c.pendingAction.trim() || !c.signalDetail.trim()) return false
    // Un `next_action` que lleva DEAD_ACTION_DAYS sin tocarse no es un pendiente:
    // es un residuo. Seguir empujándolo es lo que hizo que Aaron recibiera 43 días
    // seguidos una cotización que ya no existía.
    const edad = daysSince(c.goalUpdatedAt, now)
    return edad === null || edad < DEAD_ACTION_DAYS
  })
  if (valid.length === 0) return null

  const best = [...valid].sort((a, b) => (a.observedAt < b.observedAt ? 1 : a.observedAt > b.observedAt ? -1 : 0))[0]
  const who = best.personName.split(' ')[0] // primer nombre, más cálido
  // La EDAD va en el texto cuando el pendiente ya tiene semanas: así Aaron ve de
  // una que es un apunte viejo y no algo que acordó ayer. Decirlo es más honesto
  // que presentarlo como fresco y que él tenga que preguntar "¿de qué me hablas?".
  const edad = daysSince(best.goalUpdatedAt, now)
  const antiguedad = edad !== null && edad >= STALE_ACTION_DAYS
    ? ` — lo anotaste hace ${edad} días, dime si ya no aplica`
    : ''
  return `⏳ Buen momento con ${who}: ${best.signalDetail.trim()}. Tienes pendiente «${clip(best.pendingAction, ACTION_CAP)}» (${clip(best.goalTitle, GOAL_CAP)})${antiguedad}.`
}
