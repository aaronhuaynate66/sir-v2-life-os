'use client'
// SIR V2 — FechasImportantes (#9 + #13 del detail page V1).
//
// Lista las fechas importantes de una persona (aniversarios, santos,
// fechas especiales) con countdown — paridad V1 ("14 de junio · en 16
// días"). Añadibles/eliminables inline (item #13): el usuario crea sus
// propias fechas sin depender de capturas.
//
// Storage: canonical en `people.special_dates` (jsonb, migration 0010).
// Se persiste vía updatePerson() del store (sync engine lo upsertea a
// Supabase como cualquier otro campo de la persona). No hay endpoint ni
// tabla separada — es un campo más de la fila people.
//
// Patrón visual: Card + shadow-none + uppercase tracking-widest, igual
// que BirthdayCountdown / CicloPanel / RegistroRapidoPanel.

import { useState } from 'react'
import { toast } from 'sonner'
import { CalendarHeart, Plus, X, Repeat, AlertCircle } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRelationshipStore } from '@/stores'
import { parseLocalDate } from '@/lib/dates/parseLocalDate'
import { useMounted } from '@/hooks/useMounted'
import {
  sortSpecialDates,
  formatSpecialDate,
  formatCountdownPhrase,
  inferAnnualRecurrence,
  type SpecialDateCountdown,
} from '@/lib/dates/specialDates'
import { cn } from '@/lib/utils'
import type { Person, SpecialDate } from '@/types'

export interface FechasImportantesProps {
  person: Person
}

export function FechasImportantes({ person }: FechasImportantesProps) {
  const updatePerson = useRelationshipStore((s) => s.updatePerson)

  const [adding, setAdding] = useState(false)
  const [label, setLabel] = useState('')
  const [date, setDate] = useState('')
  const [recurring, setRecurring] = useState(false)
  // ¿El usuario tocó el toggle a mano? Si no, lo auto-deducimos de la etiqueta
  // ("Aniversario" / "cumple" → anual) mientras escribe. Un toggle manual
  // congela su decisión (incluso para etiquetas de aniversario).
  const [recurringTouched, setRecurringTouched] = useState(false)

  const dates = person.specialDates ?? []
  // Los countdowns dependen de "hoy" → se computan solo tras montar. Server y
  // primer render cliente muestran un placeholder si hay fechas (no el empty
  // state, que sería falso).
  const mounted = useMounted()
  const { valid, invalid } = mounted ? sortSpecialDates(dates) : { valid: [], invalid: [] }

  function resetForm() {
    setLabel('')
    setDate('')
    setRecurring(false)
    setRecurringTouched(false)
    setAdding(false)
  }

  // Al tipear la etiqueta: si el usuario no tocó el toggle, lo sincronizamos
  // con la inferencia ("Aniversario de bodas" → anual ON).
  function onLabelChange(value: string) {
    setLabel(value)
    if (!recurringTouched) setRecurring(inferAnnualRecurrence(value))
  }

  function handleAdd() {
    const trimmedLabel = label.trim()
    if (!trimmedLabel) {
      toast.error('Falta la etiqueta', { description: 'Ponele un nombre a la fecha.' })
      return
    }
    if (!parseLocalDate(date)) {
      toast.error('Fecha inválida', { description: 'Elegí una fecha válida.' })
      return
    }
    const newDate: SpecialDate = {
      id: crypto.randomUUID(),
      label: trimmedLabel,
      date,
      recurring,
    }
    updatePerson(person.id, {
      specialDates: [...dates, newDate],
      updatedAt: new Date().toISOString(),
    })
    toast.success('Fecha agregada', { description: trimmedLabel })
    resetForm()
  }

  function handleRemove(id: string, removedLabel: string) {
    updatePerson(person.id, {
      specialDates: dates.filter((d) => d.id !== id),
      updatedAt: new Date().toISOString(),
    })
    toast.success('Fecha eliminada', { description: removedLabel })
  }

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <CalendarHeart
              size={14}
              strokeWidth={1.75}
              className="text-muted-foreground/70"
              aria-hidden="true"
            />
            <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">
              Fechas importantes
            </div>
          </div>
          {!adding && (
            <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
              <Plus size={13} strokeWidth={1.75} className="mr-1" />
              Agregar
            </Button>
          )}
        </div>

        {adding && (
          <div className="mb-4 space-y-3 rounded-md border border-border/60 p-3">
            <div>
              <Label htmlFor="sd-label" className="text-xs">
                Etiqueta
              </Label>
              <Input
                id="sd-label"
                value={label}
                onChange={(e) => onLabelChange(e.target.value)}
                placeholder="Ej: Aniversario, Día del santo…"
                className="mt-1"
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="sd-date" className="text-xs">
                Fecha
              </Label>
              <Input
                id="sd-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 font-mono"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setRecurringTouched(true)
                setRecurring((v) => !v)
              }}
              className={cn(
                'flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors',
                recurring
                  ? 'border-accent/50 bg-accent/10 text-foreground'
                  : 'border-border text-muted-foreground hover:border-accent/40',
              )}
              aria-pressed={recurring}
            >
              <Repeat
                size={13}
                strokeWidth={1.75}
                className={cn(recurring && 'text-brand')}
                aria-hidden="true"
              />
              Se repite cada año
            </button>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={resetForm}>
                Cancelar
              </Button>
              <Button size="sm" onClick={handleAdd}>
                Guardar
              </Button>
            </div>
          </div>
        )}

        {!mounted && dates.length > 0 ? (
          <ul className="space-y-1.5" aria-hidden="true">
            {dates.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border/40 px-3 py-2"
              >
                <div className="h-4 w-28 rounded bg-muted/40 animate-pulse" />
                <div className="h-4 w-14 rounded bg-muted/30 animate-pulse" />
              </li>
            ))}
          </ul>
        ) : valid.length === 0 && invalid.length === 0 ? (
          !adding && <EmptyState />
        ) : (
          <ul className="space-y-1.5">
            {valid.map((cd) => (
              <DateRow
                key={cd.sd.id}
                cd={cd}
                onRemove={() => handleRemove(cd.sd.id, cd.sd.label)}
              />
            ))}
            {invalid.map((sd) => (
              <li
                key={sd.id}
                className="flex items-center justify-between gap-2 rounded-md border border-warn/30 bg-warn-soft px-3 py-2 text-xs"
              >
                <span className="flex items-center gap-1.5 text-warn">
                  <AlertCircle size={12} strokeWidth={2} aria-hidden="true" />
                  {sd.label} · fecha inválida
                </span>
                <RemoveButton onClick={() => handleRemove(sd.id, sd.label)} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function DateRow({
  cd,
  onRemove,
}: {
  cd: SpecialDateCountdown
  onRemove: () => void
}) {
  const phrase = formatCountdownPhrase(cd)
  const isToday = cd.daysUntil === 0
  return (
    <li
      className={cn(
        'flex items-center justify-between gap-3 rounded-md border border-border/40 px-3 py-2',
        cd.isPast && 'opacity-60',
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{cd.sd.label}</span>
          {cd.recurring && (
            <Badge variant="outline" className="text-[9px] font-normal gap-1 px-1.5 py-0">
              <Repeat size={9} strokeWidth={2} aria-hidden="true" />
              anual
            </Badge>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground font-mono">
          {formatSpecialDate(cd)}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span
          className={cn(
            'text-xs font-medium tabular-nums whitespace-nowrap',
            isToday ? 'text-brand' : cd.isPast ? 'text-muted-foreground' : 'text-foreground',
          )}
        >
          {phrase}
        </span>
        <RemoveButton onClick={onRemove} />
      </div>
    </li>
  )
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-shrink-0 flex items-center justify-center h-8 w-8 -m-1.5 rounded text-muted-foreground/50 hover:text-bad transition-colors"
      aria-label="Eliminar fecha"
    >
      <X size={14} strokeWidth={1.75} />
    </button>
  )
}

function EmptyState() {
  return (
    <p className="text-sm text-muted-foreground italic leading-relaxed">
      Sin fechas importantes. Agregá aniversarios, fechas especiales o
      recordatorios con el botón <span className="not-italic font-medium">Agregar</span>.
    </p>
  )
}
