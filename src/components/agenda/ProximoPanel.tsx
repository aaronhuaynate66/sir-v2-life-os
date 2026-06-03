// SIR V2 — ProximoPanel (Feature 1: Agenda "Próximo").
//
// Vista accionable que AGREGA data que ya existe en los stores y hoy queda
// enterrada: señales críticas sin resolver, "no contactás a X hace N días"
// (con la familia/pareja ponderadas más por person_links), objetivos con target
// date cercana, cumpleaños y fechas especiales de TODA la red, TUS propias
// fechas (identity_profile) y las fechas de tu RUBRO (calendario comercial,
// Mundial WFG26). Anticipación explícita (actionHint). Determinístico
// (buildAgenda), cero LLM.
//
// Mount-safe: el orden depende de "hoy" → diferimos el cómputo a post-mount
// (igual que CicloPanel / /panel) para no romper hidratación.
//
// Render compacto (en /panel, con `limit` + link "ver todo") o completo
// (en /agenda). Empty state pedagógico cuando no hay nada próximo.

'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  AlertCircle,
  CalendarClock,
  Cake,
  CalendarHeart,
  ListChecks,
  Target,
  UserX,
  ChevronRight,
  UserCircle,
  Briefcase,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { SectionTitle } from '@/components/ui/section-title'
import { useRelationshipStore } from '@/stores/useRelationshipStore'
import { useGoalStore } from '@/stores/useGoalStore'
import { useObjectiveStepStore } from '@/stores/useObjectiveStepStore'
import { useSignalStore } from '@/stores/useSignalStore'
import { useSelfStore } from '@/stores/useSelfStore'
import { isIdentityEmpty } from '@/lib/identity'
import { buildAgenda, type AgendaItem, type AgendaKind } from '@/lib/agenda/build'
import { cn } from '@/lib/utils'

const KIND_ICON: Record<AgendaKind, LucideIcon> = {
  critical_signal: AlertCircle,
  no_contact: UserX,
  goal_target: Target,
  objective_step: ListChecks,
  birthday: Cake,
  special_date: CalendarHeart,
  self_special_date: UserCircle,
  role_date: Briefcase,
}

const KIND_ACCENT: Record<AgendaKind, string> = {
  critical_signal: 'text-bad',
  no_contact: 'text-warn',
  goal_target: 'text-brand-soft-foreground',
  objective_step: 'text-ok',
  birthday: 'text-brand-soft-foreground',
  special_date: 'text-brand-soft-foreground',
  self_special_date: 'text-brand-soft-foreground',
  role_date: 'text-ok',
}

export interface ProximoPanelProps {
  /** Máximo de items a mostrar. undefined = todos (vista /agenda). */
  limit?: number
  /** Mostrar link "ver agenda completa" (solo tiene sentido si hay limit). */
  showViewAll?: boolean
  /** Override del título del header. */
  title?: string
  /** Omitir los nudges de relaciones descuidadas (no_contact). Se usa en /agenda,
   *  donde "Hoy con tu gente" (DailyActionsPanel) ya cubre las relaciones — así
   *  no duplicamos. /panel lo deja en false (ahí no hay DailyActions). */
  excludeNoContact?: boolean
}

export function ProximoPanel({
  limit,
  showViewAll = false,
  title = 'Próximo',
  excludeNoContact = false,
}: ProximoPanelProps) {
  const people = useRelationshipStore((s) => s.people)
  const personLinks = useRelationshipStore((s) => s.personLinks)
  const goals = useGoalStore((s) => s.goals)
  const objectiveSteps = useObjectiveStepStore((s) => s.steps)
  const signals = useSignalStore((s) => s.signals)
  const identityProfile = useSelfStore((s) => s.identityProfile)

  // Mount-safe: buildAgenda depende de Date.now() (orden por cercanía).
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
  }, [])

  const items =
    now != null
      ? buildAgenda(
          { people, goals, objectiveSteps, signals, identityProfile, personLinks },
          { limit, excludeNoContact },
          now,
        )
      : null

  return (
    <Card className="shadow-none mb-6">
      <CardContent className="p-4 sm:p-6">
        <SectionTitle
          icon={CalendarClock}
          label={title}
          count={items?.length ?? undefined}
        />

        {/* Degradación con gracia: si el perfil propio está vacío, el motor no
            puede mirar tus fechas ni tu rubro. Decimos qué falta y para qué. */}
        {items != null && isIdentityEmpty(identityProfile) && (
          <IdentityHint />
        )}

        {items == null ? (
          <Placeholder />
        ) : items.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="space-y-1.5" aria-label="Recordatorios próximos">
            {items.map((item) => (
              <AgendaRow key={item.id} item={item} />
            ))}
          </ul>
        )}

        {showViewAll && items != null && items.length > 0 && (
          <div className="mt-4 pt-3 border-t border-border/40">
            <Link
              href="/agenda"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Ver agenda completa
              <ChevronRight size={12} strokeWidth={2} aria-hidden="true" />
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function AgendaRow({ item }: { item: AgendaItem }) {
  const Icon = KIND_ICON[item.kind]
  const accent = KIND_ACCENT[item.kind]

  return (
    <li>
      <Link
        href={item.href}
        className="flex items-center gap-3 rounded-md px-2 py-2 -mx-2 hover:bg-accent/10 transition-colors group"
      >
        <Icon
          size={15}
          strokeWidth={1.75}
          className={cn('shrink-0', accent)}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm text-foreground truncate">{item.title}</div>
          <div className="text-[11px] text-muted-foreground">{item.detail}</div>
          {item.actionHint && (
            <div className="mt-0.5 text-[11px] text-brand-soft-foreground/90 leading-snug">
              {item.actionHint}
            </div>
          )}
        </div>
        <ChevronRight
          size={14}
          strokeWidth={2}
          className="shrink-0 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors"
          aria-hidden="true"
        />
      </Link>
    </li>
  )
}

/** Nudge cuando el perfil propio está vacío: el motor proactivo no puede mirar
 *  tus propias fechas ni vigilar las fechas de tu rubro sin esos datos. */
function IdentityHint() {
  return (
    <Link
      href="/yo"
      className="mb-3 flex items-start gap-2 rounded-md border border-brand/25 bg-brand-soft px-2.5 py-2 text-[11px] text-brand-soft-foreground hover:bg-brand/15 transition-colors"
    >
      <UserCircle size={13} strokeWidth={1.75} className="mt-[1px] shrink-0" aria-hidden="true" />
      <span>
        Completá tu identidad en <span className="underline underline-offset-2">/yo</span> —
        con tu fecha de nacimiento y tu rol activamos recordatorios de tus
        propias fechas y del calendario de tu rubro (comercial, mundial…).
      </span>
    </Link>
  )
}

/** Placeholder determinístico mientras se difiere el cómputo (pre-mount). */
function Placeholder() {
  return (
    <div className="space-y-2" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3 px-2 py-2">
          <div className="w-4 h-4 rounded bg-muted/40 animate-pulse shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 w-2/3 rounded bg-muted/40 animate-pulse" />
            <div className="h-2.5 w-1/4 rounded bg-muted/30 animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="text-sm text-muted-foreground space-y-2 py-2">
      <p className="text-foreground/80">Nada urgente en el horizonte. 🌤️</p>
      <p className="text-xs leading-relaxed">
        Esta vista agrega lo accionable de tu red: cumpleaños y fechas
        especiales próximas, objetivos por vencer, señales sin resolver y
        contactos que hace tiempo no tocás. Va a poblarse sola a medida que
        registres{' '}
        <Link href="/relaciones" className="underline underline-offset-2 hover:text-foreground">
          fechas de tus personas
        </Link>{' '}
        y{' '}
        <Link href="/objetivos" className="underline underline-offset-2 hover:text-foreground">
          objetivos con fecha
        </Link>
        .
      </p>
    </div>
  )
}
