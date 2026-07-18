// SIR V2 — Tipos de contact_reminders ("recordar antes de contactar"). Mig 0148.

export type ContactReminderKind = 'once' | 'standing'
export type ContactReminderStatus = 'pending' | 'done'

export interface ContactReminder {
  id: string
  personId: string
  text: string
  kind: ContactReminderKind
  status: ContactReminderStatus
  createdAt: string
  doneAt: string | null
}

/** Fila cruda de Supabase → ContactReminder. Tolerante a nulls. */
export function rowToContactReminder(r: Record<string, unknown>): ContactReminder {
  return {
    id: String(r.id ?? ''),
    personId: String(r.person_id ?? ''),
    text: String(r.text ?? ''),
    kind: r.kind === 'standing' ? 'standing' : 'once',
    status: r.status === 'done' ? 'done' : 'pending',
    createdAt: String(r.created_at ?? ''),
    doneAt: (r.done_at as string | null) ?? null,
  }
}

/** Orden de despliegue: contexto permanente (standing) primero, luego los
 *  compromisos puntuales por antigüedad (el más viejo arriba: lleva más
 *  esperando). PURO. */
export function sortContactReminders(rs: ContactReminder[]): ContactReminder[] {
  return [...rs].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'standing' ? -1 : 1
    return a.createdAt.localeCompare(b.createdAt)
  })
}

/** El texto del recordatorio de contacto MÁS relevante (pending, standing antes
 *  que el once más viejo) para surgirlo "antes de contactar" en el push/brief.
 *  null si no hay ninguno pendiente. PURO. */
export function topContactReminderText(rs: ContactReminder[]): string | null {
  const pending = sortContactReminders(rs.filter((r) => r.status === 'pending'))
  return pending[0]?.text.trim() || null
}
