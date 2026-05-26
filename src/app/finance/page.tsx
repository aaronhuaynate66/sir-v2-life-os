'use client'
// SIR V2 — /finance
import { useMemo, useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { Card, Badge, Button, Input, Select, SectionHeader, EmptyState } from '@/components/ui'
import { useFinanceStore } from '@/stores/useFinanceStore'
import { useMemoryStore } from '@/stores'
import { analyzeFinancialStability, detectFinancialAlerts } from '@/engines/financial'
import { createFinancialMovementMemory } from '@/engines/memory'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { RouteSkeleton } from '@/components/skeletons/RouteSkeleton'
import type { MovementType, FinancialCategory, FinancialMovement } from '@/types'

const TYPE_LABEL: Record<MovementType, string> = {
  income: 'Ingreso', expense: 'Gasto', investment: 'Inversion', transfer: 'Transferencia', debt: 'Deuda'
}
const TYPE_COLOR: Record<MovementType, string> = {
  income: 'text-[#22c55e]', expense: 'text-[#ef4444]', investment: 'text-[#3b82f6]',
  transfer: 'text-[#f59e0b]', debt: 'text-[#ef4444]'
}
const TYPE_SIGN: Record<MovementType, string> = {
  income: '+', expense: '-', investment: '-', transfer: '', debt: '-'
}
const CAT_LABEL: Record<FinancialCategory, string> = {
  housing: 'Vivienda', food: 'Alimentacion', transport: 'Transporte', health: 'Salud',
  entertainment: 'Entretenimiento', investment: 'Inversion', business: 'Negocio',
  personal: 'Personal', debt: 'Deuda', other: 'Otro'
}
const LIQUIDITY_MONTHS = 2.5

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
      description: description || TYPE_LABEL[type], date, recurrent, tags: []
    }
    addFinancialMovement(m)
    addMemory(createFinancialMovementMemory(m))
    setAmount(''); setDescription('')
  }

  const sorted = [...financialMovements].sort((a, b) => b.date.localeCompare(a.date))
  const filtered = filterType === 'all' ? sorted : sorted.filter(m => m.type === filterType)

  return (
    <AppShell>
      <SectionHeader title="Finanzas" subtitle="Flujo de caja, estabilidad y alertas" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Estabilidad', value: fin.stability.toFixed(1), unit: '/10', variant: fin.riskLevel === 'low' ? 'ok' : fin.riskLevel === 'medium' ? 'warn' : 'bad' },
          { label: 'Balance mensual', value: fin.monthlyBalance >= 0 ? '+' + fin.monthlyBalance.toFixed(0) : fin.monthlyBalance.toFixed(0), unit: ' USD', variant: fin.monthlyBalance >= 0 ? 'ok' : 'bad' },
          { label: 'Tasa ahorro', value: fin.savingsRate.toFixed(0), unit: '%', variant: fin.savingsRate >= 20 ? 'ok' : fin.savingsRate >= 10 ? 'warn' : 'bad' },
          { label: 'Riesgo', value: fin.riskLevel, unit: '', variant: fin.riskLevel === 'low' ? 'ok' : fin.riskLevel === 'medium' ? 'warn' : 'bad' },
        ].map((s) => (
          <Card key={s.label} className="flex flex-col gap-1">
            <div className="text-[9px] font-mono text-[#333] uppercase tracking-widest">{s.label}</div>
            <div className={`text-xl font-mono font-bold ${s.variant === 'ok' ? 'text-[#22c55e]' : s.variant === 'warn' ? 'text-[#f59e0b]' : 'text-[#ef4444]'}`}>
              {s.value}<span className="text-sm text-[#333]">{s.unit}</span>
            </div>
          </Card>
        ))}
      </div>
      {alerts.length > 0 && (
        <Card className="mb-4 border-[#2a2a2a]">
          <div className="text-[10px] font-mono text-[#333] uppercase tracking-widest mb-2">Alertas - {alerts.length}</div>
          {alerts.map((a, i) => (
            <div key={i} className="flex gap-2 items-start py-1 border-b border-[#1a1a1a] last:border-0">
              <span className={`text-xs mt-0.5 ${a.severity === 'critical' ? 'text-[#ef4444]' : 'text-[#f59e0b]'}`}>!</span>
              <div>
                <div className="text-xs text-[#555]">{a.message}</div>
                {a.suggestedAction && <div className="text-[10px] text-[#333] mt-0.5">{a.suggestedAction}</div>}
              </div>
            </div>
          ))}
        </Card>
      )}
      <Card className="mb-4">
        <div className="text-[10px] font-mono text-[#333] uppercase tracking-widest mb-3">Registrar movimiento</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-2">
          <Select value={type} onChange={e => setType(e.target.value as MovementType)}>
            {(Object.keys(TYPE_LABEL) as MovementType[]).map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </Select>
          <Select value={category} onChange={e => setCategory(e.target.value as FinancialCategory)}>
            {(Object.keys(CAT_LABEL) as FinancialCategory[]).map(c => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
          </Select>
          <div className="flex gap-1">
            <Input type="number" min="0" step="0.01" placeholder="Monto" value={amount} onChange={e => setAmount(e.target.value)} />
            <Input placeholder="USD" value={currency} onChange={e => setCurrency(e.target.value)} className="w-16" />
          </div>
          <Input placeholder="Descripcion" value={description} onChange={e => setDescription(e.target.value)} className="col-span-2" />
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div className="flex items-center gap-4 mb-2">
          <label className="flex items-center gap-2 text-xs text-[#444] cursor-pointer">
            <input type="checkbox" checked={recurrent} onChange={e => setRecurrent(e.target.checked)} className="accent-[#333]" />
            Recurrente
          </label>
        </div>
        <Button onClick={addMovement}>+ Registrar</Button>
      </Card>
      <div className="flex gap-2 mb-3 flex-wrap">
        {(['all', ...Object.keys(TYPE_LABEL)] as (MovementType | 'all')[]).map(t => (
          <button key={t} onClick={() => setFilterType(t)}
            className={`text-[10px] font-mono px-2 py-1 rounded border transition-colors ${filterType === t ? 'border-[#333] text-[#f5f5f5]' : 'border-[#1a1a1a] text-[#333] hover:border-[#222] hover:text-[#555]'}`}>
            {t === 'all' ? 'Todos' : TYPE_LABEL[t as MovementType]}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <EmptyState message="Sin movimientos." />
      ) : (
        <div className="space-y-1">
          {filtered.slice(0, 50).map((m) => (
            <div key={m.id} className="flex justify-between items-center py-2 border-b border-[#1a1a1a] last:border-0 group">
              <div className="flex flex-col">
                <span className="text-xs text-[#f5f5f5]">{m.description}</span>
                <div className="flex gap-2 mt-0.5">
                  <Badge label={CAT_LABEL[m.category]} variant="muted" />
                  {m.recurrent && <Badge label="recurrente" variant="info" />}
                  <span className="text-[9px] text-[#222] font-mono">{m.date}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-sm font-mono ${TYPE_COLOR[m.type]}`}>{TYPE_SIGN[m.type]}{m.amount.toFixed(0)} {m.currency}</span>
                <button onClick={() => removeFinancialMovement(m.id)} className="text-[10px] text-[#1a1a1a] hover:text-[#ef4444] opacity-0 group-hover:opacity-100 transition-opacity">x</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  )
}
