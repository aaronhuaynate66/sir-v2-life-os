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

function fmt(ts: string): string {
  const d = new Date(ts)
  return d.toLocaleString('es', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function MedicacionPage() {
  const [intakes, setIntakes] = useState<Intake[] | null>(null)
  const [names, setNames] = useState<string[]>([])
  const [error, setError] = useState<ApiError | null>(null)
  const [name, setName] = useState('')
  const [qty, setQty] = useState('1')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/meds')
      if (!res.ok) throw new Error('load')
      const j = (await res.json()) as { intakes: Intake[]; names: string[] }
      setIntakes(j.intakes); setNames(j.names)
    } catch { setIntakes([]) }
  }, [])
  useEffect(() => { void load() }, [load])

  const log = useCallback(async (medName: string, quantity: number) => {
    const n = medName.trim()
    if (!n || saving) return
    setSaving(true); setError(null)
    try {
      const { intake } = await postJson<{ intake: Intake }>('/api/meds', { name: n, quantity })
      setIntakes((prev) => [intake, ...(prev ?? [])])
      setNames((prev) => (prev.includes(n) ? prev : [n, ...prev].slice(0, 8)))
      setName(''); setQty('1')
    } catch (e) { setError(toApiError(e)) } finally { setSaving(false) }
  }, [saving])

  async function removeIntake(id: string) {
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

      {/* Botones de un toque para lo que ya registraste antes */}
      {names.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {names.map((n) => (
            <button key={n} type="button" onClick={() => void log(n, 1)} disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-full border border-brand/40 bg-brand-soft/30 px-3 py-1.5 text-sm text-brand-soft-foreground hover:bg-brand/15 disabled:opacity-50">
              <Pill size={14} /> Tomé {n}
            </button>
          ))}
        </div>
      )}

      {/* Alta manual: nombre + cantidad */}
      <Card className="mb-6">
        <CardContent className="p-4 flex flex-col sm:flex-row gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Medicamento (ej: ibuprofeno, sumatriptán)"
            className="flex-1" onKeyDown={(e) => { if (e.key === 'Enter') void log(name, Number(qty) || 1) }} />
          <Input type="number" min={1} max={99} value={qty} onChange={(e) => setQty(e.target.value)} className="w-full sm:w-20" aria-label="Cantidad" />
          <Button onClick={() => void log(name, Number(qty) || 1)} disabled={saving || !name.trim()}>
            {saving ? <Loader2 size={15} className="mr-2 animate-spin" /> : <Plus size={15} className="mr-2" />} Registrar
          </Button>
        </CardContent>
      </Card>

      {todayCount > 0 && (
        <div className="mb-3 text-xs text-muted-foreground">Hoy registraste <span className="font-medium text-foreground">{todayCount}</span> toma(s).</div>
      )}

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
                <button type="button" onClick={() => void removeIntake(i.id)} aria-label="Borrar toma"
                  className="shrink-0 text-muted-foreground hover:text-bad"><X size={15} /></button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  )
}
