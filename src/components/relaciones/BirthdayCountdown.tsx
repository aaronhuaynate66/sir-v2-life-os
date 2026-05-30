// SIR V2 — BirthdayCountdown (port adaptado de SIR V1).
//
// Countdown al proximo cumpleanos desde people.birth_date (canonical en
// migration 0010). V1 mostraba "Cumpleanos en N dias".
//
// special_dates (otro canonical jsonb de migration 0010) NO se consume
// aca — queda para un componente futuro "Fechas importantes" (item #9
// del backlog detail page).
//
// Edge cases:
//   - birth_date null            -> empty state con CTA a editar la persona.
//   - hoy es el cumple           -> "Hoy cumple X años".
//   - cumple ya paso este año    -> contar al del proximo año.
//   - feb 29 + año no bisiesto   -> ajustar al 28-feb (sin romper).

import Link from 'next/link'
import { Cake } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'

export interface BirthdayCountdownProps {
  /** people.birth_date — ISO YYYY-MM-DD o YYYY-MM-DDT... null si no
   *  esta seteado. */
  birthDate: string | null | undefined
  /** Slug de la persona para el link del empty state. */
  personSlug: string | null | undefined
}

interface NextBirthday {
  /** Fecha (local) del proximo cumpleanos. */
  date: Date
  /** Edad que cumplira (0 si la fecha de nacimiento es invalida). */
  ageTurning: number
  /** Dias enteros hasta ese cumpleanos. 0 = hoy. */
  daysUntil: number
}

const DAY_MS = 86_400_000

function computeNextBirthday(birthDate: string): NextBirthday | null {
  // Parsea como fecha local (YYYY-MM-DD interpretado en TZ local). Tomamos
  // el prefijo YYYY-MM-DD por si viene un timestamptz completo.
  const m = birthDate.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2]) - 1
  const day = Number(m[3])
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
  if (year < 1900 || month < 0 || month > 11 || day < 1 || day > 31) return null

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  // Construir candidato este año. Si feb-29 en año no bisiesto, JS rueda
  // al 1-mar; lo detectamos y caemos a 28-feb.
  const buildCandidate = (y: number): Date => {
    const candidate = new Date(y, month, day)
    if (candidate.getMonth() !== month) {
      // Mes desbordo (feb-29 → mar-01). Ajustar a ultimo dia del mes target.
      return new Date(y, month + 1, 0)
    }
    return candidate
  }

  let next = buildCandidate(todayStart.getFullYear())
  if (next.getTime() < todayStart.getTime()) {
    next = buildCandidate(todayStart.getFullYear() + 1)
  }

  const daysUntil = Math.round((next.getTime() - todayStart.getTime()) / DAY_MS)
  const ageTurning = next.getFullYear() - year

  return { date: next, ageTurning, daysUntil }
}

const ABS_FORMATTER = new Intl.DateTimeFormat('es', {
  day: '2-digit',
  month: 'long',
})

export function BirthdayCountdown({ birthDate, personSlug }: BirthdayCountdownProps) {
  return (
    <Card className="shadow-none">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <Cake size={14} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
            Cumpleaños
          </div>
        </div>

        {birthDate ? <Body birthDate={birthDate} /> : <EmptyState personSlug={personSlug} />}
      </CardContent>
    </Card>
  )
}

function Body({ birthDate }: { birthDate: string }) {
  const next = computeNextBirthday(birthDate)
  if (!next) {
    return (
      <p className="text-sm text-muted-foreground italic">
        Fecha de nacimiento con formato inválido. Editala desde la persona.
      </p>
    )
  }

  const { daysUntil, ageTurning, date } = next

  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2 flex-wrap">
        {daysUntil === 0 ? (
          <>
            <span className="text-2xl font-semibold tracking-tight">¡Hoy!</span>
            <span className="text-sm text-muted-foreground">
              Cumple {ageTurning} año{ageTurning === 1 ? '' : 's'}
            </span>
          </>
        ) : (
          <>
            <span className="text-2xl font-semibold tracking-tight tabular-nums">
              en {daysUntil}
            </span>
            <span className="text-sm text-muted-foreground">
              día{daysUntil === 1 ? '' : 's'}
            </span>
          </>
        )}
      </div>
      <div className="text-[11px] text-muted-foreground border-t border-border/40 pt-3">
        Próximo cumple:{' '}
        <span className="text-foreground font-medium">
          {ABS_FORMATTER.format(date)}
        </span>{' '}
        · cumple {ageTurning} año{ageTurning === 1 ? '' : 's'}
      </div>
    </div>
  )
}

function EmptyState({ personSlug }: { personSlug: string | null | undefined }) {
  return (
    <div className="text-sm text-muted-foreground space-y-1.5">
      <p>Sin fecha de nacimiento.</p>
      <p className="text-xs leading-relaxed">
        Agregala desde el form en{' '}
        <Link
          href={personSlug ? `/relaciones#person-${personSlug}` : '/relaciones'}
          className="underline underline-offset-2 hover:text-foreground"
        >
          /relaciones
        </Link>
        , editando la persona — input <span className="font-mono text-foreground/80">Fecha de nacimiento</span>.
      </p>
    </div>
  )
}
