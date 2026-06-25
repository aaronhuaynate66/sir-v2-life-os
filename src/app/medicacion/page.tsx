'use client'
// SIR V2 — /medicacion: registro de tomas de medicación (caso migraña).
// Un toque para registrar (qué + cuántas), con día+hora; historial que se cruza
// en el día-X y alimenta a SIR. Fetch directo a /api/meds (patrón /habitos).

import { useCallback, useEffect, useState } from 'react'
import { Pill, Plus, Loader2, X } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApiErrorNotice } from '@/components/ui/api-error-notice'
import { postJson, toApiError, type ApiError } from '@/lib/api/errors'

interface Intake { id: string; name: string; quantity: number; note: string | null; taken_at: string }
interface RegMed { name: string; dose: string | null }

function fmt(ts: string): string {
  const d = new Date(ts)
  return d.toLocaleString('es', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function MedicacionPage() {
  const [intakes, setIntakes] = useState<Intake[] | null>(null)
  const [names, setNames] = useState<string[]>([])
  const [registry, setRegistry] = useState<RegMed[]>([])
  const [saveMine, setSaveMine] = useState(true)
  const [error, setError] = useState<ApiError | null>(null)
  const [name, setName] = useState('')
  const [qty, setQty] = useState('1')
  const [when, setWhen] = useState('')        // datetime-local opcional (default: ahora)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/meds')
      if (!res.ok) throw new Error('load')
      const j = (await res.json()) as { intakes: Intake[]; names: string[]; registry?: RegMed[] }
      setIntakes(j.intakes); setNames(j.names); setRegistry(j.registry ?? [])
    } catch { setIntakes([]) }
  }, [])
  useEffect(() => { void load() }, [load])

  const log = useCallback(async (medName: string, quantity: number, register = false, takenAt?: string) => {
    const n = medName.trim()
    if (!n || saving) return
    setSaving(true); setError(null)
    try {
      const { intake } = await postJson<{ intake: Intake }>('/api/meds', { name: n, quantity, ...(takenAt ? { taken_at: takenAt } : {}) })
      setIntakes((prev) => [intake, ...(prev ?? [])])
      setNames((prev) => (prev.includes(n) ? prev : [n, ...prev].slice(0, 8)))
      if (register && !registry.some((r) => r.name.toLowerCase() === n.toLowerCase())) {
        setRegistry((prev) => [...prev, { name: n, dose: null }])
        try { await postJson('/api/meds/registry', { name: n }) } catch { /* */ }
      }
      setName(''); setQty('1'); setWhen('')
    } catch (e) { setError(toApiError(e)) } finally { setSaving(false) }
  }, [saving, registry])

  async function removeIntake(id: string) {
    setConfirmId(null)
    setIntakes((prev) => (prev ?? []).filter((i) => i.id !== id))
    try { await fetch(`/api/meds?id=${encodeURIComponent(id)}`, { method: 'DELETE' }) } catch { /* */ }
  }

  const todayISO = new Date().toISOString().slice(0, 10)
  const todayCount = (intakes ?? []).filter((i) => i.taken_at.slice(0, 10) === todayISO).length

  return (
    <AppShell>
      <div className="mb-6">
        <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary mb-1">SIR V2</div>
        <div className="flex items-center gap-3">
          <Pill size={28} strokeWidth={1.5} className="text-muted-foreground" aria-hidden="true" />
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Medicación</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">Registrá cada toma con un toque. Día y hora quedan guardados y se cruzan con el resto de tus datos.</p>
      </div>

      {error && <div className="mb-4"><ApiErrorNotice error={error} /></div>}

      {/* Mis medicamentos (registro) — un toque para marcar la toma */}
      {registry.length > 0 && (
        <div className="mb-2 text-[11px] uppercase tracking-[0.06em] text-text-tertiary">Mis medicamentos</div>
      )}
      {registry.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {registry.map((r) => (
            <button key={r.name} type="button" onClick={() => void log(r.name, 1)} disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-full border border-brand/40 bg-brand-soft/30 px-3 py-2 text-sm text-brand-soft-foreground hover:bg-brand/15 disabled:opacity-50">
              <Pill size={14} /> Tomé {r.name}{r.dose ? <span className="text-[11px] opacity-70">· {r.dose}</span> : null}
            </button>
          ))}
        </div>
      )}
      {/* Otros que registraste antes pero no están en "mis medicamentos" */}
      {names.filter((n) => !registry.some((r) => r.name.toLowerCase() === n.toLowerCase())).length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {names.filter((n) => !registry.some((r) => r.name.toLowerCase() === n.toLowerCase())).map((n) => (
            <button key={n} type="button" onClick={() => void log(n, 1)} disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted disabled:opacity-50">
              <Pill size={14} /> Tomé {n}
            </button>
          ))}
        </div>
      )}

      {/* Alta manual: nombre + cantidad */}
      <Card className="mb-6">
        <CardContent className="p-4 flex flex-col sm:flex-row gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Medicamento (ej: ibuprofeno, sumatriptán)"
            className="flex-1" onKeyDown={(e) => { if (e.key === 'Enter') void log(name, Number(qty) || 1, saveMine, when ? new Date(when).toISOString() : undefined) }} />
          <Input type="number" min={1} max={99} value={qty} onChange={(e) => setQty(e.target.value)} className="w-full sm:w-20" aria-label="Cantidad" />
          <Input type="datetime-local" value={when} max={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)} onChange={(e) => setWhen(e.target.value)} className="w-full sm:w-44" aria-label="Cuándo (opcional)" title="Cuándo la tomaste (opcional; por defecto, ahora)" />
          <Button onClick={() => void log(name, Number(qty) || 1, saveMine, when ? new Date(when).toISOString() : undefined)} disabled={saving || !name.trim()}>
            {saving ? <Loader2 size={15} className="mr-2 animate-spin" /> : <Plus size={15} className="mr-2" />} Registrar
          </Button>
        </CardContent>
        <CardContent className="px-4 pb-3 pt-0">
          <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <input type="checkbox" checked={saveMine} onChange={(e) => setSaveMine(e.target.checked)} className="h-3.5 w-3.5 accent-brand" />
            Guardar en &ldquo;mis medicamentos&rdquo; (para marcarlo con un toque después)
          </label>
        </CardContent>
      </Card>

      {todayCount > 0 && (
        <div className="mb-3 text-xs text-muted-foreground">Hoy registraste <span className="font-medium text-foreground">{todayCount}</span> toma(s).</div>
      )}

      {/* Gráfico: tomas por día (últimos 14) */}
      {intakes && intakes.length > 0 && (() => {
        const DAYS = 14
        const byDay = new Map<string, number>()
        for (const it of intakes) { const d = it.taken_at.slice(0, 10); byDay.set(d, (byDay.get(d) ?? 0) + (it.quantity || 1)) }
        const base = new Date()
        const cols = Array.from({ length: DAYS }, (_, k) => { const dd = new Date(base); dd.setDate(base.getDate() - (DAYS - 1 - k)); return dd.toISOString().slice(0, 10) })
        const counts = cols.map((d) => byDay.get(d) ?? 0)
        const max = Math.max(1, ...counts)
        const total = counts.reduce((a, b) => a + b, 0)
        return (
          <Card className="mb-4 shadow-none">
            <CardContent className="p-4">
              <div className="text-[11px] uppercase tracking-[0.06em] text-text-tertiary mb-3">Tomas · últimos 14 días</div>
              <div className="flex items-end gap-1 h-24">
                {cols.map((d, k) => (
                  <div key={d} className="flex-1 flex flex-col items-center justify-end gap-1" title={`${d}: ${counts[k]} toma(s)`}>
                    <div className="w-full rounded-t bg-brand/70" style={{ height: `${(counts[k] / max) * 100}%`, minHeight: counts[k] > 0 ? 4 : 0 }} />
                    <span className="text-[8px] text-muted-foreground tabular-nums">{d.slice(8, 10)}</span>
                  </div>
                ))}
              </div>
              <div className="text-[11px] text-muted-foreground mt-2">Total {total} en 14 días · pico {max}/día</div>
            </CardContent>
          </Card>
        )
      })()}

      {/* Historial */}
      {intakes === null ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>
      ) : intakes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no registraste ninguna toma.</p>
      ) : (
        <div className="space-y-2">
          {intakes.map((i) => (
            <Card key={i.id} className="shadow-none">
              <CardContent className="p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">{i.name}{i.quantity > 1 ? ` · ${i.quantity}` : ''}</div>
                  <div className="text-[11px] text-muted-foreground capitalize">{fmt(i.taken_at)}{i.note ? ` · ${i.note}` : ''}</div>
                </div>
                {confirmId === i.id ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <button type="button" onClick={() => void removeIntake(i.id)} className="text-[11px] text-bad hover:underline">Borrar</button>
                    <button type="button" onClick={() => setConfirmId(null)} className="text-[11px] text-muted-foreground hover:underline">Cancelar</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setConfirmId(i.id)} aria-label="Borrar toma"
                    className="shrink-0 text-muted-foreground hover:text-bad"><X size={15} /></button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  )
}
