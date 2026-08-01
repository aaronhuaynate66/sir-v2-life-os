'use client'
// SIR V2 — "Recordar antes de contactar" (diferenciador #3 · mig 0148).
//
// Repetición espaciada RELACIONAL: cosas que quieres que SIR te recuerde ANTES de
// tu próximo contacto con esta persona (no por fecha — por evento). Dos sabores:
//   - puntual ("once"): un compromiso que marcas hecho cuando lo usas.
//   - permanente ("standing"): contexto que quieres ver SIEMPRE antes de escribirle
//     (ej. "pregúntale por su mamá").
// Client-side + fail-soft: si la tabla 0148 aún no propagó, la lista queda vacía
// y puedes seguir usando la ficha; el POST fallará suave hasta que exista.

import { useCallback, useEffect, useState } from 'react'
import { BellRing, Repeat, Plus, Check, Trash2, Loader2 } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ContactReminder } from '@/lib/contact-reminders/types'

const BASE = '/api/relaciones/contact-reminders'

export function ContactReminders({ personId, personName }: { personId: string; personName?: string }) {
  const [reminders, setReminders] = useState<ContactReminder[]>([])
  const [loaded, setLoaded] = useState(false)
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const [standing, setStanding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const r = await fetch(`${BASE}?person_id=${encodeURIComponent(personId)}`)
        const j = (await r.json()) as { reminders?: ContactReminder[] }
        if (alive) setReminders(Array.isArray(j.reminders) ? j.reminders : [])
      } catch {
        if (alive) setReminders([])
      } finally {
        if (alive) setLoaded(true)
      }
    })()
    return () => { alive = false }
  }, [personId])

  const add = useCallback(async () => {
    const t = text.trim()
    if (!t || busy) return
    setBusy(true)
    try {
      const r = await fetch(BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_id: personId, text: t, kind: standing ? 'standing' : 'once' }),
      })
      if (r.ok) {
        const j = (await r.json()) as { reminder?: ContactReminder }
        if (j.reminder) setReminders((prev) => [...prev, j.reminder as ContactReminder])
        setText('')
        setStanding(false)
        setAdding(false)
      }
    } catch { /* fail-soft */ } finally { setBusy(false) }
  }, [text, standing, personId, busy])

  const markDone = useCallback(async (id: string) => {
    setBusyId(id)
    try {
      const r = await fetch(BASE, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'done' }),
      })
      if (r.ok) setReminders((prev) => prev.filter((x) => x.id !== id))
    } catch { /* fail-soft */ } finally { setBusyId(null) }
  }, [])

  const remove = useCallback(async (id: string) => {
    setBusyId(id)
    try {
      const r = await fetch(`${BASE}?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (r.ok) setReminders((prev) => prev.filter((x) => x.id !== id))
    } catch { /* fail-soft */ } finally { setBusyId(null) }
  }, [])

  // Antes de la primera carga no mostramos nada (evita parpadeo/shell vacío).
  if (!loaded) return null

  const first = personName?.split(/\s+/)[0]

  return (
    <Card className="shadow-none mb-4 border-brand/15">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <BellRing size={13} strokeWidth={1.75} className="text-brand/70 shrink-0" aria-hidden="true" />
            <span className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">
              Recordar antes de contactar
            </span>
          </div>
          {!adding && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAdding(true)}>
              <Plus size={13} strokeWidth={1.75} className="mr-1" /> Recordar algo
            </Button>
          )}
        </div>

        {reminders.length > 0 && (
          <ul className="space-y-1.5 mb-2">
            {reminders.map((r) => (
              <li key={r.id} className="flex items-start gap-2 rounded-md border border-border/60 bg-muted/10 px-3 py-2">
                {r.kind === 'standing' ? (
                  <Repeat size={13} strokeWidth={1.75} className="mt-0.5 shrink-0 text-brand/70" aria-label="permanente" />
                ) : (
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1 text-sm text-foreground leading-snug">{r.text}</span>
                <span className="flex items-center gap-0.5 shrink-0">
                  {r.kind === 'once' && (
                    <button
                      type="button"
                      onClick={() => void markDone(r.id)}
                      disabled={busyId === r.id}
                      title="Marcar como hecho"
                      className="rounded p-1 text-muted-foreground/70 hover:text-ok hover:bg-ok-soft transition-colors"
                    >
                      {busyId === r.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} strokeWidth={2} />}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void remove(r.id)}
                    disabled={busyId === r.id}
                    title="Quitar"
                    className="rounded p-1 text-muted-foreground/70 hover:text-bad hover:bg-bad-soft transition-colors"
                  >
                    <Trash2 size={13} strokeWidth={1.75} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        {adding ? (
          <div className="space-y-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              autoFocus
              placeholder={first ? `Ej. "preguntarle a ${first} por su viaje"` : 'Ej. "preguntarle por su viaje"'}
              className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30"
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void add() }}
            />
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setStanding((s) => !s)}
                aria-pressed={standing}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors',
                  standing ? 'border-brand/50 bg-brand/10 text-foreground' : 'border-border text-muted-foreground hover:border-accent/40',
                )}
              >
                <Repeat size={12} strokeWidth={1.75} />
                {standing ? 'Recordar siempre' : 'Recordar una vez'}
              </button>
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setAdding(false); setText(''); setStanding(false) }}>
                  Cancelar
                </Button>
                <Button size="sm" className="h-7 text-xs" onClick={() => void add()} disabled={busy || !text.trim()}>
                  {busy ? <Loader2 size={12} className="mr-1 animate-spin" /> : <Plus size={12} className="mr-1" />}
                  Agregar
                </Button>
              </div>
            </div>
          </div>
        ) : reminders.length === 0 ? (
          <p className="text-xs text-muted-foreground leading-relaxed">
            Anota algo que quieras que SIR te recuerde justo antes de escribirle
            {first ? ` a ${first}` : ''} — un compromiso puntual o algo permanente por lo que preguntar.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
