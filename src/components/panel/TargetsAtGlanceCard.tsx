'use client'

// SIR V2 — Targets at a Glance (Mission Control).
//
// Cross-check de los 2 objetivos con métrica dura de Aaron:
//   - Ingresos → progreso vs S/15,000/mes
//   - Mundial WFG26 → peso vs categoría +80 kg
//
// Es un cockpit chiquito: 2 rows, chip + número + eyebrow. Sin gráficos, sin
// LLM, sin fricción. Fail-safe: si ninguno aplica (no hay goals declarados),
// no renderiza. Si uno aplica y el otro no, muestra solo el que tiene data.

import { motion } from 'framer-motion'
import { useMemo } from 'react'
import { DollarSign, Scale, TrendingUp, TrendingDown, Minus, AlertCircle } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useGoalStore } from '@/stores/useGoalStore'
import { useFinanceStore } from '@/stores/useFinanceStore'
import { useSelfStore } from '@/stores/useSelfStore'
import { computeIncomeTargetProgress, computeMundialWeightAlert } from '@/engines/targets'
import { formatPEN } from '@/lib/format/currency'
import { cn } from '@/lib/utils'

interface TargetsAtGlanceCardProps {
  now?: Date | null
  /** Health metrics: en producción vienen del store /yo (useSelfStore lo expone).
   *  Se pasan aparte por si el caller ya los tiene calculados. */
  healthMetrics?: Parameters<typeof computeMundialWeightAlert>[1]
}

export function TargetsAtGlanceCard({ now, healthMetrics }: TargetsAtGlanceCardProps = {}) {
  const goals = useGoalStore((s) => s.goals)
  const financialMovements = useFinanceStore((s) => s.financialMovements)
  const storeHealth = useSelfStore((s) => s.healthMetrics)
  const health = healthMetrics ?? storeHealth ?? []

  const income = useMemo(
    () => computeIncomeTargetProgress(goals, financialMovements, now ?? new Date()),
    [goals, financialMovements, now],
  )
  const weight = useMemo(
    () => computeMundialWeightAlert(goals, health, now ?? new Date()),
    [goals, health, now],
  )

  const showIncome = income.status !== 'no_goal'
  const showWeight = weight.status !== 'no_goal'
  if (!showIncome && !showWeight) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mb-6"
    >
      <Card className="shadow-none">
        <CardContent className="p-4 sm:p-5 space-y-3">
          {showIncome && <IncomeRow r={income} />}
          {showIncome && showWeight && <div className="border-t border-border/40" />}
          {showWeight && <WeightRow r={weight} />}
        </CardContent>
      </Card>
    </motion.div>
  )
}

function IncomeRow({ r }: { r: ReturnType<typeof computeIncomeTargetProgress> }) {
  const chip = r.status === 'ahead' || r.status === 'on_track'
    ? 'border-ok/40 bg-ok-soft text-ok'
    : r.status === 'behind'
      ? 'border-warn/40 bg-warn-soft text-warn'
      : 'border-border bg-muted text-muted-foreground'
  const chipText = r.status === 'ahead' ? 'ADELANTADO'
    : r.status === 'on_track' ? 'EN RUTA'
    : r.status === 'behind' ? 'ATRAS'
    : 'SIN DATOS'
  const Icon = r.status === 'ahead' || r.status === 'on_track' ? TrendingUp
    : r.status === 'behind' ? TrendingDown : Minus
  const iconColor = r.status === 'ahead' || r.status === 'on_track' ? 'text-ok'
    : r.status === 'behind' ? 'text-warn' : 'text-muted-foreground'

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-2">
          <DollarSign size={14} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
          <span className="text-[10px] uppercase tracking-widest text-text-tertiary font-sans">
            Ingresos vs target
          </span>
        </div>
        <Badge variant="outline" className={cn('text-[9px] font-mono tracking-widest', chip)}>
          {chipText}
        </Badge>
      </div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-2xl font-mono font-semibold tabular-nums">
          {r.currentMonthly != null ? formatPEN(r.currentMonthly) : '—'}
        </span>
        <span className="text-xs text-muted-foreground">
          / <span className="text-foreground/80 font-mono tabular-nums">{r.targetMonthly != null ? formatPEN(r.targetMonthly) : '—'}</span>/mes
        </span>
        {r.progressPct != null && (
          <div className={cn('flex items-center gap-1 text-xs ml-auto', iconColor)}>
            <Icon size={13} strokeWidth={1.75} />
            <span className="font-mono tabular-nums">{r.progressPct}%</span>
          </div>
        )}
      </div>
      {r.gapMonthly != null && r.gapMonthly > 0 && r.monthsRemaining != null && (
        <p className="mt-2 text-[11px] text-muted-foreground/80 leading-relaxed">
          Faltan <span className="font-mono tabular-nums text-foreground/90">{formatPEN(r.gapMonthly)}</span>/mes ·
          <span className="font-mono tabular-nums text-foreground/90"> {r.monthsRemaining}</span> meses hasta el objetivo
        </p>
      )}
    </div>
  )
}

function WeightRow({ r }: { r: ReturnType<typeof computeMundialWeightAlert> }) {
  const chip = r.status === 'in_range' ? 'border-ok/40 bg-ok-soft text-ok'
    : r.status === 'close_to_edge' ? 'border-warn/40 bg-warn-soft text-warn'
    : r.status === 'below_min' || r.status === 'above_max' ? 'border-bad/40 bg-bad-soft text-bad'
    : 'border-border bg-muted text-muted-foreground'
  const chipText = r.status === 'in_range' ? 'EN CATEGORIA'
    : r.status === 'close_to_edge' ? 'CERCA DEL BORDE'
    : r.status === 'below_min' ? 'FUERA · BAJO'
    : r.status === 'above_max' ? 'FUERA · ARRIBA'
    : 'SIN DATOS'

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Scale size={14} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
          <span className="text-[10px] uppercase tracking-widest text-text-tertiary font-sans">
            Mundial · peso categoría
          </span>
        </div>
        <Badge variant="outline" className={cn('text-[9px] font-mono tracking-widest', chip)}>
          {chipText}
        </Badge>
      </div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-2xl font-mono font-semibold tabular-nums">
          {r.currentKg != null ? `${r.currentKg} kg` : '—'}
        </span>
        {r.categoryMinKg != null && r.categoryMaxKg != null && (
          <span className="text-xs text-muted-foreground">
            categoría <span className="text-foreground/80 font-mono tabular-nums">{r.categoryMinKg}–{r.categoryMaxKg} kg</span>
          </span>
        )}
        {r.daysToEvent != null && r.daysToEvent > 0 && (
          <span className="text-xs text-muted-foreground/70 ml-auto font-mono tabular-nums">
            {r.daysToEvent}d
          </span>
        )}
      </div>
      {(r.status === 'below_min' || r.status === 'close_to_edge') && r.categoryMinKg != null && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-warn leading-relaxed">
          <AlertCircle size={11} strokeWidth={2} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
          {r.status === 'below_min'
            ? `Estás fuera por debajo de ${r.categoryMinKg} kg. Volver a rango: comer más pesado, no correr por bajar.`
            : `A menos de 1 kg del límite. Un buen día de comida sostiene la categoría.`}
        </p>
      )}
      {r.status === 'above_max' && r.categoryMaxKg != null && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-bad leading-relaxed">
          <AlertCircle size={11} strokeWidth={2} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
          Fuera de {r.categoryMaxKg} kg. Ajuste calórico gradual, no dramático.
        </p>
      )}
    </div>
  )
}
