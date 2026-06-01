// SIR V2 — WeeklyScoreCard (P2): score semanal compuesto con tier S/A/B/C/D.
'use client'

import { Gauge } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { SectionTitle } from '@/components/ui/section-title'
import type { WeeklyScore, WeeklyTier } from '@/engines/weekly'
import { cn } from '@/lib/utils'

const TIER_TEXT: Record<WeeklyTier, string> = {
  S: 'text-amber-300',
  A: 'text-emerald-400',
  B: 'text-sky-400',
  C: 'text-amber-400',
  D: 'text-red-400',
}
const TIER_RING: Record<WeeklyTier, string> = {
  S: 'border-amber-300/40 bg-amber-300/10',
  A: 'border-emerald-400/40 bg-emerald-400/10',
  B: 'border-sky-400/40 bg-sky-400/10',
  C: 'border-amber-400/40 bg-amber-400/10',
  D: 'border-red-400/40 bg-red-400/10',
}
const TIER_PHRASE: Record<WeeklyTier, string> = {
  S: 'Semana excepcional.',
  A: 'Muy buena semana.',
  B: 'Semana sólida.',
  C: 'Semana floja — hay margen.',
  D: 'Semana dura. Cuidate.',
}

function barColor(score: number): string {
  if (score >= 78) return 'bg-emerald-400'
  if (score >= 64) return 'bg-sky-400'
  if (score >= 50) return 'bg-amber-400'
  return 'bg-red-400'
}

export function WeeklyScoreCard({ data }: { data: WeeklyScore }) {
  const { score, tier, components, daysWithData, windowDays, confident } = data
  const anyData = components.some((c) => c.available)

  return (
    <Card className="shadow-none mb-6">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <SectionTitle icon={Gauge} label="Score semanal" />
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground/50">últimos {windowDays} días</span>
        </div>

        {!anyData ? (
          <div className="text-center py-6">
            <Gauge size={22} strokeWidth={1.5} className="text-muted-foreground/40 mx-auto mb-2" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Sin datos esta semana.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Registrá sueño, energía/estrés y movimientos para ver tu score.</p>
          </div>
        ) : (
          <div className="mt-1 grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4 sm:gap-6 items-center">
            {/* Tier + score */}
            <div className="flex items-center gap-4">
              <div className={cn('flex items-center justify-center w-20 h-20 rounded-xl border-2', TIER_RING[tier])}>
                <span className={cn('text-5xl font-mono font-bold tabular-nums', TIER_TEXT[tier])}>{tier}</span>
              </div>
              <div>
                <div className="flex items-baseline gap-1">
                  <span className={cn('text-3xl font-mono font-semibold tabular-nums', TIER_TEXT[tier])}>{Math.round(score)}</span>
                  <span className="text-sm text-muted-foreground/50 font-mono">/100</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{TIER_PHRASE[tier]}</p>
              </div>
            </div>

            {/* Componentes */}
            <div className="space-y-2 min-w-0">
              {components.map((c) => (
                <div key={c.key} className="flex items-center gap-3">
                  <span className="text-xs text-foreground/80 w-28 flex-shrink-0 truncate">{c.label}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    {c.available && <div className={cn('h-full rounded-full', barColor(c.score))} style={{ width: `${c.score}%` }} />}
                  </div>
                  <span className={cn('text-[10px] font-mono tabular-nums w-28 text-right flex-shrink-0', c.available ? 'text-muted-foreground' : 'text-muted-foreground/40')}>
                    {c.available ? c.detail : 'sin datos'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {anyData && !confident && (
          <p className="text-[10px] text-muted-foreground/60 mt-3 pt-3 border-t border-border/40">
            Solo {daysWithData} día{daysWithData === 1 ? '' : 's'} con registro esta semana — el score se afina a medida que cargás más.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
