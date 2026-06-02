// SIR V2 — BirthdayCountdown (port adaptado de SIR V1).
//
// Countdown al proximo cumpleanos desde people.birth_date (canonical en
// migration 0010). V1 mostraba "Cumpleanos en N dias".
//
// EDICIÓN INLINE (quick-win UX): si no hay fecha, un botón "+ Agregar
// cumpleaños" abre un date input acá mismo (sin ir al form de edición). Si ya
// hay fecha, un botón "Editar" permite corregirla. Persiste en person.birthDate
// vía updatePerson() del store (mismo patrón que FechasImportantes) → el sync
// engine lo upsertea a Supabase como cualquier campo. No hay migración: el
// campo birthDate (people.birth_date) ya existe.
//
// special_dates (otro canonical jsonb de migration 0010) NO se consume aca —
// lo consume FechasImportantes ("Fechas importantes", item #9 del backlog).
//
// Edge cases:
//   - birth_date null            -> empty state con "+ Agregar cumpleaños".
//   - hoy es el cumple           -> "Hoy cumple X años".
//   - cumple ya paso este año    -> contar al del proximo año.
//   - feb 29 + año no bisiesto   -> ajustar al 28-feb (sin romper).

'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Cake, Pencil } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRelationshipStore } from '@/stores'
import { parseLocalDate } from '@/lib/dates/parseLocalDate'
import { useMounted } from '@/hooks/useMounted'
import type { Person } from '@/types'

export interface BirthdayCountdownProps {
  person: Person
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
  // Parsea como fecha LOCAL (helper compartido — evita el shift UTC que
  // corre el día en Lima). Tolera un timestamptz completo tomando el
  // prefijo YYYY-MM-DD. parseLocalDate ya valida rangos por round-trip.
  const birth = parseLocalDate(birthDate)
  if (!birth) return null
  const year = birth.getFullYear()
  const month = birth.getMonth()
  const day = birth.getDate()
  if (year < 1900) return null

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

export function BirthdayCountdown({ person }: BirthdayCountdownProps) {
  const updatePerson = useRelationshipStore((s) => s.updatePerson)
  // El countdown depende de "hoy" → se computa solo tras montar (mount-safe).
  const mounted = useMounted()

  const birthDate = person.birthDate ?? null
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  function openEdit() {
    setDraft(birthDate ? birthDate.slice(0, 10) : '')
    setEditing(true)
  }

  function cancel() {
    setEditing(false)
    setDraft('')
  }

  function save() {
    if (!parseLocalDate(draft)) {
      toast.error('Fecha inválida', { description: 'Elegí una fecha de nacimiento válida.' })
      return
    }
    updatePerson(person.id, { birthDate: draft, updatedAt: new Date().toISOString() })
    toast.success('Cumpleaños guardado', { description: person.name })
    setEditing(false)
    setDraft('')
  }

  return (
    <Card className="shadow-none">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Cake size={14} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
            <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">
              Cumpleaños
            </div>
          </div>
          {birthDate && !editing && (
            <Button size="sm" variant="ghost" onClick={openEdit}>
              <Pencil size={13} strokeWidth={1.75} className="mr-1" aria-hidden="true" />
              Editar
            </Button>
          )}
        </div>

        {editing ? (
          <EditForm draft={draft} setDraft={setDraft} onSave={save} onCancel={cancel} hasPrevious={!!birthDate} />
        ) : birthDate ? (
          mounted ? <Body birthDate={birthDate} /> : <Placeholder />
        ) : (
          <EmptyState onAdd={openEdit} />
        )}
      </CardContent>
    </Card>
  )
}

function EditForm({
  draft,
  setDraft,
  onSave,
  onCancel,
  hasPrevious,
}: {
  draft: string
  setDraft: (v: string) => void
  onSave: () => void
  onCancel: () => void
  hasPrevious: boolean
}) {
  return (
    <div className="space-y-3 rounded-md border border-border/60 p-3">
      <div>
        <Label htmlFor="birth-date" className="text-xs">
          Fecha de nacimiento
        </Label>
        <Input
          id="birth-date"
          type="date"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="mt-1 font-mono"
          autoFocus
        />
      </div>
      <div className="flex gap-2 justify-end">
        {hasPrevious && (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button size="sm" onClick={onSave} disabled={!draft}>
          Guardar
        </Button>
      </div>
    </div>
  )
}

/** Placeholder determinístico (server + primer render cliente) mientras se
 *  difiere el cómputo del countdown. */
function Placeholder() {
  return (
    <div className="space-y-2" aria-hidden="true">
      <div className="h-7 w-24 rounded bg-muted/40 animate-pulse" />
      <div className="h-3 w-40 rounded bg-muted/30 animate-pulse mt-3" />
    </div>
  )
}

function Body({ birthDate }: { birthDate: string }) {
  const next = computeNextBirthday(birthDate)
  if (!next) {
    return (
      <p className="text-sm text-muted-foreground italic">
        Fecha de nacimiento con formato inválido. Editala arriba.
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

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Sin fecha de nacimiento.</p>
      <Button size="sm" variant="outline" onClick={onAdd} className="w-full">
        <Cake size={13} strokeWidth={1.75} className="mr-1.5" aria-hidden="true" />
        + Agregar cumpleaños
      </Button>
    </div>
  )
}
