// SIR V2 — Hábitos: nudge proactivo (lógica pura). Etapa 3 — loop comportamiento.
//
// A partir del estado de los hábitos, devuelve UN mensaje gentil para mostrar
// donde el usuario aterriza (Mission Control). Filosofía bienestar > culpa:
// un día perdido NO se reprocha; se invita a retomar. Sin emoji.
//
// Prioridad: (1) racha rota que vale la pena recuperar, (2) pendientes de hoy,
// (3) todo cumplido (refuerzo positivo). PURA + determinística.

import { computeHabitStreak } from './streak'

export type NudgeTone = 'recover' | 'nudge' | 'win'
export interface HabitNudge {
  tone: NudgeTone
  text: string
  /**
   * A QUÉ hábito apunta el mensaje, cuando apunta a uno solo.
   *
   * Aaron, 31-jul-2026: *"antes SIR me mandaba por Telegram una lista de mis
   * pendientes y ahí podía marcar uno por uno lo que había hecho, como tender la
   * cama; ahora me mandó todo junto y no puedo marcar que hice una sola cosa"*.
   *
   * La causa: el nudge devolvía SOLO texto, así que el brief no sabía a qué hábito
   * se refería y no podía ofrecer "✅ ya lo hice". El único botón que quedaba era
   * 🔕 (silenciar) — podía callar el recordatorio pero no marcar el hábito.
   */
  habitId?: string | null
  habitTitle?: string | null
}

export interface NudgeHabit {
  /** Id del hábito. Sin esto el brief no puede ofrecer el botón de "hecho". */
  id?: string | null
  title: string
  checkinDates: string[]
}

export function habitNudge(habits: NudgeHabit[], today: Date = new Date()): HabitNudge | null {
  if (!habits || habits.length === 0) return null

  const states = habits.map((h) => ({ id: h.id ?? null, title: h.title, s: computeHabitStreak(h.checkinDates, today) }))

  // (1) Recuperar: existió una racha real (>=3) y hoy está en 0 → invitar a retomar.
  const broke = states.find((x) => x.s.longest >= 3 && x.s.current === 0)
  if (broke) {
    return {
      tone: 'recover',
      // "retómala", NO "retomala": el voseo está prohibido en todo lo que Aaron lee
      // (CLAUDE.md) y este texto se le estaba llegando así por Telegram.
      text: `Se cortó tu racha de "${broke.title}". Un día no la define — retómala hoy.`,
      habitId: broke.id,
      habitTitle: broke.title,
    }
  }

  // (2) Pendientes de hoy.
  const undone = states.filter((x) => !x.s.doneToday)
  if (undone.length === 0) {
    return { tone: 'win', text: 'Marcaste todos tus hábitos hoy. Sigue así.' }
  }
  if (undone.length === states.length) {
    // Sin voseo: "Arranca"/"marca", no "Arrancá"/"marcá".
    const uno = states.length === 1
    return {
      tone: 'nudge',
      text: `Arranca el día: marca ${uno ? 'tu hábito' : 'tus hábitos'}.`,
      // Con un solo hábito pendiente el mensaje SÍ apunta a uno → se puede marcar.
      habitId: uno ? states[0].id : null,
      habitTitle: uno ? states[0].title : null,
    }
  }
  return {
    tone: 'nudge',
    text: `Te ${undone.length === 1 ? 'falta 1 hábito' : `faltan ${undone.length} hábitos`} por marcar hoy.`,
    habitId: undone.length === 1 ? undone[0].id : null,
    habitTitle: undone.length === 1 ? undone[0].title : null,
  }
}
