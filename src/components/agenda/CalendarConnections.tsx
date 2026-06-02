// SIR V2 — CalendarConnections: gestión de calendarios conectados (Calendar v2 Fase 1).
//
// Agregar / editar / eliminar / togglear calendarios pegando una URL .ics, con
// label y color. Soporta MÚLTIPLES. Consume /api/calendar/connections (server,
// RLS por user_id). El token de la URL nunca se loguea; se muestra solo el host
// en la lista (no la URL completa) para no exponerlo de reojo.
'use client'

import { useEffect, useState, useCallback } from 'react'
import { Link2, Plus, Trash2, Pencil, Check, X, AlertCircle, Loader2 } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { SectionTitle } from '@/components/ui/section-title'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  CALENDAR_COLORS,
  DEFAULT_CALENDAR_COLOR,
  type CalendarConnectionDto,
} from '@/lib/calendar/types'

const cardClass = 'shadow-none mb-6'

/** Muestra solo el host de una URL (sin el token del query string). */
function hostOf(url: string | null): string {
  if (!url) return '—'
  try {
    return new URL(url).host
  } catch {
    return 'enlace .ics'
  }
}

type Status = { kind: 'idle' } | { kind: 'loading' } | { kind: 'error'; message: string }

interface FormState {
  label: string
  icsUrl: string
  color: string
}

const EMPTY_FORM: FormState = { label: '', icsUrl: '', color: DEFAULT_CALENDAR_COLOR }

export function CalendarConnections({ onChange }: { onChange?: () => void }) {
  const [connections, setConnections] = useState<CalendarConnectionDto[]>([])
  const [status, setStatus] = useState<Status>({ kind: 'loading' })
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setStatus({ kind: 'loading' })
    try {
      const res = await fetch('/api/calendar/connections', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as { connections: CalendarConnectionDto[] }
      setConnections(data.connections ?? [])
      setStatus({ kind: 'idle' })
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : 'error' })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const notifyChange = useCallback(() => {
    void load()
    onChange?.()
  }, [load, onChange])

  return (
    <Card className={cardClass}>
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <SectionTitle icon={Link2} label="Calendarios conectados" />
          {!adding && (
            <Button variant="outline" size="sm" onClick={() => { setAdding(true); setEditingId(null) }}>
              <Plus size={14} strokeWidth={2} aria-hidden="true" />
              Conectar
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          Pegá la URL <span className="font-mono text-foreground/80">.ics</span> de tu calendario
          (Outlook, Google, iCloud…). Podés conectar varios — se muestran unificados y con su color.
          Tu token queda solo en el servidor.
        </p>

        {/* Form de alta */}
        {adding && (
          <ConnectionForm
            initial={EMPTY_FORM}
            submitLabel="Conectar calendario"
            onCancel={() => setAdding(false)}
            onSubmit={async (form) => {
              const res = await fetch('/api/calendar/connections', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
              })
              if (!res.ok) {
                const err = (await res.json().catch(() => ({}))) as { error?: string }
                return err.error ?? 'No se pudo conectar el calendario.'
              }
              setAdding(false)
              notifyChange()
              return null
            }}
          />
        )}

        {/* Lista */}
        <div className="mt-4">
          {status.kind === 'loading' && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
              <Loader2 size={14} className="animate-spin" aria-hidden="true" /> Cargando…
            </div>
          )}
          {status.kind === 'error' && (
            <div className="flex items-center gap-2 text-sm text-warn py-3">
              <AlertCircle size={14} aria-hidden="true" /> No pude cargar tus calendarios ({status.message}).
            </div>
          )}
          {status.kind === 'idle' && connections.length === 0 && !adding && (
            <p className="text-sm text-muted-foreground py-3">
              Todavía no conectaste ningún calendario.
            </p>
          )}

          <ul className="space-y-2">
            {connections.map((c) =>
              editingId === c.id ? (
                <li key={c.id}>
                  <ConnectionForm
                    initial={{ label: c.label, icsUrl: c.icsUrl ?? '', color: c.color ?? DEFAULT_CALENDAR_COLOR }}
                    submitLabel="Guardar cambios"
                    onCancel={() => setEditingId(null)}
                    onSubmit={async (form) => {
                      const res = await fetch(`/api/calendar/connections/${c.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(form),
                      })
                      if (!res.ok) {
                        const err = (await res.json().catch(() => ({}))) as { error?: string }
                        return err.error ?? 'No se pudo guardar.'
                      }
                      setEditingId(null)
                      notifyChange()
                      return null
                    }}
                  />
                </li>
              ) : (
                <ConnectionRow
                  key={c.id}
                  conn={c}
                  onEdit={() => { setEditingId(c.id); setAdding(false) }}
                  onToggle={async () => {
                    await fetch(`/api/calendar/connections/${c.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ enabled: !c.enabled }),
                    })
                    notifyChange()
                  }}
                  onDelete={async () => {
                    await fetch(`/api/calendar/connections/${c.id}`, { method: 'DELETE' })
                    notifyChange()
                  }}
                />
              ),
            )}
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}

function ConnectionRow({
  conn,
  onEdit,
  onToggle,
  onDelete,
}: {
  conn: CalendarConnectionDto
  onEdit: () => void
  onToggle: () => void | Promise<void>
  onDelete: () => void | Promise<void>
}) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  const run = async (fn: () => void | Promise<void>) => {
    setBusy(true)
    try { await fn() } finally { setBusy(false) }
  }

  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-md border border-border/70 bg-secondary/40 px-3 py-2.5',
        !conn.enabled && 'opacity-55',
      )}
    >
      <span
        className="w-3 h-3 rounded-full flex-shrink-0 ring-1 ring-black/20"
        style={{ backgroundColor: conn.color ?? DEFAULT_CALENDAR_COLOR }}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm text-foreground truncate">{conn.label}</div>
        <div className="text-[11px] text-muted-foreground truncate font-mono">{hostOf(conn.icsUrl)}</div>
      </div>

      {/* Toggle enabled */}
      <button
        type="button"
        onClick={() => run(onToggle)}
        disabled={busy}
        className={cn(
          'relative h-5 w-9 rounded-full transition-colors flex-shrink-0 disabled:opacity-50',
          conn.enabled ? 'bg-brand' : 'bg-muted',
        )}
        role="switch"
        aria-checked={conn.enabled}
        aria-label={conn.enabled ? 'Desactivar calendario' : 'Activar calendario'}
        title={conn.enabled ? 'Activado' : 'Desactivado'}
      >
        <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all', conn.enabled ? 'left-[18px]' : 'left-0.5')} />
      </button>

      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit} aria-label="Editar calendario" disabled={busy}>
        <Pencil size={14} strokeWidth={1.75} aria-hidden="true" />
      </Button>

      {confirming ? (
        <div className="flex items-center gap-1">
          <Button variant="destructive" size="icon" className="h-8 w-8" onClick={() => run(onDelete)} aria-label="Confirmar eliminación" disabled={busy}>
            <Check size={14} strokeWidth={2} aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setConfirming(false)} aria-label="Cancelar" disabled={busy}>
            <X size={14} strokeWidth={2} aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-bad" onClick={() => setConfirming(true)} aria-label="Eliminar calendario" disabled={busy}>
          <Trash2 size={14} strokeWidth={1.75} aria-hidden="true" />
        </Button>
      )}
    </li>
  )
}

function ConnectionForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: FormState
  submitLabel: string
  /** Devuelve un mensaje de error o null si OK. */
  onSubmit: (form: FormState) => Promise<string | null>
  onCancel: () => void
}) {
  const [form, setForm] = useState<FormState>(initial)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!form.icsUrl.trim()) {
      setError('Pegá la URL .ics de tu calendario.')
      return
    }
    setSubmitting(true)
    setError(null)
    const msg = await onSubmit(form)
    setSubmitting(false)
    if (msg) setError(msg)
  }

  return (
    <div className="mt-3 rounded-md border border-dashed border-border bg-secondary/30 p-3 sm:p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
        <div className="space-y-1">
          <Label htmlFor="cal-label" className="text-xs text-muted-foreground">Nombre</Label>
          <Input
            id="cal-label"
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            placeholder="Trabajo, Personal…"
            maxLength={60}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Color</Label>
          <div className="flex items-center gap-1.5 h-10">
            {CALENDAR_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setForm((f) => ({ ...f, color: c }))}
                className={cn(
                  'w-6 h-6 rounded-full transition-transform ring-offset-2 ring-offset-background',
                  form.color === c ? 'ring-2 ring-foreground scale-110' : 'ring-1 ring-black/20 hover:scale-105',
                )}
                style={{ backgroundColor: c }}
                aria-label={`Color ${c}`}
                aria-pressed={form.color === c}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="cal-url" className="text-xs text-muted-foreground">URL .ics</Label>
        <Input
          id="cal-url"
          value={form.icsUrl}
          onChange={(e) => setForm((f) => ({ ...f, icsUrl: e.target.value }))}
          placeholder="https://outlook.office365.com/owa/calendar/.../reachcalendar.ics"
          spellCheck={false}
          autoComplete="off"
          type="url"
          className="font-mono text-xs"
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-warn">
          <AlertCircle size={13} aria-hidden="true" /> {error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button variant="brand" size="sm" onClick={submit} disabled={submitting}>
          {submitting ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Check size={14} strokeWidth={2} aria-hidden="true" />}
          {submitLabel}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>Cancelar</Button>
      </div>
    </div>
  )
}
