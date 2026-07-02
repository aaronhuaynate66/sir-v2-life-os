'use client'
// SIR V2 — EstadoConPersona: síntesis del estado con esta persona.
//
// Cruza toda la data que ya vive en la ficha (person_logs, moments,
// person_cycles, memorias) y muestra insights determinísticos + una
// etiqueta general del vínculo. Cero LLM en la ruta base — pura y rápida.
// El botón "Análisis con IA" queda para la siguiente iteración (se hará
// contra Claude Sonnet con cache 24h para no gastar tokens al pedo).

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { HeartHandshake, TrendingUp, TrendingDown, Minus, AlertCircle, MessageCircle, Sparkles } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { buildEstadoInsights, LABEL_HUMAN, type EstadoInsights } from '@/lib/estado-con-persona/insights'
import type { PersonLog } from '@/lib/person-logs/types'
import type { RelationshipMoment } from '@/lib/moments/types'
import type { PersonCycleEntry } from '@/lib/person-cycles/types'
import type { Memory } from '@/types'

interface Props {
  personName: string
  personLogs: PersonLog[]
  moments: RelationshipMoment[]
  personCycles: PersonCycleEntry[]
  memories: Memory[]
}

const CYCLE_LABEL: Record<string, string> = {
  bleeding: 'Sangrado',
  pms: 'PMS',
  mid_cycle: 'Medio del ciclo',
  ovulation: 'Ovulación',
  luteal: 'Fase lútea',
  unknown: 'Fase indefinida',
}

function daysLabel(n: number | null): string {
  if (n == null) return '—'
  if (n === 0) return 'hoy'
  if (n === 1) return 'ayer'
  if (n < 7) return `hace ${n}d`
  if (n < 30) return `hace ${Math.floor(n / 7)}sem`
  return `hace ${Math.floor(n / 30)}mes`
}

function overdueUrgencyText(insights: EstadoInsights): string | null {
  if (!insights.mostUrgent) return null
  const { title, urgency, deltaDays } = insights.mostUrgent
  if (urgency === 'overdue' && deltaDays != null) {
    return `${title} — vencido hace ${Math.abs(deltaDays)} día${Math.abs(deltaDays) === 1 ? '' : 's'}`
  }
  if (urgency === 'dueSoon' && deltaDays != null) {
    if (deltaDays === 0) return `${title} — hoy`
    if (deltaDays === 1) return `${title} — mañana`
    return `${title} — en ${deltaDays} días`
  }
  return title
}

export function EstadoConPersona({ personName, personLogs, moments, personCycles, memories }: Props) {
  const insights = useMemo(
    () => buildEstadoInsights({ personLogs, moments, personCycles, memories, now: new Date() }),
    [personLogs, moments, personCycles, memories],
  )

  const labelMeta = LABEL_HUMAN[insights.overallLabel]

  const trendIcon = insights.toneDelta == null || insights.toneDelta === 0
    ? Minus
    : insights.toneDelta > 0 ? TrendingUp : TrendingDown
  const TrendIcon = trendIcon
  const trendColor = insights.toneDelta == null || insights.toneDelta === 0
    ? 'text-muted-foreground'
    : insights.toneDelta > 0 ? 'text-ok' : 'text-bad'

  return (
    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="mb-4">
      <Card className={cn('shadow-none border', labelMeta.toneClass)}>
        <CardContent className="p-4 sm:p-5 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <HeartHandshake size={14} strokeWidth={1.75} className="opacity-70" aria-hidden="true" />
            <span className="text-[10px] uppercase tracking-widest font-sans opacity-80">
              Cómo estás con {personName.split(' ')[0]}
            </span>
            <Badge variant="outline" className={cn('text-[10px] font-medium border-current', 'bg-transparent')}>
              {labelMeta.label}
            </Badge>
          </div>

          <p className="text-xs leading-relaxed opacity-90">{labelMeta.description}</p>

          <div className="grid grid-cols-2 gap-3 pt-1 border-t border-current/20">
            <MetricCell
              icon={<MessageCircle size={11} strokeWidth={1.75} className="opacity-60" />}
              label="Última interacción"
              value={insights.lastInteractionAt ? daysLabel(insights.daysSinceLast) : 'sin registro'}
              hint={insights.lastInteractionValue != null ? `tono ${insights.lastInteractionValue}/5` : undefined}
            />
            <MetricCell
              icon={<TrendIcon size={11} strokeWidth={1.75} className={trendColor} />}
              label="Tono reciente"
              value={insights.recentAvg != null ? `${insights.recentAvg}/5` : '—'}
              hint={
                insights.toneDelta != null
                  ? `${insights.toneDelta > 0 ? '+' : ''}${insights.toneDelta} vs anterior`
                  : insights.recentAvg != null ? 'sin comparación' : undefined
              }
              hintClass={insights.toneDelta && insights.toneDelta < 0 ? 'text-bad' : insights.toneDelta && insights.toneDelta > 0 ? 'text-ok' : ''}
            />
          </div>

          {(insights.openMomentsCount > 0 || insights.todayCyclePhase) && (
            <div className="space-y-1.5 pt-2 border-t border-current/20">
              {insights.openMomentsCount > 0 && (
                <div className="flex items-start gap-2 text-xs">
                  <AlertCircle size={11} strokeWidth={1.75} className="mt-0.5 flex-shrink-0 opacity-70" />
                  <span className="leading-relaxed">
                    <span className="font-medium">
                      {insights.openMomentsCount} pendiente{insights.openMomentsCount === 1 ? '' : 's'}
                    </span>
                    {insights.overdueCount > 0 && (
                      <span className="text-bad"> · {insights.overdueCount} vencido{insights.overdueCount === 1 ? '' : 's'}</span>
                    )}
                    {overdueUrgencyText(insights) && (
                      <span className="block text-muted-foreground/80 mt-0.5">{overdueUrgencyText(insights)}</span>
                    )}
                  </span>
                </div>
              )}
              {insights.todayCyclePhase && (
                <div className="flex items-start gap-2 text-xs">
                  <Sparkles size={11} strokeWidth={1.75} className="mt-0.5 flex-shrink-0 opacity-70" />
                  <span className="leading-relaxed">
                    Hoy: <span className="font-medium">{CYCLE_LABEL[insights.todayCyclePhase] ?? insights.todayCyclePhase}</span>
                    <span className="text-muted-foreground/80"> (registro del ciclo)</span>
                  </span>
                </div>
              )}
            </div>
          )}

          {insights.latestMemoryTitle && insights.recentMemoryCount > 0 && (
            <p className="text-[10px] text-muted-foreground/80 leading-relaxed pt-2 border-t border-current/20">
              Último detalle guardado: <span className="italic">{insights.latestMemoryTitle}</span>
              {insights.recentMemoryCount > 1 && (
                <span> · {insights.recentMemoryCount - 1} más en los últimos 60 días</span>
              )}
            </p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

function MetricCell({
  icon,
  label,
  value,
  hint,
  hintClass,
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
  hintClass?: string
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest opacity-70 mb-0.5">
        {icon} {label}
      </div>
      <div className="text-sm font-medium truncate">{value}</div>
      {hint && <div className={cn('text-[10px] opacity-70', hintClass)}>{hint}</div>}
    </div>
  )
}
