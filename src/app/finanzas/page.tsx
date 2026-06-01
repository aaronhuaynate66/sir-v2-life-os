'use client'
// SIR V2 — /finance
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { DollarSign, Wallet, ArrowRightLeft, Plus, Filter, AlertCircle, TrendingUp, TrendingDown, ArrowLeftRight } from 'lucide-react'
import { fetchUsdToPenRate, FALLBACK_USD_PEN } from '@/lib/exchange'
import { formatCurrency, formatPEN, formatCurrencyCompact } from '@/lib/format/currency'
import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SectionTitle } from '@/components/ui/section-title'
import { useFinanceStore } from '@/stores/useFinanceStore'
import { useMemoryStore } from '@/stores'
import { analyzeFinancialStability, detectFinancialAlerts, analyzeSpendingByIntent, SPEND_INTENT_ORDER } from '@/engines/financial'
import { createFinancialMovementMemory } from '@/engines/memory'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { RouteSkeleton } from '@/components/skeletons/RouteSkeleton'
import { TrendChart } from '@/components/charts/TrendChart'
import { financeBalanceSeries } from '@/lib/charts/adapters'
import { ExportCsvButton } from '@/components/export/ExportCsvButton'
import { financeMovementsCsv } from '@/lib/export/adapters'
import { SpendIntentBreakdown } from '@/components/finanzas/SpendIntentBreakdown'
import { EmotionFinancePanel } from '@/components/finanzas/EmotionFinancePanel'
import { INTENT_LABEL, INTENT_HINT, INTENT_BADGE } from '@/lib/finanzas/intent-meta'
import { correlateStressVsNonEssentialSpend } from '@/lib/longitudinal/emotionFinance'
import { useSelfStore } from '@/stores/useSelfStore'
import { cn } from '@/lib/utils'
import type { MovementType, FinancialCategory, FinancialMovement, Currency, SpendIntent } from '@/types'

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

const cardClass = 'shadow-none transition-colors duration-200 hover:border-primary/30'

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
  const { selfMetrics } = useSelfStore()
  const { addMemory } = useMemoryStore()
  const fin = useMemo(() => analyzeFinancialStability(financialMovements, LIQUIDITY_MONTHS), [financialMovements])
  const alerts = useMemo(() => detectFinancialAlerts(financialMovements, LIQUIDITY_MONTHS), [financialMovements])
  const spendingByIntent = useMemo(() => analyzeSpendingByIntent(financialMovements), [financialMovements])
  // P3: correlación estrés (self_metrics) ↔ gasto no-esencial (intent).
  const emotionFinance = useMemo(
    () => correlateStressVsNonEssentialSpend(selfMetrics, financialMovements),
    [selfMetrics, financialMovements],
  )
  const [type, setType] = useState<MovementType>('expense')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<Currency>('PEN')
  const [exchangeRate, setExchangeRate] = useState<string>('')
  const [rateIsFallback, setRateIsFallback] = useState(false)
  const [category, setCategory] = useState<FinancialCategory>('other')
  // Intención del gasto (P1). Solo aplica a salidas (expense/debt).
  const [intent, setIntent] = useState<SpendIntent>('necesario')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [recurrent, setRecurrent] = useState(false)
  const [filterType, setFilterType] = useState<MovementType | 'all'>('all')

  // Auto-fetch USD->PEN rate the first time the user picks USD per session.
  // Once populated the user can override the value before saving.
  useEffect(() => {
    if (currency !== 'USD') return
    if (exchangeRate.trim() !== '') return
    let cancelled = false
    void fetchUsdToPenRate().then((r) => {
      if (cancelled) return
      setExchangeRate(r.rate.toFixed(4))
      setRateIsFallback(r.isFallback)
      if (r.isFallback) {
        toast.warning('Tipo de cambio offline', { description: `Usando referencia ~${FALLBACK_USD_PEN}` })
      }
    })
    return () => { cancelled = true }
  }, [currency, exchangeRate])

  const parsedRate = parseFloat(exchangeRate)
  const liveRate = currency === 'USD' && !isNaN(parsedRate) && parsedRate > 0 ? parsedRate : 1.0
  const parsedAmount = parseFloat(amount)
  const livePreviewPen = currency === 'USD' && !isNaN(parsedAmount) ? parsedAmount * liveRate : 0

  function addMovement() {
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) { toast.error('Monto invalido', { description: 'El monto debe ser mayor que 0.' }); return }
    let rate: number
    let amountPEN: number
    if (currency === 'PEN') {
      rate = 1.0
      amountPEN = amt
    } else {
      rate = parseFloat(exchangeRate)
      if (isNaN(rate) || rate <= 0) { toast.error('Tipo de cambio invalido', { description: 'Ingresa un TC mayor que 0.' }); return }
      amountPEN = amt * rate
    }
    // La intención solo tiene sentido en salidas de dinero (expense/debt).
    const isOutflow = type === 'expense' || type === 'debt'
    const m: FinancialMovement = {
      id: `f_${Date.now()}`, type, amount: amt, currency, exchangeRate: rate, amountPEN, category,
      intent: isOutflow ? intent : undefined,
      description: description || TYPE_LABEL[type], date, recurrent, tags: [],
    }
    addFinancialMovement(m)
    addMemory(createFinancialMovementMemory(m))
    setAmount(''); setDescription('')
    if (currency === 'USD') {
      // Keep currency=USD + rate so the user can register multiple USD
      // movements without re-fetching. Reset on PEN.
    }
    toast.success('Movimiento registrado', {
      description: currency === 'USD'
        ? `${TYPE_LABEL[type]}: ${formatCurrency(amt, 'USD')} = ${formatPEN(amountPEN)}`
        : `${TYPE_LABEL[type]}: ${formatPEN(amt)}`,
    })
  }
  function handleRemoveMovement(id: string, desc: string) {
    removeFinancialMovement(id)
    toast.success('Movimiento eliminado', { description: desc })
  }
  function handleCurrencyChange(next: Currency) {
    setCurrency(next)
    if (next === 'PEN') {
      setExchangeRate('')
      setRateIsFallback(false)
    }
  }

  const sorted = [...financialMovements].sort((a, b) => b.date.localeCompare(a.date))
  const filtered = filterType === 'all' ? sorted : sorted.filter(m => m.type === filterType)
  // Feature 3: balance acumulado (PEN) en el tiempo.
  const balanceSeries = useMemo(() => financeBalanceSeries(financialMovements), [financialMovements])

  const stabilityTone: Tone = fin.riskLevel === 'low' ? 'ok' : fin.riskLevel === 'medium' ? 'warn' : 'bad'
  const balanceTone: Tone = fin.monthlyBalance >= 0 ? 'ok' : 'bad'
  const savingsTone: Tone = fin.savingsRate >= 20 ? 'ok' : fin.savingsRate >= 10 ? 'warn' : 'bad'

  const balancePrefix = fin.monthlyBalance >= 0 ? '+' : ''
  const stats = [
    { label: 'Estabilidad', value: fin.stability.toFixed(1), unit: '/10', tone: stabilityTone },
    { label: 'Balance mensual', value: `${balancePrefix}${formatCurrencyCompact(fin.monthlyBalance, 'PEN')}`, unit: '', tone: balanceTone },
    { label: 'Tasa ahorro', value: fin.savingsRate.toFixed(0), unit: '%', tone: savingsTone },
    { label: 'Riesgo', value: fin.riskLevel, unit: '', tone: stabilityTone },
  ]

  return (
    <AppShell>
      <div className="mb-8 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mb-1">SIR V2</div>
          <div className="flex items-center gap-3 mt-1">
            <DollarSign size={28} strokeWidth={1.5} className="text-muted-foreground" />
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Finanzas</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">Flujo de caja, estabilidad y alertas</p>
        </div>
        <ExportCsvButton
          filenamePrefix="finanzas"
          count={financialMovements.length}
          buildCsv={() => financeMovementsCsv(financialMovements)}
          label="Exportar movimientos"
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {stats.map((s) => (
          <Card key={s.label} className={cardClass}>
            <CardContent className="p-3 sm:p-4">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-1">{s.label}</div>
              <div className={cn('text-lg sm:text-xl font-mono font-bold tabular-nums break-words', toneText(s.tone))}>
                {s.value}<span className="text-sm text-muted-foreground/50">{s.unit}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Feature 3: tendencia del balance acumulado (PEN). */}
      <div className="mb-4">
        <TrendChart
          label="Balance acumulado"
          icon={TrendingUp}
          points={balanceSeries}
          colorClass={balanceSeries.length > 0 && (balanceSeries[balanceSeries.length - 1]?.value ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}
          formatValue={(n) => formatPEN(n)}
          emptyHint="Registrá movimientos para ver cómo evoluciona tu balance."
        />
      </div>

      {alerts.length > 0 && (
        <Card className={cn('mb-4', cardClass)}>
          <CardContent className="p-4 sm:p-6">
            <SectionTitle icon={AlertCircle} label="Alertas" count={alerts.length} />
            {alerts.map((a, i) => (
              <div key={i} className="flex gap-2 items-start py-1 border-b border-border/40 last:border-0">
                <AlertCircle size={12} strokeWidth={2} className={cn('mt-0.5 flex-shrink-0', a.severity === 'critical' ? 'text-red-400' : 'text-amber-400')} />
                <div>
                  <div className="text-xs text-muted-foreground leading-relaxed">{a.message}</div>
                  {a.suggestedAction && <div className="text-[10px] text-muted-foreground/60 mt-0.5">{a.suggestedAction}</div>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* P1: desglose del gasto por intención (obligatorio/necesario/no-esencial). */}
      <SpendIntentBreakdown data={spendingByIntent} />

      {/* P3: correlación estrés ↔ gasto no-esencial. */}
      <EmotionFinancePanel data={emotionFinance} />

      <Card className={cn('mb-4', cardClass)}>
        <CardContent className="p-4 sm:p-6">
          <SectionTitle icon={Plus} label="Registrar movimiento" />
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
            <Select value={currency} onValueChange={(v) => handleCurrencyChange(v as Currency)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PEN">S/ (Soles)</SelectItem>
                <SelectItem value="USD">$ (USD)</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="number" min="0" step="0.01"
              placeholder={currency === 'PEN' ? 'Monto S/' : 'Monto $'}
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="font-mono tabular-nums"
            />
            <Input placeholder="Descripcion" value={description} onChange={e => setDescription(e.target.value)} className="col-span-2 md:col-span-1" />
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="font-mono tabular-nums" />
          </div>
          {currency === 'USD' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3 p-3 rounded border border-border bg-muted/30">
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-1">
                  Tipo de cambio USD&rarr;PEN
                </label>
                <Input
                  type="number" min="0" step="0.0001"
                  placeholder="3.7600"
                  value={exchangeRate}
                  onChange={e => { setExchangeRate(e.target.value); setRateIsFallback(false) }}
                  className="font-mono tabular-nums"
                />
                {rateIsFallback && (
                  <p className="text-[10px] text-amber-400 mt-1">Tipo de cambio offline, usando referencia.</p>
                )}
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-1">
                  Equivalente
                </label>
                <div className="text-sm font-mono tabular-nums h-9 flex items-center text-foreground">
                  {!isNaN(parsedAmount) && parsedAmount > 0 && liveRate > 0
                    ? `${formatCurrency(parsedAmount, 'USD')} x ${liveRate.toFixed(4)} = ${formatPEN(livePreviewPen)}`
                    : <span className="text-muted-foreground/60">Ingresa monto y TC</span>}
                </div>
              </div>
            </div>
          )}
          {/* Intención — solo en salidas de dinero (P1). Ortogonal a la categoría. */}
          {(type === 'expense' || type === 'debt') && (
            <div className="mb-3 p-3 rounded border border-border bg-muted/30">
              <label className="block text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-1.5">
                Intención del gasto
              </label>
              <Select value={intent} onValueChange={(v) => setIntent(v as SpendIntent)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SPEND_INTENT_ORDER.map((i) => (
                    <SelectItem key={i} value={i}>{INTENT_LABEL[i]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground/60 mt-1.5">{INTENT_HINT[intent]}</p>
            </div>
          )}
          <div className="flex items-center gap-4 mb-3">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={recurrent} onChange={e => setRecurrent(e.target.checked)} className="accent-foreground" />
              Recurrente
            </label>
          </div>
          <Button onClick={addMovement} variant="outline" size="sm">+ Registrar</Button>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Filter size={12} strokeWidth={1.75} className="text-muted-foreground/60" />
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-sans">Filtrar</span>
        {(['all', ...Object.keys(TYPE_LABEL)] as (MovementType | 'all')[]).map(t => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            className={cn(
              'text-[10px] font-mono px-2.5 py-1.5 rounded border transition-colors',
              filterType === t
                ? 'border-primary/40 text-primary bg-primary/10'
                : 'border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground',
            )}
          >
            {t === 'all' ? 'Todos' : TYPE_LABEL[t as MovementType]}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <ArrowRightLeft size={24} strokeWidth={1.5} className="text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Sin movimientos en este filtro.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Registra un movimiento arriba para empezar.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.slice(0, 50).map((m) => {
            const TypeIcon = m.type === 'income' ? TrendingUp : m.type === 'expense' ? TrendingDown : m.type === 'transfer' ? ArrowLeftRight : Wallet
            return (
              <div key={m.id} className="flex justify-between items-center py-2 border-b border-border/40 last:border-0 group hover:bg-accent/5 px-2 -mx-2 rounded transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <TypeIcon size={14} strokeWidth={1.75} className={cn('flex-shrink-0', TYPE_COLOR[m.type])} />
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm text-foreground truncate">{m.description}</span>
                    <div className="flex gap-2 mt-0.5 items-center flex-wrap">
                      <Badge variant="outline" className="text-[10px] font-normal">{CAT_LABEL[m.category]}</Badge>
                      {m.intent && <Badge variant="outline" className={cn('text-[10px] font-normal', INTENT_BADGE[m.intent])}>{INTENT_LABEL[m.intent]}</Badge>}
                      {m.recurrent && <Badge variant="outline" className="text-[10px] font-normal border-blue-500/30 bg-blue-500/10 text-blue-400">recurrente</Badge>}
                      <span className="text-[10px] text-muted-foreground/60 font-mono tabular-nums">{m.date}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="flex flex-col items-end">
                    {m.currency === 'USD' && (
                      <span className="text-[10px] font-mono tabular-nums text-muted-foreground/70">
                        {TYPE_SIGN[m.type]}{formatCurrency(m.amount, 'USD')} <span className="text-muted-foreground/50">TC {m.exchangeRate.toFixed(4)}</span>
                      </span>
                    )}
                    <span className={cn('text-sm font-mono tabular-nums', TYPE_COLOR[m.type])}>
                      {TYPE_SIGN[m.type]}{formatPEN(m.amountPEN)}
                    </span>
                  </div>
                  <button
                    onClick={() => handleRemoveMovement(m.id, m.description)}
                    className="flex-shrink-0 h-8 w-8 flex items-center justify-center rounded text-base leading-none text-muted-foreground/40 hover:text-red-400 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                    aria-label="Eliminar"
                  >
                    ×
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </AppShell>
  )
}
