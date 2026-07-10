'use client'

// SIR V2 — Calendario proactivo: "SIR puede agendar esto".
//
// Ahora que SIR escribe en Google Calendar, ofrece agendar con un clic las
// fechas próximas de tu gente (cumpleaños + fechas importantes) que todavía no
// están en el calendario. Solo aparece si hay una conexión Google con escritura.
// La escritura la hace POST /api/calendar/events (mismo camino ya probado).

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { CalendarPlus, Loader2, Check, Gift, CalendarClock } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { SectionTitle } from '@/components/ui/section-title'
import { useRelationshipStore } from '@/stores/useRelationshipStore'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { collectAgendables, type Agendable } from '@/lib/calendar/agendables'

interface CalEvent { title?: string }

export function AgendablesPanel() {
  const hydrated = useHasHydrated()
  const people = useRelationshipStore((s) => s.people)
  const [hasGoogle, setHasGoogle] = useState<boolean | null>(null)
  const [existingTitles, setExistingTitles] = useState<string[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [busyKey, setBusyKey] = useState<string | null>(null)

  useEffect(() => {
    let cancel = false
    // ¿Hay conexión Google con escritura? Si no, el panel no aparece.
    void fetch('/api/calendar/connections', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { connections: [] }))
      .then((j: { connections?: Array<{ provider?: string; enabled?: boolean }> }) => {
        if (cancel) return
        setHasGoogle((j.connections ?? []).some((c) => c.provider === 'google' && c.enabled !== false))
      })
      .catch(() => { if (!cancel) setHasGoogle(false) })
    // Eventos ya en el calendario → para no proponer duplicados.
    void fetch('/api/calendar?days=60&limit=200', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { events: [] }))
      .then((j: { events?: CalEvent[] }) => {
        if (cancel) return
        setExistingTitles((j.events ?? []).map((e) => e.title ?? '').filter(Boolean))
      })
      .catch(() => {})
    return () => { cancel = true }
  }, [])

  const agendables = useMemo(() => {
    if (!hydrated) return []
    return collectAgendables(people, existingTitles).filter((a) => !dismissed.has(a.key))
  }, [hydrated, people, existingTitles, dismissed])

  if (!hydrated || hasGoogle !== true || agendables.length === 0) return null

  async function agendar(a: Agendable) {
    setBusyKey(a.key)
    try {
      const res = await fetch('/api/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: a.title, start: a.date, allDay: true, recurring: a.recurring }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string; detail?: string }
      if (!res.ok) {
        toast.error(j.error ?? 'No se pudo agendar', { description: j.detail })
        return
      }
      setDismissed((prev) => new Set(prev).add(a.key))
      toast.success('Agendado en Google Calendar', { description: a.title })
    } catch {
      toast.error('No se pudo agendar (revisá tu conexión).')
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <Card className="shadow-none mb-6 border-brand/30">
      <CardContent className="p-4 sm:p-5">
        <SectionTitle icon={CalendarPlus} label="SIR puede agendar esto" />
        <p className="text-xs text-muted-foreground mt-1 mb-3 leading-relaxed">
          Fechas próximas de tu gente que todavía no están en tu Google Calendar. Un clic y las pongo.
        </p>
        <ul className="space-y-2">
          {agendables.slice(0, 8).map((a) => {
            const isBirthday = /cumple|birthday|nacim/i.test(a.title)
            const when = a.daysUntil === 0 ? 'hoy' : a.daysUntil === 1 ? 'mañana' : `en ${a.daysUntil} días`
            return (
              <li key={a.key} className="flex items-center gap-3 rounded-md border border-border/70 bg-secondary/40 px-3 py-2.5">
                {isBirthday
                  ? <Gift size={15} strokeWidth={1.75} className="text-brand shrink-0" aria-hidden="true" />
                  : <CalendarClock size={15} strokeWidth={1.75} className="text-muted-foreground/80 shrink-0" aria-hidden="true" />}
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-foreground truncate">{a.title}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {when}{a.recurring ? ' · anual' : ''} · {a.personName.split(' ')[0]}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void agendar(a)}
                  disabled={busyKey === a.key}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-brand/40 bg-brand/10 px-2.5 py-1.5 text-xs font-medium text-brand hover:bg-brand/20 disabled:opacity-50 transition-colors"
                >
                  {busyKey === a.key ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} strokeWidth={2} />}
                  Agendar
                </button>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
