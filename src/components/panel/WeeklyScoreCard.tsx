// SIR V2 — WeeklyScoreCard (P2): score semanal compuesto con tier S/A/B/C/D.
//
// Tres estados:
//   - sin ningún dato      → empty state pedagógico.
//   - status 'calibrating' → hay algo de data pero NO suficiente bienestar para
//     un tier: estado NEUTRO ("calibrando"), nunca D ni número alarmista.
//   - status 'scored'      → tier + score + desglose.
'use client'

import { Gauge } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { SectionTitle } from '@/components/ui/section-title'
import type { WeeklyScore, WeeklyTier, WeeklyComponent } from '@/engines/weekly'
import { cn } from '@/lib/utils'

// S es el tier elite → acento de marca (no semántico). A/B buenos → ok;
// C flojo → warn; D duro → bad.
const TIER_TEXT: Record<WeeklyTier, string> = {
  S: 'text-brand-soft-foreground',
  A: 'text-ok',
  B: 'text-ok',
  C: 'text-warn',
  D: 'text-bad',
}
const TIER_RING: Record<WeeklyTier, string> = {
  S: 'border-brand/40 bg-brand-soft',
  A: 'border-ok/40 bg-ok-soft',
  B: 'border-ok/40 bg-ok-soft',
  C: 'border-warn/40 bg-warn-soft',
  D: 'border-bad/40 bg-bad-soft',
}
const TIER_PHRASE: Record<WeeklyTier, string> = {
  S: 'Semana excepcional.',
  A: 'Muy buena semana.',
  B: 'Semana sólida.',
  C: 'Semana floja — hay margen.',
  D: 'Semana dura. Cuidate.',
}

function barColor(score: number): string {
  if (score >= 64) return 'bg-ok'
  if (score >= 50) return 'bg-warn'
  return 'bg-bad'
}

export function WeeklyScoreCard({ data }: { data: WeeklyScore }) {
  const { status, score, tier, components, daysWithData, windowDays, confident } = data
  const anyData = components.some((c) => c.available)

  return (
    <Card className="shadow-none mb-6">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <SectionTitle icon={Gauge} label="Score semanal" />
          <span className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">últimos {windowDays} días</span>
        </div>

        {!anyData ? (
          <div className="text-center py-6">
            <Gauge size={22} strokeWidth={1.5} className="text-muted-foreground/40 mx-auto mb-2" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Todavía no hay nada que medir esta semana.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Registrá sueño y energía/estrés para empezar a ver tu score.</p>
          </div>
        ) : (
          <div className="mt-1 grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4 sm:gap-6 sm:items-center">
            {/* Hero: tier (scored) o "calibrando" (neutro) */}
            {status === 'scored' ? (
              <div className="flex items-center gap-4">
                <div className={cn('flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-xl border-2 flex-shrink-0', TIER_RING[tier])}>
                  <span className={cn('text-4xl sm:text-5xl font-mono font-bold tabular-nums', TIER_TEXT[tier])}>{tier}</span>
                </div>
                <div>
                  <div className="flex items-baseline gap-1">
                    <span className={cn('text-3xl font-mono font-semibold tabular-nums', TIER_TEXT[tier])}>{Math.round(score)}</span>
                    <span className="text-sm text-muted-foreground/50 font-mono">/100</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{TIER_PHRASE[tier]}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-xl border-2 border-border bg-muted/30 flex-shrink-0">
                  <span className="text-3xl sm:text-4xl font-mono font-bold text-muted-foreground/50">~</span>
                </div>
                <div>
                  <div className="text-base font-semibold text-foreground/90">Calibrando</div>
                  <p className="text-xs text-muted-foreground mt-0.5 max-w-[14rem] leading-snug">
                    Faltan unos días de registro para darte un score. No es una mala semana — es falta de datos.
                  </p>
                </div>
              </div>
            )}

            {/* Componentes */}
            <div className="space-y-2 min-w-0">
              {components.map((c) => <ComponentRow key={c.key} c={c} />)}
            </div>
          </div>
        )}

        {status === 'scored' && !confident && (
          <p className="text-[10px] text-muted-foreground/60 mt-3 pt-3 border-t border-border/40">
            Solo {daysWithData} día{daysWithData === 1 ? '' : 's'} con registro — el score se afina a medida que cargás más.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function ComponentRow({ c }: { c: WeeklyComponent }) {
  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <span className="text-xs text-foreground/80 w-20 sm:w-28 flex-shrink-0 truncate">{c.label}</span>
      <div className="flex-1 min-w-0 h-1.5 rounded-full bg-muted overflow-hidden">
        {c.available && <div className={cn('h-full rounded-full', barColor(c.score))} style={{ width: `${c.score}%` }} />}
      </div>
      <span className={cn('text-[10px] font-mono tabular-nums w-16 sm:w-24 text-right flex-shrink-0 truncate', c.available ? 'text-muted-foreground' : 'text-muted-foreground/40')}>
        {c.available ? c.detail : 'sin datos'}
      </span>
    </div>
  )
}
