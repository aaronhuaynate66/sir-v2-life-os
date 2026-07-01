'use client'

// SIR V2 — Behavioral Suggestion Card (E3 hueco #4).
//
// Muestra la sugerencia conductual del engine cuando detecta un patrón
// (stress + sueño + gasto no-esencial alineados, racha de estrés, deuda
// de sueño). SOLO aparece si hay patrón — nunca renderiza nada por defecto.
//
// Descartable: al dismiss se guarda en localStorage por día — no vuelve
// a aparecer HOY (pero sí mañana si el patrón sigue). Es reflexión, no
// juicio: aceptamos que el usuario ya la vio y siga con su día.

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Brain, X, TrendingUp } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useSelfStore } from '@/stores/useSelfStore'
import { useFinanceStore } from '@/stores/useFinanceStore'
import { detectBehavioralPattern, type BehavioralSuggestion } from '@/engines/behavioral'
import { cn } from '@/lib/utils'

const DISMISS_KEY_PREFIX = 'sir-behavioral-dismissed-'

function todayIsoLima(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface BehavioralSuggestionCardProps {
  now?: Date | null
}

export function BehavioralSuggestionCard({ now }: BehavioralSuggestionCardProps = {}) {
  const selfMetrics = useSelfStore((s) => s.selfMetrics)
  const sleepRecords = useSelfStore((s) => s.sleepRecords)
  const financialMovements = useFinanceStore((s) => s.financialMovements)

  const [dismissedToday, setDismissedToday] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(DISMISS_KEY_PREFIX + todayIsoLima()) === '1'
  })

  const suggestion: BehavioralSuggestion | null = useMemo(() => {
    if (!now) return null
    return detectBehavioralPattern(selfMetrics, sleepRecords, financialMovements, now)
  }, [now, selfMetrics, sleepRecords, financialMovements])

  if (!suggestion || dismissedToday) return null

  function dismiss() {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DISMISS_KEY_PREFIX + todayIsoLima(), '1')
    }
    setDismissedToday(true)
  }

  const priorityChip: Record<BehavioralSuggestion['priority'], string> = {
    critical: 'border-bad/40 bg-bad-soft text-bad',
    high: 'border-warn/40 bg-warn-soft text-warn',
    medium: 'border-border bg-muted text-muted-foreground',
  }
  const priorityLabel: Record<BehavioralSuggestion['priority'], string> = {
    critical: 'PATRÓN',
    high: 'ATENCIÓN',
    medium: 'AVISO',
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mb-6"
    >
      <Card className="shadow-none">
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
            <div className="flex items-center gap-2 flex-shrink-0">
              <Brain size={14} strokeWidth={1.75} className="text-brand" aria-hidden="true" />
              <span className="text-[10px] uppercase tracking-widest text-text-tertiary font-sans">
                Observación conductual
              </span>
              <Badge variant="outline" className={cn('text-[9px] font-mono tracking-widest ml-1', priorityChip[suggestion.priority])}>
                {priorityLabel[suggestion.priority]}
              </Badge>
            </div>
            <button
              type="button"
              onClick={dismiss}
              className="text-muted-foreground/60 hover:text-foreground min-h-6 min-w-6 inline-flex items-center justify-center"
              aria-label="Ocultar por hoy"
            >
              <X size={13} strokeWidth={1.75} />
            </button>
          </div>

          <h2 className="text-base sm:text-lg font-medium tracking-tight leading-tight mb-2">
            {suggestion.title}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            {suggestion.observation}
          </p>

          <div className="flex items-start gap-2 rounded-md border border-brand/25 bg-brand-soft p-3">
            <TrendingUp size={13} strokeWidth={1.75} className="text-brand mt-0.5 flex-shrink-0" aria-hidden="true" />
            <p className="text-sm text-brand-soft-foreground leading-relaxed">
              {suggestion.suggestion}
            </p>
          </div>

          <p className="mt-3 text-[10px] leading-snug text-muted-foreground/60">
            Observación para reflexionar — SIR asiste, no juzga. Descartá si no resuena.
          </p>
        </CardContent>
      </Card>
    </motion.div>
  )
}
