// SIR V2 — Check-in de hábitos por BOTONES (Telegram). PURO, testeable.
//
// Aaron: marcar hábitos escribiendo "ya medité" es menos UX-friendly que el flujo
// de botones que SIR ya usa para agendar planes (✅ Guardar / ✗ Descartar). Esto
// arma la lista de hábitos DIARIOS que siguen pendientes hoy, para mandarlos como
// botones (un toque por hábito) en el cierre de la noche o a pedido.

export interface HabitForCheckin {
  id: string
  title: string
  cadence: string
  /** Fechas YYYY-MM-DD con check-in (ventana reciente). */
  checkinDates: string[]
}

export interface PendingHabit {
  id: string
  title: string
}

/** Hábitos DIARIOS sin check-in en `todayStr` (los que faltan marcar hoy). PURO. */
export function pendingDailyHabits(habits: HabitForCheckin[], todayStr: string): PendingHabit[] {
  return habits
    .filter((h) => (h.cadence === 'weekly' ? false : true)) // solo diarios
    .filter((h) => !h.checkinDates.includes(todayStr))
    .map((h) => ({ id: h.id, title: h.title }))
}

/** callback_data para el tap de un hábito. Telegram corta a 64 bytes → id corto. */
export function habitCallbackData(habitId: string): string {
  return `hb|${habitId}`.slice(0, 64)
}

/** Parsea el callback_data de un tap de hábito. null si no es uno. */
export function parseHabitCallback(data: string): string | null {
  if (!data.startsWith('hb|')) return null
  const id = data.slice(3).trim()
  return id || null
}
