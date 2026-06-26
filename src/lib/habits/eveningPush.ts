// SIR V2 — Hábitos: recordatorio suave NOCTURNO (lógica pura). UN solo push
// consolidado con los hábitos DIARIOS que siguen pendientes al final del día.
// No una alarma por hábito (eso cansa y sube la ansiedad). Si no hay nada
// pendiente → null (no se envía). Los semanales NO se naggean de noche: son
// flexibles a lo largo de la semana.
import { computeHabitStreak } from './streak'

export interface EveningHabit {
  title: string
  cadence: 'daily' | 'weekly'
  checkinDates: string[]
}
export interface EveningPush { title: string; body: string }

export function buildEveningHabitsPush(habits: EveningHabit[], today: Date = new Date()): EveningPush | null {
  if (!habits || habits.length === 0) return null
  const pending = habits
    .filter((h) => h.cadence !== 'weekly')
    .filter((h) => !computeHabitStreak(h.checkinDates, today).doneToday)
    .map((h) => h.title.trim())
    .filter(Boolean)
  if (pending.length === 0) return null

  const shown = pending.slice(0, 3)
  let list = shown.join(', ')
  if (pending.length > shown.length) list += ` +${pending.length - shown.length}`
  const body = pending.length === 1
    ? `Te falta marcar: ${list}. Si lo hiciste, registralo antes de dormir.`
    : `Te faltan ${pending.length}: ${list}. Cerrá el día marcando lo que hiciste.`
  return { title: 'Antes de cerrar el día', body }
}
