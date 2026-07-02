'use client'
// SIR V2 — PatronesCiclo: cuenta moments por fase del ciclo REGISTRADA y por
// fase lunar. Sirve para leer patrones como "las peleas caen en bleeding" o
// "los momentos buenos caen en mid_cycle". Determinístico, sin LLM.
//
// Se OCULTA silenciosamente si no hay suficientes moments para leer patrón
// (mínimo 3 moments cruzables con cycles, o 5 con luna). Cero ruido.

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { LineChart, Sparkles, Moon } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { groupMomentsByExplicitCycle, groupMomentsByLunar, topBucket } from '@/lib/longitudinal/patrones'
import type { RelationshipMoment } from '@/lib/moments/types'
import type { PersonCycleEntry } from '@/lib/person-cycles/types'

interface Props {
  personName: string
  moments: RelationshipMoment[]
  personCycles: PersonCycleEntry[]
}

const MIN_CYCLE_MOMENTS = 3
const MIN_LUNAR_MOMENTS = 5

export function PatronesCiclo({ personName, moments, personCycles }: Props) {
  const byCycle = useMemo(() => groupMomentsByExplicitCycle(moments, personCycles), [moments, personCycles])
  const byLunar = useMemo(() => groupMomentsByLunar(moments), [moments])

  const showCycle = byCycle.total >= MIN_CYCLE_MOMENTS
  const showLunar = byLunar.total >= MIN_LUNAR_MOMENTS

  if (!showCycle && !showLunar) return null

  const topC = topBucket(byCycle)
  const topL = topBucket(byLunar)

  return (
    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="mb-4">
      <Card className="shadow-none">
        <CardContent className="p-4 sm:p-5 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <LineChart size={14} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
            <span className="text-[10px] uppercase tracking-widest text-text-tertiary font-sans">
              Patrones observados con {personName.split(' ')[0]}
            </span>
          </div>

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Distribución de episodios por fase. Coincidencia, no causa — describí antes de concluir.
          </p>

          {showCycle && (
            <PatternBlock
              icon={<Sparkles size={11} strokeWidth={1.75} className="text-muted-foreground/70" />}
              title="Por fase del ciclo"
              buckets={byCycle.buckets.filter((b) => b.count > 0)}
              total={byCycle.total}
              topBucket={topC}
            />
          )}

          {showLunar && (
            <PatternBlock
              icon={<Moon size={11} strokeWidth={1.75} className="text-muted-foreground/70" />}
              title="Por fase lunar"
              buckets={byLunar.buckets.filter((b) => b.count > 0)}
              total={byLunar.total}
              topBucket={topL}
            />
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

function PatternBlock({
  icon,
  title,
  buckets,
  total,
  topBucket: top,
}: {
  icon: React.ReactNode
  title: string
  buckets: Array<{ phaseId: string; label: string; count: number; fraction: number }>
  total: number
  topBucket: { phaseId: string; label: string; count: number; fraction: number } | null
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{title}</span>
        <Badge variant="outline" className="text-[10px] font-mono">{total}</Badge>
      </div>
      <ul className="space-y-1">
        {buckets.map((b) => (
          <li key={b.phaseId} className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground w-32 shrink-0 truncate">{b.label}</span>
            <div className="flex-1 h-2 rounded-full bg-muted/30 overflow-hidden">
              <div
                className={cn('h-full rounded-full', b.phaseId === top?.phaseId ? 'bg-brand' : 'bg-muted-foreground/50')}
                style={{ width: `${b.fraction * 100}%` }}
              />
            </div>
            <span className="text-[11px] font-mono tabular-nums text-foreground w-8 text-right shrink-0">
              {b.count}
            </span>
          </li>
        ))}
      </ul>
      {top && total >= 3 && (
        <p className="text-[10px] text-muted-foreground/80 italic pt-1">
          Mayor concentración en <span className="text-foreground font-medium">{top.label}</span> ({top.count} de {total}).
        </p>
      )}
    </div>
  )
}
