'use client'
// SIR V2 — TensionesFortalezas: notas relacionales estratégicas por persona.
//
// Tres listas editables en la ficha: FRICCIÓN (qué genera roce), FORTALEZAS
// (qué sostiene el vínculo) y METAS EN COMÚN (terreno compartido). Las carga
// Aaron a mano — inteligencia relacional cruda para que el contacto no sea
// genérico. Alimenta el contexto de contacto ("antes de contactar" / síntesis).
//
// Storage: `people.relational_notes` (jsonb, migration 0132), persistido vía
// updatePerson() del store — MISMO patrón que FechasImportantes (special_dates).
// NO usa la tabla `relationships` (semi-vestigial: muchas personas no tienen fila
// ahí; auditado 07-07). La lógica pura (parse/add/remove) vive en
// `lib/people/relationalNotes`. Se oculta nada: siempre muestra los tres editores.
//
// Patrón visual: Card + shadow-none + uppercase tracking, igual que
// FechasImportantes / WhatMattersChips / CicloPanel.

import { useState } from 'react'
import { Sparkles, Plus, X, Flame, Shield, Target } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useRelationshipStore } from '@/stores'
import { cn } from '@/lib/utils'
import {
  parseRelationalNotes,
  addNote,
  removeNote,
  RELATIONAL_NOTE_KINDS,
  MAX_NOTES_PER_KIND,
  type RelationalNoteKind,
} from '@/lib/people/relationalNotes'
import type { Person } from '@/types'

/** Ícono por tipo de nota. */
const KIND_ICON: Record<RelationalNoteKind, typeof Flame> = {
  tensions: Flame,
  strengths: Shield,
  sharedGoals: Target,
}

/** Color del chip por tipo (usa los tokens canónicos ok/warn/brand). */
const KIND_CHIP: Record<RelationalNoteKind, string> = {
  tensions: 'border-warn/30 bg-warn-soft text-warn',
  strengths: 'border-ok/30 bg-ok-soft text-ok',
  sharedGoals: 'border-brand/30 bg-brand/5 text-brand',
}

export function TensionesFortalezas({ person }: { person: Person }) {
  const updatePerson = useRelationshipStore((s) => s.updatePerson)
  const notes = parseRelationalNotes(person.relationalNotes)

  function commit(next: ReturnType<typeof parseRelationalNotes>) {
    updatePerson(person.id, {
      relationalNotes: next,
      updatedAt: new Date().toISOString(),
    })
  }

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles size={14} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
          <h2 className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Tensiones y fortalezas</h2>
        </div>
        <p className="text-[11px] text-muted-foreground mb-4 leading-snug">
          Lo que tú sabes de este vínculo — para que el contacto sea real, no genérico.
        </p>

        <div className="space-y-4">
          {RELATIONAL_NOTE_KINDS.map(({ kind, label, placeholder, hint }) => (
            <NoteList
              key={kind}
              kind={kind}
              label={label}
              placeholder={placeholder}
              hint={hint}
              items={notes[kind]}
              onAdd={(raw) => commit(addNote(notes, kind, raw))}
              onRemove={(index) => commit(removeNote(notes, kind, index))}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function NoteList({
  kind,
  label,
  placeholder,
  hint,
  items,
  onAdd,
  onRemove,
}: {
  kind: RelationalNoteKind
  label: string
  placeholder: string
  hint: string
  items: string[]
  onAdd: (raw: string) => void
  onRemove: (index: number) => void
}) {
  const [adding, setAdding] = useState(false)
  const [value, setValue] = useState('')
  const Icon = KIND_ICON[kind]
  const atCap = items.length >= MAX_NOTES_PER_KIND

  function submit() {
    const v = value.trim()
    if (!v) return
    onAdd(v)
    setValue('')
    // Mantiene el input abierto para cargar varios seguidos.
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5">
          <Icon size={13} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
          <span className="text-xs font-medium text-foreground">{label}</span>
          {items.length > 0 && (
            <span className="text-[10px] text-muted-foreground/60 tabular-nums">{items.length}</span>
          )}
        </div>
        {!adding && !atCap && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            onClick={() => setAdding(true)}
          >
            <Plus size={12} strokeWidth={2} className="mr-1" />
            Agregar
          </Button>
        )}
      </div>

      {items.length === 0 && !adding ? (
        <p className="text-[11px] text-muted-foreground/70 italic leading-snug">{hint}</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {items.map((item, i) => (
            <li key={`${item}-${i}`}>
              <Badge
                variant="outline"
                className={cn('text-[11px] font-normal gap-1 py-1 pl-2 pr-1', KIND_CHIP[kind])}
              >
                <span className="whitespace-normal break-words">{item}</span>
                <button
                  type="button"
                  onClick={() => onRemove(i)}
                  className="flex-shrink-0 rounded-sm opacity-60 hover:opacity-100 transition-opacity"
                  aria-label={`Quitar "${item}" de ${label}`}
                >
                  <X size={12} strokeWidth={2} />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <div className="mt-2 flex gap-2">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); submit() }
              if (e.key === 'Escape') { setAdding(false); setValue('') }
            }}
            placeholder={placeholder}
            maxLength={200}
            autoFocus
            className="h-8 text-xs"
          />
          <Button size="sm" className="h-8" onClick={submit} disabled={!value.trim()}>
            Guardar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8"
            onClick={() => { setAdding(false); setValue('') }}
          >
            Listo
          </Button>
        </div>
      )}
      {atCap && (
        <p className="mt-1.5 text-[10px] text-muted-foreground/60">
          Máximo {MAX_NOTES_PER_KIND} — quita alguna para agregar otra.
        </p>
      )}
    </div>
  )
}
