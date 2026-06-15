'use client'
// SIR V2 — "Personas mencionadas — ¿crear?" (PR-B).
// Detecta TERCEROS referidos en las fechas importantes de un contacto (que el
// import promovió, ej. "Cumpleaños del sobrino de Adrian") y propone crear su
// perfil + vínculo con el contacto + su cumple. Confirmás (nunca crea solo).
// Reusa el patrón addPerson + addPersonLink de FamiliaPanel (client-side).
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { UserPlus, X } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useRelationshipStore } from '@/stores'
import { useMounted } from '@/hooks/useMounted'
import { generateSlug } from '@/lib/people/slug'
import { KIND_OPTIONS } from '@/lib/relationships/family'
import { parseThirdPartyMentions, placeholderName, type MentionedPerson } from '@/lib/relaciones/mentionedPeople'
import type { FamilyKind, Person, SpecialDate } from '@/types'

function rand(n: number): string {
  return Math.random().toString(36).slice(2, 2 + n)
}

interface Props {
  personId: string
  personName: string
  specialDates?: SpecialDate[]
}

export function MencionadasPanel({ personId, personName, specialDates }: Props) {
  const mounted = useMounted()
  const people = useRelationshipStore((s) => s.people)
  const addPerson = useRelationshipStore((s) => s.addPerson)
  const addPersonLink = useRelationshipStore((s) => s.addPersonLink)
  const updatePerson = useRelationshipStore((s) => s.updatePerson)

  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [names, setNames] = useState<Record<string, string>>({})
  const [kinds, setKinds] = useState<Record<string, FamilyKind>>({})

  const mentions = useMemo(
    () => parseThirdPartyMentions(specialDates, personName).filter((m) => !dismissed.has(m.sourceId)),
    [specialDates, personName, dismissed],
  )

  if (!mounted || mentions.length === 0) return null

  function nameFor(m: MentionedPerson): string {
    return (names[m.sourceId] ?? m.name ?? placeholderName(m, personName)).trim()
  }
  function kindFor(m: MentionedPerson): FamilyKind {
    return kinds[m.sourceId] ?? m.kind
  }

  function create(m: MentionedPerson) {
    const name = nameFor(m)
    if (name.length < 2) {
      toast.error('Ponele un nombre')
      return
    }
    const taken = new Set(people.map((p) => p.slug).filter(Boolean) as string[])
    let slug = generateSlug(name)
    while (taken.has(slug)) slug = `${slug}-${rand(3)}`
    const now = new Date().toISOString()
    const id = `per_${Date.now()}_${rand(6)}`
    const person: Person = {
      id,
      slug,
      name,
      relationship: 'family',
      category: 'peripheral',
      importanceScore: 4,
      energyImpact: 'neutral',
      trustLevel: 5,
      contactFrequency: '',
      tags: [],
      notes: `Creado desde una mención en la ficha de ${personName}.`,
      birthDate: m.isBirthday ? m.dateISO : undefined,
      createdAt: now,
      updatedAt: now,
    }
    addPerson(person)
    // Vínculo: el contacto (A) → el nuevo familiar (B), con el parentesco.
    addPersonLink({
      id: `lnk_${Date.now()}_${rand(6)}`,
      personAId: personId,
      personBId: id,
      kind: kindFor(m),
      createdAt: now,
    })
    if (m.isBirthday) {
      updatePerson(id, { birthDate: m.dateISO })
    }
    setDismissed((prev) => new Set(prev).add(m.sourceId))
    toast.success(`${name} creado y vinculado`, { description: `${personName} → ${name}` })
  }

  return (
    <Card className="shadow-none mb-4 border-brand/20 bg-brand-soft/10">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-1">
          <UserPlus size={15} strokeWidth={1.75} className="text-brand-soft-foreground" aria-hidden="true" />
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Personas mencionadas — ¿crear?</div>
        </div>
        <p className="text-[11px] text-muted-foreground mb-3">
          Detecté terceros en sus fechas importantes. Confirmá para crearlos como contacto + vínculo + cumple.
        </p>
        <div className="space-y-3">
          {mentions.map((m) => (
            <div key={m.sourceId} className="rounded-md border border-border p-2.5">
              <div className="text-[11px] text-muted-foreground mb-2 truncate">De: &ldquo;{m.rawLabel}&rdquo;</div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <Input
                  value={nameFor(m)}
                  onChange={(e) => setNames((p) => ({ ...p, [m.sourceId]: e.target.value }))}
                  placeholder="Nombre"
                  className="h-9 flex-1 min-w-0"
                />
                <Select value={kindFor(m)} onValueChange={(v) => setKinds((p) => ({ ...p, [m.sourceId]: v as FamilyKind }))}>
                  <SelectTrigger className="h-9 w-full sm:w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {KIND_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="flex gap-1.5">
                  <Button size="sm" onClick={() => create(m)}>Crear</Button>
                  <Button size="sm" variant="ghost" onClick={() => setDismissed((prev) => new Set(prev).add(m.sourceId))} aria-label="Descartar">
                    <X size={15} />
                  </Button>
                </div>
              </div>
              {m.isBirthday && (
                <div className="text-[11px] text-muted-foreground mt-1.5">Cumpleaños: {m.dateISO}</div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
