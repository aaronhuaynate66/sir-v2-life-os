'use client'
// SIR V2 — Costos del objetivo (VISIBLE, no oculto): lo que cuesta LLEGAR como
// inversión/trofeo. Relacional (vínculos en juego, del episodio) + material/
// esfuerzo que Aaron agrega (pasaje, entrenamientos, inscripción) con monto y
// total. Al lograrlo: "esto fue lo que me costó".
import { useCallback, useEffect, useState } from 'react'
import { Receipt, Plus, X, Loader2, Users } from 'lucide-react'

interface Cost { id: string; label: string; amount: number | null; currency: string; kind: string }
const SYMBOL: Record<string, string> = { PEN: 'S/', USD: 'US$', EUR: '€' }
function fmt(amount: number, cur: string): string { return `${SYMBOL[cur] ?? cur} ${amount.toLocaleString('es')}` }

export function GoalCosts({ goalId, relationalNames }: { goalId: string; relationalNames: string[] }) {
  const [costs, setCosts] = useState<Cost[]>([])
  const [adding, setAdding] = useState(false)
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [cur, setCur] = useState('PEN')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/objectives/costs?goal_id=${encodeURIComponent(goalId)}`)
      if (!r.ok) return
      const j = (await r.json()) as { costs: Cost[] }
      setCosts(j.costs ?? [])
    } catch { /* */ }
  }, [goalId])
  useEffect(() => { void load() }, [load])

  async function agregar() {
    if (!label.trim() || saving) return
    setSaving(true)
    try {
      const body: Record<string, unknown> = { goal_id: goalId, label: label.trim(), currency: cur }
      const n = parseFloat(amount.replace(',', '.')); if (isFinite(n) && n >= 0) body.amount = n
      const r = await fetch('/api/objectives/costs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (r.ok) { const j = (await r.json()) as { cost: Cost }; setCosts((p) => [...p, j.cost]); setLabel(''); setAmount(''); setAdding(false) }
    } catch { /* */ } finally { setSaving(false) }
  }
  async function borrar(id: string) {
    setCosts((p) => p.filter((c) => c.id !== id))
    try { await fetch(`/api/objectives/costs?id=${encodeURIComponent(id)}`, { method: 'DELETE' }) } catch { /* */ }
  }

  const totals = new Map<string, number>()
  for (const c of costs) if (typeof c.amount === 'number') totals.set(c.currency, (totals.get(c.currency) ?? 0) + c.amount)
  const totalLabel = Array.from(totals.entries()).map(([cu, v]) => fmt(v, cu)).join(' + ')

  return (
    <div className="mb-2 rounded-lg border border-border p-2.5 space-y-1.5">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.06em] text-text-tertiary">
        <Receipt size={12} /> Costos — lo que cuesta llegar
      </div>
      {relationalNames.length > 0 && (
        <div className="flex items-start gap-1.5 text-[11px] text-foreground/90">
          <Users size={12} className="mt-0.5 shrink-0 text-warn" />
          <span><span className="font-medium">Relacional:</span> en juego con {relationalNames.slice(0, 5).join(', ')}{relationalNames.length > 5 ? ` +${relationalNames.length - 5}` : ''}.</span>
        </div>
      )}
      {costs.map((c) => (
        <div key={c.id} className="flex items-center justify-between gap-2 text-[12px]">
          <span className="text-foreground">{c.label}</span>
          <span className="flex items-center gap-2 shrink-0">
            {typeof c.amount === 'number' && <span className="text-muted-foreground tabular-nums">{fmt(c.amount, c.currency)}</span>}
            <button type="button" aria-label="Quitar" onClick={() => void borrar(c.id)} className="text-muted-foreground hover:text-bad"><X size={12} /></button>
          </span>
        </div>
      ))}
      {costs.length === 0 && relationalNames.length === 0 && <p className="text-[11px] text-muted-foreground">Todavía sin costos. Sumá pasaje, entrenamientos, inscripción…</p>}
      {totalLabel && <div className="text-[12px] font-medium text-foreground border-t border-border pt-1.5">Total invertido: {totalLabel}</div>}

      {adding ? (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Pasaje, entrenamiento, inscripción…" className="flex-1 min-w-[140px] rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="monto" className="w-20 rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
          <select value={cur} onChange={(e) => setCur(e.target.value)} className="rounded border border-border bg-background px-1 py-1 text-xs">
            <option value="PEN">S/</option><option value="USD">US$</option><option value="EUR">€</option>
          </select>
          <button type="button" onClick={() => void agregar()} disabled={saving || !label.trim()} className="inline-flex items-center gap-1 rounded bg-brand px-2 py-1 text-xs text-brand-foreground disabled:opacity-50">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Guardar
          </button>
          <button type="button" onClick={() => setAdding(false)} className="text-[11px] text-muted-foreground hover:text-foreground">cancelar</button>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline pt-0.5">
          <Plus size={11} /> Agregar costo
        </button>
      )}
    </div>
  )
}
