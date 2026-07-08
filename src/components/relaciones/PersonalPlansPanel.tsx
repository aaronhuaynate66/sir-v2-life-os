'use client'
// SIR V2 — PersonalPlansPanel: la agenda personal de Aaron CON esta persona.
//
// Planes propios (una cena, un viaje, un plan juntos) que SIR escribe/edita —
// la AGENDA PERSONAL nativa (personal_events, mig 0133), separada del calendario
// laboral. Cada plan ligado a la persona cae en SU línea del Horizonte del ciclo.
// Al agregar/borrar, avisa al padre (onChange) para refrescar el horizonte.
//
// Escribe vía /api/personal-events (no el store de personas): es tabla propia.

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CalendarPlus, Plus, X } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { parseLocalDate } from '@/lib/dates/parseLocalDate'
import type { PersonalEvent } from '@/lib/personal-events/types'

export interface PersonalPlansPanelProps {
  personId: string
  personName: string
  /** Se llama tras agregar/borrar un plan (para refrescar el Horizonte). */
  onChange?: () => void
}

function fmt(dateIso: string): string {
  try { return new Date(`${dateIso}T12:00:00`).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' }) } catch { return dateIso }
}

export function PersonalPlansPanel({ personId, personName, onChange }: PersonalPlansPanelProps) {
  const [events, setEvents] = useState<PersonalEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    let alive = true
    setLoading(true)
    fetch(`/api/personal-events?personId=${encodeURIComponent(personId)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (alive && data && Array.isArray(data.events)) setEvents(data.events as PersonalEvent[]) })
      .catch(() => { /* tolerante: tabla ausente o feed caído → lista vacía */ })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [personId])

  useEffect(() => load(), [load])

  const firstName = personName.split(' ')[0] || personName

  function resetForm() {
    setTitle(''); setDate(''); setNote(''); setAdding(false)
  }

  async function handleAdd() {
    const t = title.trim()
    if (!t) { toast.error('Falta el plan', { description: 'Ponele un título.' }); return }
    if (!parseLocalDate(date)) { toast.error('Fecha inválida', { description: 'Elegí una fecha válida.' }); return }
    setSaving(true)
    try {
      const res = await fetch('/api/personal-events', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: t, date, note: note.trim() || undefined, personId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error('No se pudo guardar', { description: err?.error ?? 'Reintentá en un momento.' })
        return
      }
      toast.success('Plan agregado', { description: t })
      resetForm()
      load()
      onChange?.()
    } catch {
      toast.error('No se pudo guardar', { description: 'Revisá tu conexión.' })
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove(id: string, label: string) {
    // Optimista: lo saco de la lista y aviso; si falla, recargo.
    setEvents((prev) => prev.filter((e) => e.id !== id))
    try {
      const res = await fetch(`/api/personal-events/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('delete failed')
      toast.success('Plan eliminado', { description: label })
      onChange?.()
    } catch {
      toast.error('No se pudo borrar', { description: 'Recargo la lista.' })
      load()
    }
  }

  const upcoming = events
    .filter((e) => e.personId === personId)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <CalendarPlus size={14} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
            <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">
              Planes con {firstName}
            </div>
          </div>
          {!adding && (
            <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
              <Plus size={13} strokeWidth={1.75} className="mr-1" />
              Agregar
            </Button>
          )}
        </div>

        {adding && (
          <div className="mb-4 space-y-3 rounded-md border border-border/60 p-3">
            <div>
              <Label htmlFor="pp-title" className="text-xs">Plan</Label>
              <Input id="pp-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej: Cena, viaje a Cusco, cine…" className="mt-1" autoFocus />
            </div>
            <div>
              <Label htmlFor="pp-date" className="text-xs">Fecha</Label>
              <Input id="pp-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 font-mono" />
            </div>
            <div>
              <Label htmlFor="pp-note" className="text-xs">Nota (opcional)</Label>
              <Input id="pp-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Un detalle…" className="mt-1" />
            </div>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={resetForm} disabled={saving}>Cancelar</Button>
              <Button size="sm" onClick={handleAdd} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-1.5" aria-hidden="true">
            <div className="h-9 rounded-md bg-muted/30 animate-pulse" />
            <div className="h-9 rounded-md bg-muted/20 animate-pulse" />
          </div>
        ) : upcoming.length === 0 ? (
          !adding && (
            <p className="text-sm text-muted-foreground italic leading-relaxed">
              Sin planes con {firstName} todavía. Agregá una cena, un viaje o cualquier plan — cae en su línea del ciclo con el mejor timing. También podés pedírmelo por chat.
            </p>
          )
        ) : (
          <ul className="space-y-1.5">
            {upcoming.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 rounded-md border border-border/40 px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{e.title}</div>
                  <div className="text-[11px] text-muted-foreground font-mono">
                    {fmt(e.date)}{e.note ? ` · ${e.note}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(e.id, e.title)}
                  className="flex-shrink-0 flex items-center justify-center h-8 w-8 -m-1.5 rounded text-muted-foreground/50 hover:text-bad transition-colors"
                  aria-label="Eliminar plan"
                >
                  <X size={14} strokeWidth={1.75} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
