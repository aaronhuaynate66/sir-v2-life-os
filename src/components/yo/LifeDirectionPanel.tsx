'use client'

// SIR V2 — "Tu rumbo" (E5, Life Direction System): el hilo de dirección de vida.
//
// La SÍNTESIS que faltaba: un solo hilo pasado → presente → futuro que ensambla
// los motores E5 (trayectoria, estaciones, coherencia, norte) vía buildLifeDirection.
// De dónde venís (capítulos cerrados), dónde estás (capítulo actual + si tu foco
// acompaña lo declarado) y hacia dónde vas (el norte + una proyección honesta,
// anti-culpa). Los HITOS detallados + la reflexión IA viven abajo, en "Tus hitos".

import { useMemo } from 'react'
import { Route, History, MapPin, Flag } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { useGoalStore } from '@/stores/useGoalStore'
import { useObjectiveStepStore } from '@/stores/useObjectiveStepStore'
import { useMemoryStore } from '@/stores'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { buildTrajectoryArc } from '@/lib/self/trajectoryArc'
import { buildLifeSeasons } from '@/lib/self/lifeSeasons'
import { buildLifeThread, memoryMilestones, mergeLifeThread } from '@/lib/self/lifeThread'
import { computeLifeCoherence } from '@/lib/self/coherence'
import { buildYearCompass } from '@/lib/year-compass/build'
import { buildLifeDirection, type DirectionOutlook } from '@/lib/self/lifeDirection'

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
function fmtYear(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${MES[d.getMonth()]} ${d.getFullYear()}`
}

// Color semántico del veredicto de futuro. Reusa los tokens canónicos.
const OUTLOOK: Record<DirectionOutlook, { label: string; color: string }> = {
  on_track: { label: 'En tu línea', color: 'hsl(var(--success))' },
  at_risk: { label: 'Pide reenganche', color: 'hsl(var(--warn))' },
  steady_no_anchor: { label: 'Falta el norte', color: 'hsl(var(--brand))' },
  insufficient: { label: 'Se afina', color: 'hsl(var(--text-tertiary))' },
}

export function LifeDirectionPanel() {
  const hydrated = useHasHydrated()
  const goals = useGoalStore((s) => s.goals)
  const steps = useObjectiveStepStore((s) => s.steps)
  const memories = useMemoryStore((s) => s.memories)

  const direction = useMemo(() => {
    const now = new Date()
    const arc = buildTrajectoryArc(goals, now)
    const seasons = buildLifeSeasons(goals, now)
    const thread = mergeLifeThread(buildLifeThread(goals, now), memoryMilestones(memories))
    const coherence = computeLifeCoherence(goals, steps, now)
    const compass = buildYearCompass(goals, now)
    return buildLifeDirection({ arc, seasons, thread, coherence, compass })
  }, [goals, steps, memories])

  if (!hydrated) return null

  if (!direction.hasThread) {
    return (
      <Card className="shadow-none">
        <CardContent className="p-4 sm:p-5">
          <Header />
          <p className="text-sm text-muted-foreground py-1 leading-relaxed">
            Tu rumbo se dibuja con tus objetivos. Cuando te propongas metas y las vayas cerrando o
            soltando, acá vas a ver de dónde vienes, dónde estás y hacia dónde vas —en un solo hilo. 🧭
          </p>
        </CardContent>
      </Card>
    )
  }

  const { past, present, future } = direction
  const out = OUTLOOK[future.outlook]
  const since = fmtYear(past.firstMilestoneDate)

  return (
    <Card className="shadow-none">
      <CardContent className="p-4 sm:p-5">
        <Header />

        {/* La frase-hilo: pasado → presente → futuro en una línea. */}
        <p className="text-sm text-foreground/90 leading-relaxed mb-4">{direction.message}</p>

        <div className="grid gap-3 sm:grid-cols-3">
          {/* PASADO */}
          <Segment icon={History} label="De dónde vienes">
            {past.previousSeasonLabel ? (
              <span className="text-foreground">{past.previousSeasonLabel}</span>
            ) : (
              <span className="text-muted-foreground">Tu primer capítulo</span>
            )}
            <Meta>
              {past.closedSeasons > 0
                ? `${past.closedSeasons} ${past.closedSeasons === 1 ? 'capítulo cerrado' : 'capítulos cerrados'}`
                : 'Sin capítulos cerrados aún'}
              {since ? ` · desde ${since}` : ''}
            </Meta>
          </Segment>

          {/* PRESENTE */}
          <Segment icon={MapPin} label="Dónde estás">
            {present.currentSeasonLabel ? (
              <span className="text-foreground">{present.currentSeasonLabel}</span>
            ) : (
              <span className="text-muted-foreground">Pausa entre capítulos</span>
            )}
            <Meta>{present.currentSeasonSummary ?? patternLabel(present.pattern)}</Meta>
          </Segment>

          {/* FUTURO */}
          <Segment icon={Flag} label="Hacia dónde vas">
            {future.anchorTitle ? (
              <span className="text-foreground">{future.anchorTitle}</span>
            ) : (
              <span className="text-muted-foreground">Sin norte declarado</span>
            )}
            <div className="mt-1 inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ background: out.color }} aria-hidden="true" />
              <span className="text-[11px] font-medium" style={{ color: out.color }}>{out.label}</span>
              {future.daysUntil != null && future.daysUntil >= 0 && (
                <span className="text-[10px] text-text-tertiary font-mono tabular-nums">en {future.daysUntil}d</span>
              )}
            </div>
          </Segment>
        </div>

        {/* Racional honesto del veredicto de futuro. */}
        <p className="text-xs text-muted-foreground leading-relaxed mt-4 pt-3 border-t border-border">
          {future.rationale}
        </p>
      </CardContent>
    </Card>
  )
}

function Header() {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Route size={16} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
      <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Tu rumbo</div>
      <span className="text-[11px] text-text-tertiary/70">· de dónde vienes, dónde estás, hacia dónde vas</span>
    </div>
  )
}

function Segment({ icon: Icon, label, children }: { icon: typeof History; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-secondary/40 p-3">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon size={12} strokeWidth={1.75} className="text-text-tertiary" aria-hidden="true" />
        <span className="text-[10px] uppercase tracking-[0.06em] text-text-tertiary">{label}</span>
      </div>
      <div className="text-sm font-medium leading-snug">{children}</div>
    </div>
  )
}

function Meta({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] text-text-tertiary mt-1 leading-snug line-clamp-2">{children}</div>
}

function patternLabel(p: string): string {
  switch (p) {
    case 'building': return 'Cierras más de lo que sueltas'
    case 'releasing': return 'Sueltas más de lo que cierras'
    case 'steady': return 'Equilibrio entre cerrar y soltar'
    case 'exploring': return 'Muchos frentes abiertos'
    default: return 'Todavía sin arco para leer'
  }
}
