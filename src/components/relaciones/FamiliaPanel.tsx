'use client'
// SIR V2 — FamiliaPanel (A.4): vincular familiares a una persona.
//
// Agregar un familiar (nombre + parentesco) crea el NODO-PERSONA mínimo
// (relationship='family') si no existe, y la ARISTA de familia (person_links,
// migration 0035) entre la persona de la ficha y el familiar. El grafo dibuja
// esa arista como vínculo de familia (color 'familia', label = parentesco).
//
// Persiste vía el store (sync engine): addPerson + addPersonLink → upsert a
// Supabase. Dedupe por nombre (reusa una persona existente con el mismo nombre
// en vez de duplicar) y por (familiar, parentesco).

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import Link from 'next/link'
import { Users, Plus, X } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useRelationshipStore } from '@/stores'
import { generateSlug } from '@/lib/people/slug'
import type { Person, FamilyKind, PersonLink } from '@/types'

const KIND_OPTIONS: { value: FamilyKind; label: string }[] = [
  { value: 'madre', label: 'Madre' },
  { value: 'padre', label: 'Padre' },
  { value: 'hermana', label: 'Hermana' },
  { value: 'hermano', label: 'Hermano' },
  { value: 'hija', label: 'Hija' },
  { value: 'hijo', label: 'Hijo' },
  { value: 'pareja', label: 'Pareja' },
  { value: 'familiar', label: 'Familiar' },
]
const KIND_LABEL = Object.fromEntries(KIND_OPTIONS.map((o) => [o.value, o.label])) as Record<FamilyKind, string>

function rand(n: number): string {
  let s = ''
  while (s.length < n) s += Math.floor((Date.now() * (s.length + 1)) % 36).toString(36)
  return s.slice(0, n)
}

/** Slug único contra los slugs locales (single-user → suficiente). */
function localUniqueSlug(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base
  for (let i = 2; i < 200; i++) {
    const candidate = `${base}-${i}`
    if (!taken.has(candidate)) return candidate
  }
  return `${base}-${rand(4)}`
}

export interface FamiliaPanelProps {
  person: Person
}

export function FamiliaPanel({ person }: FamiliaPanelProps) {
  const people = useRelationshipStore((s) => s.people)
  const personLinks = useRelationshipStore((s) => s.personLinks)
  const addPerson = useRelationshipStore((s) => s.addPerson)
  const addPersonLink = useRelationshipStore((s) => s.addPersonLink)
  const removePersonLink = useRelationshipStore((s) => s.removePersonLink)

  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<FamilyKind>('madre')

  const links = useMemo(
    () => (personLinks ?? []).filter((l) => l.personAId === person.id),
    [personLinks, person.id],
  )
  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])

  function resetForm() {
    setName('')
    setKind('madre')
    setAdding(false)
  }

  function handleAdd() {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error('Falta el nombre', { description: 'Ponele un nombre al familiar.' })
      return
    }

    // Dedupe por nombre: si ya existe una persona con ese nombre, la reusamos
    // (no duplicamos el nodo). Si no, creamos el nodo-persona mínimo.
    const existing = people.find((p) => p.name.trim().toLowerCase() === trimmed.toLowerCase())
    let targetId: string
    if (existing) {
      targetId = existing.id
    } else {
      const takenSlugs = new Set(people.map((p) => p.slug).filter(Boolean) as string[])
      const slug = localUniqueSlug(generateSlug(trimmed), takenSlugs)
      const now = new Date().toISOString()
      targetId = `per_${Date.now()}_${rand(6)}`
      addPerson({
        id: targetId,
        slug,
        name: trimmed,
        relationship: 'family',
        category: 'close',
        importanceScore: 5,
        energyImpact: 'neutral',
        trustLevel: 5,
        contactFrequency: '',
        tags: [],
        notes: '',
        createdAt: now,
        updatedAt: now,
      })
    }

    if (targetId === person.id) {
      toast.error('No podés vincular a la persona consigo misma')
      return
    }
    if (links.some((l) => l.personBId === targetId && l.kind === kind)) {
      toast.error('Ese vínculo ya existe')
      return
    }

    addPersonLink({
      id: `lnk_${Date.now()}_${rand(6)}`,
      personAId: person.id,
      personBId: targetId,
      kind,
      createdAt: new Date().toISOString(),
    })
    toast.success('Familiar vinculado', { description: `${KIND_LABEL[kind]}: ${trimmed}` })
    resetForm()
  }

  function handleRemove(link: PersonLink) {
    removePersonLink(link.id)
    toast.success('Vínculo de familia eliminado')
  }

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Users size={14} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
              Familia
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
              <Label htmlFor="fam-name" className="text-xs">Nombre del familiar</Label>
              <Input
                id="fam-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Rosa (mamá de…)"
                className="mt-1"
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="fam-kind" className="text-xs">Parentesco</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as FamilyKind)}>
                <SelectTrigger id="fam-kind" className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {KIND_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
              Crea (o reusa) la persona y la vincula como familia. Aparece como nodo conectado en el grafo.
            </p>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={resetForm}>Cancelar</Button>
              <Button size="sm" onClick={handleAdd}>Vincular</Button>
            </div>
          </div>
        )}

        {links.length === 0 ? (
          !adding && (
            <p className="text-sm text-muted-foreground">
              Sin familiares vinculados. <span className="text-muted-foreground/60">Opcional — agregá padre, madre, hermanos, etc.</span>
            </p>
          )
        ) : (
          <ul className="space-y-1.5">
            {links.map((l) => {
              const target = peopleById.get(l.personBId)
              const targetName = target?.name ?? '(persona eliminada)'
              const slug = target?.slug
              return (
                <li key={l.id} className="flex items-center justify-between gap-2 py-1 border-b border-border/40 last:border-0">
                  <div className="min-w-0 flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 w-16 flex-shrink-0">
                      {KIND_LABEL[l.kind] ?? l.kind}
                    </span>
                    {slug ? (
                      <Link href={`/relaciones/${slug}`} className="text-sm text-foreground hover:underline truncate">
                        {targetName}
                      </Link>
                    ) : (
                      <span className="text-sm text-foreground truncate">{targetName}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemove(l)}
                    className="flex items-center justify-center h-8 w-8 -m-1.5 rounded text-muted-foreground/50 hover:text-bad flex-shrink-0"
                    aria-label={`Quitar vínculo ${KIND_LABEL[l.kind] ?? l.kind}`}
                  >
                    <X size={13} strokeWidth={1.75} />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
