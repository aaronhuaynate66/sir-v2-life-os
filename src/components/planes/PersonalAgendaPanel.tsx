'use client'
// SIR V2 — Agenda personal GLOBAL: todos tus planes, con chip "¿con quién?".
//
// Fase 4 del Estudio del ciclo: acá ves TODOS tus eventos personales y marcas
// cuáles son con qué persona. Al asignar a alguien afectivo con ciclo, el plan
// cae solo en SU línea del ciclo (la ficha lo filtra por person_id). Un evento
// sin persona es agenda general. Reusa /api/personal-events (GET all + POST +
// PATCH person_id + DELETE).

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { CalendarDays, Plus, X, UserPlus, CalendarPlus, CalendarCheck, Loader2 } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRelationshipStore } from '@/stores'
import { parseLocalDate } from '@/lib/dates/parseLocalDate'
import type { PersonalEvent } from '@/lib/personal-events/types'

function fmt(iso: string): string {
  try { return new Date(`${iso}T12:00:00`).toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short' }) } catch { return iso }
}
function isoToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function PersonalAgendaPanel() {
  const people = useRelationshipStore((s) => s.people)
  const peopleSorted = useMemo(
    () => [...people].map((p) => ({ id: p.id, name: p.name })).sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [people],
  )
  const nameById = useMemo(() => new Map(peopleSorted.map((p) => [p.id, p.name])), [peopleSorted])

  const [events, setEvents] = useState<PersonalEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [personId, setPersonId] = useState('')
  const [saving, setSaving] = useState(false)
  const [hasGoogle, setHasGoogle] = useState(false)
  const [pushingId, setPushingId] = useState<string | null>(null)

  function load() {
    setLoading(true)
    fetch('/api/personal-events', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && Array.isArray(d.events)) setEvents(d.events as PersonalEvent[]) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  useEffect(() => {
    let alive = true
    fetch('/api/calendar/connections', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d?.connections) return
        setHasGoogle((d.connections as { provider?: string; enabled?: boolean }[]).some((c) => c.provider === 'google' && c.enabled))
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  async function push(id: string, label: string) {
    setPushingId(id)
    try {
      const res = await fetch(`/api/personal-events/${id}/push-to-google`, { method: 'POST' })
      const j = (await res.json().catch(() => ({}))) as { alreadySynced?: boolean; gcalEventId?: string; error?: string; detail?: string }
      if (!res.ok) { toast.error(j.error ?? 'No se pudo agendar en Google', { description: j.detail }); return }
      setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, gcalEventId: j.gcalEventId ?? 'synced' } : e)))
      toast.success(j.alreadySynced ? 'Ya estaba en Google Calendar' : 'Agendado en Google Calendar', { description: label })
    } catch { toast.error('No se pudo agendar en Google', { description: 'Revisa tu conexión.' }) } finally { setPushingId(null) }
  }

  const today = isoToday()
  const upcoming = events.filter((e) => e.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1))
  const past = events.filter((e) => e.date < today).sort((a, b) => (a.date > b.date ? -1 : 1)).slice(0, 10)

  async function assign(id: string, pid: string) {
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, personId: pid || null } : e)))
    try {
      const res = await fetch(`/api/personal-events/${id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ personId: pid || null }),
      })
      if (!res.ok) throw new Error('patch failed')
      toast.success(pid ? `Marcado con ${nameById.get(pid)?.split(' ')[0] ?? 'esa persona'}` : 'Sin asignar')
    } catch { toast.error('No se pudo asignar'); load() }
  }

  async function add() {
    const t = title.trim()
    if (!t) { toast.error('Ponele un título'); return }
    if (!parseLocalDate(date)) { toast.error('Fecha inválida'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/personal-events', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: t, date, personId: personId || undefined }),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); toast.error('No se pudo guardar', { description: e?.error }); return }
      toast.success('Plan agregado', { description: t })
      setTitle(''); setDate(''); setPersonId(''); setAdding(false)
      load()
    } catch { toast.error('No se pudo guardar') } finally { setSaving(false) }
  }

  async function remove(id: string, label: string) {
    setEvents((prev) => prev.filter((e) => e.id !== id))
    try {
      const res = await fetch(`/api/personal-events/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('del failed')
      toast.success('Plan eliminado', { description: label })
    } catch { toast.error('No se pudo borrar'); load() }
  }

  const PersonSelect = ({ e }: { e: PersonalEvent }) => (
    <select
      value={e.personId ?? ''}
      onChange={(ev) => assign(e.id, ev.target.value)}
      className="rounded-md border border-border bg-background px-2 py-1 text-[12px] text-foreground max-w-[180px] min-h-[28px]"
      aria-label="Asignar a una persona"
    >
      <option value="">— sin asignar —</option>
      {peopleSorted.map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  )

  return (
    <Card className="shadow-none">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <CalendarDays size={15} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
            <span className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Tus planes · marca con quién es cada uno</span>
          </div>
          {!adding && (
            <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
              <Plus size={13} strokeWidth={1.75} className="mr-1" /> Agregar
            </Button>
          )}
        </div>

        {adding && (
          <div className="mb-4 space-y-3 rounded-md border border-border/60 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="pa-title" className="text-xs">Plan</Label>
                <Input id="pa-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej: Cena, viaje, reunión…" className="mt-1" autoFocus />
              </div>
              <div>
                <Label htmlFor="pa-date" className="text-xs">Fecha</Label>
                <Input id="pa-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 font-mono" />
              </div>
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1"><UserPlus size={12} strokeWidth={1.75} /> ¿Con quién? (opcional)</Label>
              <select value={personId} onChange={(e) => setPersonId(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-2 py-2 text-sm">
                <option value="">— sin asignar —</option>
                {peopleSorted.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)} disabled={saving}>Cancelar</Button>
              <Button size="sm" onClick={add} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-1.5" aria-hidden="true">
            {[0, 1, 2].map((i) => <div key={i} className="h-11 rounded-md bg-muted/25 animate-pulse" />)}
          </div>
        ) : upcoming.length === 0 && past.length === 0 ? (
          !adding && <p className="text-sm text-muted-foreground italic">Sin planes todavía. Agrega uno y marca con quién es — si es con tu pareja, cae en su línea del ciclo.</p>
        ) : (
          <div className="space-y-4">
            {upcoming.length > 0 && (
              <Section label="Próximos" events={upcoming} nameById={nameById} PersonSelect={PersonSelect} onRemove={remove} hasGoogle={hasGoogle} pushingId={pushingId} onPush={push} />
            )}
            {past.length > 0 && (
              <Section label="Pasados" events={past} nameById={nameById} PersonSelect={PersonSelect} onRemove={remove} hasGoogle={hasGoogle} pushingId={pushingId} onPush={push} muted />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Section({ label, events, nameById, PersonSelect, onRemove, hasGoogle, pushingId, onPush, muted }: {
  label: string
  events: PersonalEvent[]
  nameById: Map<string, string>
  PersonSelect: (props: { e: PersonalEvent }) => React.ReactElement
  onRemove: (id: string, label: string) => void
  hasGoogle: boolean
  pushingId: string | null
  onPush: (id: string, label: string) => void
  muted?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-[0.07em] text-text-tertiary">{label}</div>
      <ul className={`space-y-1.5 ${muted ? 'opacity-70' : ''}`}>
        {events.map((e) => (
          <li key={e.id} className="flex items-center justify-between gap-3 rounded-md border border-border/40 px-3 py-2 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{e.title}</div>
              <div className="text-[11px] text-muted-foreground font-mono">
                {fmt(e.date)}{e.personId && nameById.get(e.personId) ? ` · con ${nameById.get(e.personId)!.split(' ')[0]}` : ''}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {e.gcalEventId ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-ok/40 bg-ok-soft px-2 py-0.5 text-[10px] font-medium text-ok" title="Este plan ya está en tu Google Calendar">
                  <CalendarCheck size={11} strokeWidth={2} aria-hidden="true" /> En Google
                </span>
              ) : hasGoogle ? (
                <button type="button" onClick={() => onPush(e.id, e.title)} disabled={pushingId === e.id}
                  className="inline-flex items-center gap-1 rounded-full border border-brand/40 bg-brand/5 px-2 py-0.5 text-[10px] font-medium text-brand hover:bg-brand/10 transition-colors disabled:opacity-50"
                  title="Agendar este plan en tu Google Calendar">
                  {pushingId === e.id ? <Loader2 size={11} className="animate-spin" aria-hidden="true" /> : <CalendarPlus size={11} strokeWidth={2} aria-hidden="true" />}
                  Google
                </button>
              ) : null}
              <PersonSelect e={e} />
              <button type="button" onClick={() => onRemove(e.id, e.title)}
                className="flex items-center justify-center h-8 w-8 -m-1 rounded text-muted-foreground/50 hover:text-bad transition-colors" aria-label="Eliminar plan">
                <X size={14} strokeWidth={1.75} />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
