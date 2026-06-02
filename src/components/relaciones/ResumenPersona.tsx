'use client'
// SIR V2 — ResumenPersona: la FRANJA de síntesis al tope de la ficha.
//
// Devuelve la capa de "vistazo" que tenía SIR V1: lo primero que se ve al
// abrir una persona, debajo del nombre. Cruza ciclo + próxima fecha de la red
// + última interacción + score del vínculo + UNA línea de próxima acción
// accionable — todo SINTETIZADO por buildPersonSummary (lib pura), sin
// re-implementar lógica de fecha/score/recomendación.
//
// MOUNT-SAFE (fix #418): el resumen depende de "ahora" (ciclo, countdowns,
// tiempo relativo, score con recencia). Igual que el resto de paneles
// now-dependientes de la ficha, renderiza un placeholder determinístico en
// server + primer render cliente, y el contenido real tras montar.
//
// DISCIPLINA DE COLOR: el acento de marca es para FOCO (la línea de próxima
// acción "al día"); los semánticos (warn/bad) sólo cuando hay URGENCIA real
// (fecha inminente, vínculo frío).

import { Moon, Cake, CalendarHeart, MessageCircle, Activity, ArrowRight } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { useMounted } from '@/hooks/useMounted'
import { cn } from '@/lib/utils'
import { buildPersonSummary, type NextActionUrgency } from '@/lib/people/personSummary'
import type { Person } from '@/types'

export interface ResumenPersonaProps {
  person: Person
  /** observed_at ISO del último whatsapp_chat curado (conversación real). */
  lastChatObservedAt: string | null
  /** logged_at ISO del último person_log kind='interaction'. */
  lastManualInteractionAt: string | null
}

export function ResumenPersona({
  person,
  lastChatObservedAt,
  lastManualInteractionAt,
}: ResumenPersonaProps) {
  const mounted = useMounted()

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-5">
        {mounted ? (
          <SummaryBody
            person={person}
            lastChatObservedAt={lastChatObservedAt}
            lastManualInteractionAt={lastManualInteractionAt}
          />
        ) : (
          <Placeholder />
        )}
      </CardContent>
    </Card>
  )
}

function SummaryBody({ person, lastChatObservedAt, lastManualInteractionAt }: ResumenPersonaProps) {
  const s = buildPersonSummary({ person, lastChatObservedAt, lastManualInteractionAt }, new Date())

  return (
    <div className="space-y-4">
      {/* Stats de un vistazo */}
      <div className="flex flex-wrap items-stretch gap-x-5 gap-y-3">
        {/* Score del vínculo */}
        <Stat Icon={Activity} label="Vínculo">
          <span className="text-base font-semibold tabular-nums" style={{ color: s.score.band.soft }}>
            {s.score.global}
          </span>
          <span className="text-text-tertiary text-[11px]">/100</span>
          <span className="text-[11px] text-muted-foreground ml-1">· {s.score.band.label}</span>
        </Stat>

        {/* Última interacción */}
        <Stat Icon={MessageCircle} label="Última interacción">
          {s.lastInteraction ? (
            <span className="text-sm text-foreground">{s.lastInteraction.relative}</span>
          ) : (
            <span className="text-sm text-muted-foreground italic">sin registro</span>
          )}
        </Stat>

        {/* Próxima fecha de la red */}
        {s.nextDate && (
          <Stat Icon={s.nextDate.kind === 'birthday' ? Cake : CalendarHeart} label={s.nextDate.label}>
            <span className="text-sm text-foreground">
              {s.nextDate.daysUntil === 0
                ? '¡hoy!'
                : s.nextDate.daysUntil === 1
                  ? 'mañana'
                  : `en ${s.nextDate.daysUntil} días`}
            </span>
          </Stat>
        )}

        {/* Ciclo (si lo trackea) */}
        {s.cycle && (
          <Stat Icon={Moon} label="Ciclo">
            <span className="text-sm text-foreground">{s.cycle.label}</span>
            <span className="text-[11px] text-muted-foreground ml-1">· día {s.cycle.cycleDay}</span>
            {s.cycle.daysUntilNextPeriod <= 7 && (
              <span className={cn('text-[11px] ml-1', s.cycle.periodSoon ? 'text-warn' : 'text-muted-foreground')}>
                · período en {s.cycle.daysUntilNextPeriod}d
              </span>
            )}
          </Stat>
        )}
      </div>

      {/* Próxima acción accionable */}
      {s.nextAction && <NextActionLine text={s.nextAction.text} urgency={s.nextAction.urgency} />}
    </div>
  )
}

function Stat({
  Icon,
  label,
  children,
}: {
  Icon: typeof Activity
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={12} strokeWidth={1.75} className="text-text-tertiary" aria-hidden="true" />
        <span className="text-[10px] uppercase tracking-[0.06em] text-text-tertiary truncate">{label}</span>
      </div>
      <div className="flex items-baseline gap-0.5 flex-wrap leading-tight">{children}</div>
    </div>
  )
}

/** Línea de próxima acción. Acento de marca cuando es "al día" (foco);
 *  semántico (warn/bad) sólo ante urgencia real. */
function NextActionLine({ text, urgency }: { text: string; urgency: NextActionUrgency }) {
  const styles: Record<NextActionUrgency, string> = {
    info: 'border-brand/30 bg-brand-soft text-brand-soft-foreground',
    soon: 'border-warn/30 bg-warn-soft text-warn-foreground',
    now: 'border-bad/30 bg-bad-soft text-bad-foreground',
  }
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium',
        styles[urgency],
      )}
    >
      <ArrowRight size={14} strokeWidth={2} className="shrink-0" aria-hidden="true" />
      <span>{text}</span>
    </div>
  )
}

/** Placeholder determinístico (server + primer render cliente). */
function Placeholder() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="flex flex-wrap gap-x-5 gap-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-2.5 w-20 rounded bg-secondary animate-pulse" />
            <div className="h-4 w-16 rounded bg-secondary animate-pulse" />
          </div>
        ))}
      </div>
      <div className="h-9 w-full rounded-md bg-secondary animate-pulse" />
    </div>
  )
}
