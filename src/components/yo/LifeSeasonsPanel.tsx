'use client'
// SIR V2 — "Tus estaciones" (E5, Life Direction). Los CAPÍTULOS de tu vida:
// la vida no avanza pareja, se mueve por rachas temáticas. Este panel segmenta
// el hilo de tus objetivos en estaciones (buildLifeSeasons, determinístico) y
// nombra sobre qué giró cada una. No moraliza: pausar/soltar es parte del
// capítulo, no un fracaso. Honesto e invisible sin data (< 1 racha → nada útil).

import { useMemo } from 'react'
import Link from 'next/link'
import { CalendarRange, ArrowRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { SectionTitle } from '@/components/ui/section-title'
import { useGoalStore } from '@/stores/useGoalStore'
import { useSelfStore } from '@/stores/useSelfStore'
import { useMemoryStore } from '@/stores'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { buildLifeSeasons } from '@/lib/self/lifeSeasons'
import { categoryLabelEs } from '@/lib/self/trajectoryArc'
import { summarizeSeasonSubstrate } from '@/lib/self/seasonSubstrate'
import { computeNarrativeCoherence } from '@/lib/self/narrativeCoherence'

const CURRENT_COLOR = '#6e56cf'
const PAST_COLOR = '#8a8f98'

export function LifeSeasonsPanel() {
  const hydrated = useHasHydrated()
  const goals = useGoalStore((s) => s.goals)
  const selfMetrics = useSelfStore((s) => s.selfMetrics)
  const sleepRecords = useSelfStore((s) => s.sleepRecords)
  const memories = useMemoryStore((s) => s.memories)
  const seasons = useMemo(() => buildLifeSeasons(goals), [goals])
  // Coherencia narrativa: ¿los capítulos forman un hilo, pivotean, o se dispersan?
  const anchorCategory = useMemo(
    () => goals.find((g) => g.isAnchor && g.status === 'active')?.category ?? null,
    [goals],
  )
  const narrative = useMemo(
    () => computeNarrativeCoherence(seasons.seasons, anchorCategory),
    [seasons, anchorCategory],
  )

  // El sustrato vivido (ánimo/energía, sueño, momentos) cruzado con cada capítulo:
  // no solo QUÉ objetivos lo habitaron, sino CÓMO lo viviste. Puro, por ventana.
  const vitalsBySeason = useMemo(() => {
    const substrate = { metrics: selfMetrics, sleep: sleepRecords, memories }
    const map = new Map<string, ReturnType<typeof summarizeSeasonSubstrate>>()
    for (const s of seasons.seasons) {
      map.set(s.id, summarizeSeasonSubstrate(s.startDate, s.endDate, substrate))
    }
    return map
  }, [seasons, selfMetrics, sleepRecords, memories])

  if (!hydrated) return null

  // Invisible sin arco: un solo evento suelto no es un "capítulo" que valga
  // mostrar como sección propia (el hilo de "Tu rumbo" ya lo cubre).
  const hasArc = seasons.seasons.length >= 2 || (seasons.seasons[0]?.goals.length ?? 0) >= 2
  if (!hasArc) return null

  const shown = seasons.seasons.slice(0, 5)

  return (
    <Card style={{ borderColor: `${CURRENT_COLOR}44` }}>
      <CardContent className="p-4 sm:p-6">
        <SectionTitle icon={CalendarRange} label="Tus estaciones" />
        <p className="mt-1 text-[13px] text-muted-foreground">
          Los capítulos de tu vida: cada racha de objetivos se vuelve una estación, con su tema.
        </p>

        <p className="mt-3 text-[14px] leading-relaxed text-foreground/90">{seasons.message}</p>

        <ol className="mt-4 space-y-3 border-t border-border pt-3">
          {shown.map((s) => {
            const color = s.isCurrent ? CURRENT_COLOR : PAST_COLOR
            const cats = s.categories.slice(0, 3).map((c) => categoryLabelEs(c.category))
            const vitals = vitalsBySeason.get(s.id)
            return (
              <li key={s.id} className="flex items-start gap-3">
                <span
                  className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-medium text-foreground/90 break-words">{s.label}</span>
                    {s.isCurrent && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                        style={{ backgroundColor: `${CURRENT_COLOR}22`, color: CURRENT_COLOR }}
                      >
                        En curso
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[11px] font-mono tabular-nums text-text-tertiary">
                    {s.startDate === s.endDate ? s.startDate : `${s.startDate} → ${s.endDate}`}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                    {cats.length > 0 && <span className="capitalize">{cats.join(' · ')}</span>}
                    <span>
                      {s.set} propuesto(s){s.done > 0 ? ` · ${s.done} cerrado(s)` : ''}
                      {s.letGo > 0 ? ` · ${s.letGo} soltado(s)` : ''}
                      {s.paused > 0 ? ` · ${s.paused} pausado(s)` : ''}
                    </span>
                  </div>
                  {/* Cómo VIVISTE el capítulo: el sustrato (sueño/ánimo/energía y
                      el momento que más pesó) cruzado con la ventana. Solo si hubo data. */}
                  {vitals?.hasSubstrate && (
                    <div className="mt-1 space-y-0.5 leading-snug text-text-tertiary">
                      {vitals.line && <div className="text-[11px] italic">{vitals.line}</div>}
                      {vitals.topMoment && (
                        <div className="text-[11px]">
                          lo que más pesó: <span className="text-foreground/80">“{vitals.topMoment}”</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ol>

        {/* El arco: coherencia narrativa ENTRE capítulos (hilo / transición /
            fragmentación). Sin moralizar. Invisible con < 2 capítulos. */}
        {narrative.state !== 'insufficient' && (
          <div className="mt-4 border-t border-border pt-3">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">El arco de tu historia</span>
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{ backgroundColor: `${CURRENT_COLOR}18`, color: CURRENT_COLOR }}
              >
                {narrative.state === 'continuous' ? 'hilo continuo' : narrative.state === 'transitioning' ? 'en transición' : 'exploración'}
              </span>
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-foreground/85">{narrative.message}</p>
          </div>
        )}

        <Link
          href="/objetivos"
          className="mt-4 inline-flex items-center gap-1 text-[13px] text-brand hover:underline"
        >
          Ver tus objetivos <ArrowRight size={13} />
        </Link>
      </CardContent>
    </Card>
  )
}
