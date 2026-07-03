'use client'
// SIR V2 — DueRemindersWatcher (camino sin costo, plan Hobby).
//
// Componente invisible montado en el AppShell. Mientras Aaron tiene la app
// abierta, chequea los recordatorios vencidos y los muestra: toast (siempre) +
// notificación del browser (si dio permiso, sirve aunque la pestaña esté de
// fondo). Chequea al montar, cada 2 min, y al re-enfocar la pestaña.
//
// El endpoint /api/reminders/fire-due marca notified_at, así que cada
// recordatorio se muestra UNA vez. El cron diario queda de respaldo para lo que
// se vence con la app cerrada.

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { reminderNotice, type DueReminder } from '@/lib/reminders/due'

const POLL_MS = 120_000 // 2 min: barato (una query indexada) y suficiente en foco.

export function DueRemindersWatcher() {
  // Evita disparos concurrentes (interval + visibilitychange a la vez).
  const running = useRef(false)

  useEffect(() => {
    let alive = true

    async function check() {
      if (running.current || document.visibilityState !== 'visible') return
      running.current = true
      try {
        const res = await fetch('/api/reminders/fire-due', { method: 'POST', cache: 'no-store' })
        if (!res.ok) return
        const j = (await res.json()) as { reminders?: DueReminder[] }
        if (!alive) return
        for (const r of j.reminders ?? []) {
          const n = reminderNotice(r)
          // Toast in-app (siempre visible con la app abierta).
          toast(n.title, { description: n.body, duration: 8000 })
          // Notificación del browser (si hay permiso) — visible aunque la
          // pestaña esté de fondo. Click → deep-link a la persona/panel.
          try {
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              const notif = new Notification(n.title, { body: n.body, tag: `reminder-${r.id}` })
              notif.onclick = () => { window.focus(); window.location.href = n.url }
            }
          } catch { /* algunos browsers bloquean new Notification fuera de user gesture */ }
        }
      } catch { /* silencioso: el cron diario es el respaldo */ } finally {
        running.current = false
      }
    }

    // 1) Al montar.
    void check()
    // 2) Cada 2 min.
    const id = window.setInterval(() => void check(), POLL_MS)
    // 3) Al re-enfocar la pestaña (volver a SIR tras estar en otra app).
    const onVis = () => { if (document.visibilityState === 'visible') void check() }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      alive = false
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  return null
}
