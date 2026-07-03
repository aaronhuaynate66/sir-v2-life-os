// SIR V2 — Disparo de recordatorios vencidos (camino SIN COSTO, plan Hobby).
//
// En Hobby el cron solo corre 1×/día, así que un recordatorio de "hoy 3pm" no
// puede depender solo del server. Solución gratis: cuando Aaron TIENE la app
// abierta, un watcher client-side chequea los vencidos cada par de minutos (y al
// re-enfocar la pestaña) y los muestra (toast + notificación del browser). El
// cron diario queda de RESPALDO para lo que se venció con la app cerrada.
//
// Esta es la capa pura: decidir qué está vencido y armar el texto de la
// notificación. La red (fetch/marcar notified) vive en el watcher + endpoint.

export interface DueReminder {
  id: string
  text: string
  due_at: string
  done_at: string | null
  notified_at: string | null
  person_name?: string | null
  person_slug?: string | null
}

/**
 * Filtra los que están vencidos (due_at <= ahora), sin resolver (done_at null) y
 * sin avisar todavía (notified_at null). Determinístico — `nowMs` inyectable.
 */
export function selectDue<T extends { due_at: string; done_at: string | null; notified_at: string | null }>(
  reminders: T[],
  nowMs: number,
): T[] {
  return reminders.filter((r) => {
    if (r.done_at != null || r.notified_at != null) return false
    const t = Date.parse(r.due_at)
    return Number.isFinite(t) && t <= nowMs
  })
}

/** Contenido de la notificación de un recordatorio (título, cuerpo, deep-link). */
export function reminderNotice(r: DueReminder): { title: string; body: string; url: string } {
  const title = r.person_name ? `Recordatorio · ${r.person_name}` : 'Recordatorio'
  const url = r.person_slug ? `/relaciones/${r.person_slug}` : '/panel'
  return { title, body: r.text, url }
}
