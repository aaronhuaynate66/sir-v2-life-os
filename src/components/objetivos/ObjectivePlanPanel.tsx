'use client'
// SIR V2 — Plan de acción del objetivo. Countdown al evento + ventana de viaje +
// checklist de bloqueos (lo que TIENE que pasar para llegar). Genérico: sirve
// para cualquier objetivo. El presupuesto vive en GoalCosts; los precios en los
// trackers enganchados.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarClock, Plus, Check, X, MapPin, Loader2, Pencil } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SectionTitle } from '@/components/ui/section-title'
import { countdownLabel, blockersProgress, type ObjectivePlan, type ObjectiveBlocker } from '@/lib/objectives/plan'

function fmt(iso: string | null): string {
  if (!iso) return '—'
  try { return new Date(`${iso}T12:00:00Z`).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) } catch { return iso }
}

export function ObjectivePlanPanel({ goalId }: { goalId: string }) {
  const [plan, setPlan] = useState<ObjectivePlan | null>(null)
  const [blockers, setBlockers] = useState<ObjectiveBlocker[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ event_date: '', travel_start: '', travel_end: '', location: '', obstacle: '', plan_if: '', plan_then: '' })
  const [newBlk, setNewBlk] = useState('')
  const [newDue, setNewDue] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/objectives/plan?goal_id=${encodeURIComponent(goalId)}`)
      if (r.ok) {
        const j = (await r.json()) as { plan: ObjectivePlan | null; blockers: ObjectiveBlocker[] }
        setPlan(j.plan); setBlockers(j.blockers ?? [])
        if (j.plan) setForm({ event_date: j.plan.eventDate ?? '', travel_start: j.plan.travelStart ?? '', travel_end: j.plan.travelEnd ?? '', location: j.plan.location ?? '', obstacle: j.plan.obstacle ?? '', plan_if: j.plan.planIf ?? '', plan_then: j.plan.planThen ?? '' })
      }
    } catch { /* */ } finally { setLoaded(true) }
  }, [goalId])
  useEffect(() => { void load() }, [load])

  const savePlan = useCallback(async () => {
    if (busy) return; setBusy(true)
    try {
      await fetch('/api/objectives/plan', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal_id: goalId, event_date: form.event_date || null, travel_start: form.travel_start || null, travel_end: form.travel_end || null, location: form.location || null, obstacle: form.obstacle || null, plan_if: form.plan_if || null, plan_then: form.plan_then || null }) })
      setEditing(false); await load()
    } finally { setBusy(false) }
  }, [busy, form, goalId, load])

  const addBlocker = useCallback(async () => {
    if (!newBlk.trim() || busy) return; setBusy(true)
    try {
      await fetch('/api/objectives/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ goal_id: goalId, title: newBlk.trim(), due_on: newDue || undefined }) })
      setNewBlk(''); setNewDue(''); await load()
    } finally { setBusy(false) }
  }, [newBlk, newDue, busy, goalId, load])

  const toggleBlocker = useCallback(async (b: ObjectiveBlocker) => {
    setBlockers((prev) => prev.map((x) => x.id === b.id ? { ...x, done: !x.done } : x))
    try { await fetch('/api/objectives/plan', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: b.id, done: !b.done }) }) } catch { void load() }
  }, [load])

  const delBlocker = useCallback(async (id: string) => {
    setBlockers((prev) => prev.filter((x) => x.id !== id))
    try { await fetch(`/api/objectives/plan?id=${encodeURIComponent(id)}`, { method: 'DELETE' }) } catch { void load() }
  }, [load])

  const cd = useMemo(() => countdownLabel(plan?.eventDate), [plan])
  const prog = useMemo(() => blockersProgress(blockers), [blockers])

  if (!loaded) return null
  const empty = !plan?.eventDate && blockers.length === 0 && !editing

  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <SectionTitle icon={CalendarClock} label="Plan de acción" />
          <button type="button" onClick={() => setEditing((v) => !v)} className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"><Pencil size={12} /> {plan?.eventDate ? 'editar' : 'fechas'}</button>
        </div>

        {empty && <p className="mt-2 text-[13px] text-muted-foreground">Poné la fecha del evento y los bloqueos (visa, inscripción, vuelo…) para volver esto un plan vivo, con cuenta regresiva.</p>}

        {/* Countdown + ventana */}
        {plan?.eventDate && !editing && (
          <div className="mt-2">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold tracking-tight" style={{ color: '#2dd4a7' }}>{cd}</span>
              <span className="text-[12px] text-muted-foreground">para el evento · {fmt(plan.eventDate)}</span>
            </div>
            {(plan.travelStart || plan.travelEnd) && (
              <div className="mt-1 text-[13px] text-foreground/80">✈ Viaje: {fmt(plan.travelStart)} → {fmt(plan.travelEnd)}{plan.location ? ` · ${plan.location}` : ''}</div>
            )}
          </div>
        )}

        {!editing && (plan?.obstacle || plan?.planIf || plan?.planThen) && (
          <div className="mt-3 rounded-lg border p-3" style={{ borderColor: '#e0a93b55', background: '#e0a93b14' }}>
            <p className="text-[11px] uppercase tracking-wide" style={{ color: '#e0a93b' }}>Obstáculo → plan</p>
            {plan?.obstacle && <p className="mt-1 text-[13px] text-foreground/90"><span className="text-muted-foreground">Obstáculo:</span> {plan.obstacle}</p>}
            {(plan?.planIf || plan?.planThen) && (
              <p className="mt-1 text-[13px] text-foreground/90"><span className="text-muted-foreground">Si</span> {plan?.planIf || '…'} <span className="text-muted-foreground">→ entonces</span> {plan?.planThen || '…'}</p>
            )}
          </div>
        )}

        {/* Editor de fechas */}
        {editing && (
          <div className="mt-3 space-y-2 rounded-lg border border-border bg-muted/30 p-3">
            <label className="block text-[12px] text-muted-foreground">Fecha del evento
              <Input type="date" value={form.event_date} onChange={(e) => setForm((f) => ({ ...f, event_date: e.target.value }))} className="mt-1" /></label>
            <div className="flex gap-2">
              <label className="flex-1 block text-[12px] text-muted-foreground">Viaje desde
                <Input type="date" value={form.travel_start} onChange={(e) => setForm((f) => ({ ...f, travel_start: e.target.value }))} className="mt-1" /></label>
              <label className="flex-1 block text-[12px] text-muted-foreground">hasta
                <Input type="date" value={form.travel_end} onChange={(e) => setForm((f) => ({ ...f, travel_end: e.target.value }))} className="mt-1" /></label>
            </div>
            <label className="block text-[12px] text-muted-foreground">Lugar
              <Input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="Al Khobar, Arabia Saudí" className="mt-1" /></label>
            <div className="pt-2 border-t border-border/50">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Obstáculo → plan (si-entonces)</p>
              <textarea
                value={form.obstacle}
                onChange={(e) => setForm((f) => ({ ...f, obstacle: e.target.value }))}
                rows={2}
                placeholder="¿Qué se interpone? (el obstáculo principal)"
                className="w-full resize-none rounded-md border border-border bg-background p-2 text-[13px] outline-none focus:border-foreground/30"
              />
              <div className="mt-1 flex flex-col gap-1.5 sm:flex-row">
                <Input value={form.plan_if} onChange={(e) => setForm((f) => ({ ...f, plan_if: e.target.value }))} placeholder="Si pasa… (disparador)" className="text-[13px]" />
                <Input value={form.plan_then} onChange={(e) => setForm((f) => ({ ...f, plan_then: e.target.value }))} placeholder="entonces hago…" className="text-[13px]" />
              </div>
            </div>
            <Button size="sm" disabled={busy} onClick={savePlan}>{busy ? <Loader2 size={14} className="mr-1 animate-spin" /> : null} Guardar</Button>
          </div>
        )}

        {/* Bloqueos / checklist */}
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Bloqueos para llegar</p>
            {prog !== null && <span className="text-[11px] text-muted-foreground">{prog}% listo</span>}
          </div>
          <ul className="mt-2 space-y-1.5">
            {blockers.map((b) => (
              <li key={b.id} className="flex items-center gap-2 text-[13px]">
                <button type="button" onClick={() => toggleBlocker(b)} className="shrink-0">
                  <span className="flex h-4 w-4 items-center justify-center rounded border" style={{ borderColor: b.done ? '#2dd4a7' : '#5f5e5a', background: b.done ? '#2dd4a7' : 'transparent' }}>
                    {b.done && <Check size={11} color="#06140f" />}
                  </span>
                </button>
                <span className={b.done ? 'line-through text-muted-foreground' : 'text-foreground/90'}>{b.title}</span>
                {b.dueOn && <span className="text-[11px] text-muted-foreground">· {fmt(b.dueOn)}</span>}
                <button type="button" onClick={() => delBlocker(b.id)} className="ml-auto text-muted-foreground hover:text-foreground"><X size={13} /></button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <Input value={newBlk} onChange={(e) => setNewBlk(e.target.value)} placeholder="Agregar bloqueo (ej. sacar visa)" className="text-[13px]" />
            <div className="flex gap-2">
              <Input type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)} className="text-[13px] w-40" />
              <Button size="sm" variant="secondary" disabled={busy || !newBlk.trim()} onClick={addBlocker}><Plus size={14} /></Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
