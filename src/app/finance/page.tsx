'use client'
// SIR V2 — /finance
import { useMemo, useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useFinanceStore } from '@/stores/useFinanceStore'
import { useMemoryStore } from '@/stores'
import { analyzeFinancialStability, detectFinancialAlerts } from '@/engines/financial'
import { createFinancialMovementMemory } from '@/engines/memory'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { RouteSkeleton } from '@/components/skeletons/RouteSkeleton'
import { cn } from '@/lib/utils'
import type { MovementType, FinancialCategory, FinancialMovement } from '@/types'

const TYPE_LABEL: Record<MovementType, string> = {
  income: 'Ingreso', expense: 'Gasto', investment: 'Inversion', transfer: 'Transferencia', debt: 'Deuda',
}
const TYPE_COLOR: Record<MovementType, string> = {
  income: 'text-emerald-400', expense: 'text-red-400', investment: 'text-blue-400',
  transfer: 'text-amber-400', debt: 'text-red-400',
}
const TYPE_SIGN: Record<MovementType, string> = {
  income: '+', expense: '-', investment: '-', transfer: '', debt: '-',
}
const CAT_LABEL: Record<FinancialCategory, string> = {
  housing: 'Vivienda', food: 'Alimentacion', transport: 'Transporte', health: 'Salud',
  entertainment: 'Entretenimiento', investment: 'Inversion', business: 'Negocio',
  personal: 'Personal', debt: 'Deuda', other: 'Otro',
}
const LIQUIDITY_MONTHS = 2.5

type Tone = 'ok' | 'warn' | 'bad'
function toneText(t: Tone): string {
  return t === 'ok' ? 'text-emerald-400' : t === 'warn' ? 'text-amber-400' : 'text-red-400'
}

export default function FinancePage() {
  const hydrated = useHasHydrated()
  if (!hydrated) return <RouteSkeleton cards={4} />
  return <FinanceContent />
}

function FinanceContent() {
  const { financialMovements, addFinancialMovement, removeFinancialMovement } = useFinanceStore()
  const { addMemory } = useMemoryStore()
  const fin = useMemo(() => analyzeFinancialStability(financialMovements, LIQUIDITY_MONTHS), [financialMovements])
  const alerts = useMemo(() => detectFinancialAlerts(financialMovements, LIQUIDITY_MONTHS), [financialMovements])
  const [type, setType] = useState<MovementType>('expense')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [category, setCategory] = useState<FinancialCategory>('other')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [recurrent, setRecurrent] = useState(false)
  const [filterType, setFilterType] = useState<MovementType | 'all'>('all')

  function addMovement() {
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) return
    const m: FinancialMovement = {
      id: `f_${Date.now()}`, type, amount: amt, currency, category,
      description: description || TYPE_LABEL[type], date, recurrent, tags: [],
    }
    addFinancialMovement(m)
    addMemory(createFinancialMovementMemory(m))
    setAmount(''); setDescription('')
  }

  const sorted = [...financialMovements].sort((a, b) => b.date.localeCompare(a.date))
  const filtered = filterType === 'all' ? sorted : sorted.filter(m => m.type === filterType)

  const stabilityTone: Tone = fin.riskLevel === 'low' ? 'ok' : fin.riskLevel === 'medium' ? 'warn' : 'bad'
  const balanceTone: Tone = fin.monthlyBalance >= 0 ? 'ok' : 'bad'
  const savingsTone: Tone = fin.savingsRate >= 20 ? 'ok' : fin.savingsRate >= 10 ? 'warn' : 'bad'

  const stats = [
    { label: 'Estabilidad', value: fin.stability.toFixed(1), unit: '/10', tone: stabilityTone },
    { label: 'Balance mensual', value: fin.monthlyBalance >= 0 ? '+' + fin.monthlyBalance.toFixed(0) : fin.monthlyBalance.toFixed(0), unit: ' USD', tone: balanceTone },
    { label: 'Tasa ahorro', value: fin.savingsRate.toFixed(0), unit: '%', tone: savingsTone },
    { label: 'Riesgo', value: fin.riskLevel, unit: '', tone: stabilityTone },
  ]

  return (
    <AppShell>
      <div className="mb-8">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mb-1">SIR V2</div>
        <h1 className="text-3xl font-semibold tracking-tight">Finanzas</h1>
        <p className="text-sm text-muted-foreground mt-1">Flujo de caja, estabilidad y alertas</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {stats.map((s) => (
          <Card key={s.label} className="shadow-none">
            <CardContent className="p-4">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-1">{s.label}</div>
              <div className={cn('text-xl font-mono font-bold', toneText(s.tone))}>
                {s.value}<span className="text-sm text-muted-foreground/50">{s.unit}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {alerts.length > 0 && (
        <Card className="mb-4 shadow-none">
          <CardContent className="p-6">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-2">Alertas &mdash; {alerts.length}</div>
            {alerts.map((a, i) => (
              <div key={i} className="flex gap-2 items-start py-1 border-b border-border/50 last:border-0">
                <span className={cn('text-xs mt-0.5', a.severity === 'critical' ? 'text-red-400' : 'text-amber-400')}>!</span>
                <div>
                  <div className="text-xs text-muted-foreground">{a.message}</div>
                  {a.suggestedAction && <div className="text-[10px] text-muted-foreground/60 mt-0.5">{a.suggestedAction}</div>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="mb-4 shadow-none">
        <CardContent className="p-6">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-3">Registrar movimiento</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-2">
            <Select value={type} onValueChange={(v) => setType(v as MovementType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(TYPE_LABEL) as MovementType[]).map(t => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={category} onValueChange={(v) => setCategory(v as FinancialCategory)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(CAT_LABEL) as FinancialCategory[]).map(c => <SelectItem key={c} value={c}>{CAT_LABEL[c]}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex gap-1">
              <Input type="number" min="0" step="0.01" placeholder="Monto" value={amount} onChange={e => setAmount(e.target.value)} className="font-mono" />
              <Input placeholder="USD" value={currency} onChange={e => setCurrency(e.target.value)} className="w-16 font-mono" />
            </div>
            <Input placeholder="Descripcion" value={description} onChange={e => setDescription(e.target.value)} className="col-span-2" />
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="font-mono" />
          </div>
          <div className="flex items-center gap-4 mb-3">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={recurrent} onChange={e => setRecurrent(e.target.checked)} className="accent-foreground" />
              Recurrente
            </label>
          </div>
          <Button onClick={addMovement} variant="outline" size="sm">+ Registrar</Button>
        </CardContent>
      </Card>

      <div className="flex gap-2 mb-3 flex-wrap">
        {(['all', ...Object.keys(TYPE_LABEL)] as (MovementType | 'all')[]).map(t => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            className={cn(
              'text-[10px] font-mono px-2 py-1 rounded border transition-colors',
              filterType === t
                ? 'border-foreground/30 text-foreground bg-muted'
                : 'border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground',
            )}
          >
            {t === 'all' ? 'Todos' : TYPE_LABEL[t as MovementType]}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-xs text-muted-foreground/70 py-8 text-center">Sin movimientos.</div>
      ) : (
        <div className="space-y-1">
          {filtered.slice(0, 50).map((m) => (
            <div key={m.id} className="flex justify-between items-center py-2 border-b border-border/50 last:border-0 group">
              <div className="flex flex-col">
                <span className="text-sm text-foreground">{m.description}</span>
                <div className="flex gap-2 mt-0.5 items-center">
                  <Badge variant="outline" className="text-[10px] font-normal">{CAT_LABEL[m.category]}</Badge>
                  {m.recurrent && <Badge variant="outline" className="text-[10px] font-normal border-blue-500/30 bg-blue-500/10 text-blue-400">recurrente</Badge>}
                  <span className="text-[10px] text-muted-foreground/60 font-mono">{m.date}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={cn('text-sm font-mono', TYPE_COLOR[m.type])}>{TYPE_SIGN[m.type]}{m.amount.toFixed(0)} {m.currency}</span>
                <button
                  onClick={() => removeFinancialMovement(m.id)}
                  className="text-xs text-muted-foreground/40 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Eliminar"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  )
}
