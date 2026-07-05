'use client'

// SIR V2 — Capturador de vínculos PROFESIONALES/SOCIALES (0128) que desbloquea
// 15·7 (inteligencia de red). Declarás que esta persona conoce a otra por trabajo
// o socialmente ("Y es colega de X", "Z es cliente de X") como ARISTA REAL del
// grafo person↔person — no texto. Gemelo de FamiliaPanel pero para el mundo no
// familiar; las aristas quedan con category='profesional'/'social' para no
// contaminar la inferencia de parentesco. Persiste vía el store (addPersonLink).

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import Link from 'next/link'
import { Briefcase, Plus, X, Search, UserPlus } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useRelationshipStore } from '@/stores'
import { useMounted } from '@/hooks/useMounted'
import { generateSlug } from '@/lib/people/slug'
import { matchStrength } from '@/lib/relationships/nameMatch'
import { SELF_ID, isFamilyLink } from '@/lib/relationships/family'
import { PRO_KIND_OPTIONS, PRO_KIND_LABEL, inverseProKindLabel, categoryForProKind } from '@/lib/relationships/professional'
import type { Person, PersonLink, ProfessionalKind } from '@/types'

function rand(n: number): string {
  let s = ''
  while (s.length < n) s += Math.floor((Date.now() * (s.length + 1)) % 36).toString(36)
  return s.slice(0, n)
}
function localUniqueSlug(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base
  for (let i = 2; i < 200; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`
  return `${base}-${rand(4)}`
}
function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] || name
}

interface ProRow {
  link: PersonLink
  otherId: string
  roleLabel: string
}

export function ProfessionalLinksPanel({ person }: { person: Person }) {
  const mounted = useMounted()
  const people = useRelationshipStore((s) => s.people)
  const personLinks = useRelationshipStore((s) => s.personLinks)
  const addPerson = useRelationshipStore((s) => s.addPerson)
  const addPersonLink = useRelationshipStore((s) => s.addPersonLink)
  const removePersonLink = useRelationshipStore((s) => s.removePersonLink)

  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null)
  const [kind, setKind] = useState<ProfessionalKind>('colega')
  const [context, setContext] = useState('')

  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])
  const links = useMemo(() => personLinks ?? [], [personLinks])

  // Aristas NO-familiares (profesional/social) que tocan a esta persona.
  const proRows: ProRow[] = useMemo(() => {
    const rows: ProRow[] = []
    for (const l of links) {
      if (l.personAId === SELF_ID || isFamilyLink(l)) continue
      const k = l.kind as ProfessionalKind
      if (l.personAId === person.id) {
        rows.push({ link: l, otherId: l.personBId, roleLabel: PRO_KIND_LABEL[k] ?? String(k) })
      } else if (l.personBId === person.id) {
        rows.push({ link: l, otherId: l.personAId, roleLabel: inverseProKindLabel(k) })
      }
    }
    return rows
  }, [links, person.id])

  const linkedIds = useMemo(() => new Set(proRows.map((r) => r.otherId)), [proRows])

  const candidates = useMemo(() => {
    const q = query.trim()
    if (!q) return []
    return people
      .filter((p) => p.id !== person.id && !linkedIds.has(p.id))
      .map((p) => ({ person: p, strength: matchStrength(q, p.name) }))
      .filter((c) => c.strength > 0)
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 6)
  }, [people, person.id, linkedIds, query])

  function resetForm() {
    setQuery(''); setSelectedTargetId(null); setKind('colega'); setContext(''); setAdding(false)
  }

  function ensureTargetPerson(): string | null {
    if (selectedTargetId) return selectedTargetId
    const trimmed = query.trim()
    if (!trimmed) { toast.error('Elegí o nombrá a la persona'); return null }
    const takenSlugs = new Set(people.map((p) => p.slug).filter(Boolean) as string[])
    const slug = localUniqueSlug(generateSlug(trimmed), takenSlugs)
    const now = new Date().toISOString()
    const id = `per_${Date.now()}_${rand(6)}`
    addPerson({
      id, slug, name: trimmed, relationship: 'professional', category: 'network',
      importanceScore: 4, energyImpact: 'neutral', trustLevel: 5, contactFrequency: '',
      tags: [], notes: '', createdAt: now, updatedAt: now,
    })
    return id
  }

  function handleLink() {
    const targetId = ensureTargetPerson()
    if (!targetId) return
    if (targetId === person.id) { toast.error('No podés vincular a la persona consigo misma'); return }
    const dup = links.some(
      (l) => (l.personAId === person.id && l.personBId === targetId) || (l.personAId === targetId && l.personBId === person.id),
    )
    if (dup) { toast.error('Ese vínculo ya existe'); return }
    addPersonLink({
      id: `lnk_${Date.now()}_${rand(6)}`,
      personAId: person.id,
      personBId: targetId,
      kind,
      category: categoryForProKind(kind),
      context: context.trim() || null,
      createdAt: new Date().toISOString(),
    })
    toast.success('Vínculo agregado', { description: `${PRO_KIND_LABEL[kind]}: ${peopleById.get(targetId)?.name ?? query.trim()}` })
    resetForm()
  }

  if (!mounted) return null

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Briefcase size={14} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
            <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Vínculos profesionales / sociales</div>
          </div>
          {!adding && (
            <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
              <Plus size={13} strokeWidth={1.75} className="mr-1" /> Agregar
            </Button>
          )}
        </div>

        {adding && (
          <div className="mb-4 space-y-3 rounded-md border border-border/60 p-3">
            <div>
              <Label htmlFor="pro-search" className="text-xs">¿A quién conoce {firstNameOf(person.name)}?</Label>
              <div className="relative mt-1">
                <Search size={13} strokeWidth={1.75} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 pointer-events-none" aria-hidden="true" />
                <Input
                  id="pro-search"
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setSelectedTargetId(null) }}
                  placeholder="Escribí para buscar entre tu gente…"
                  className="pl-8" autoFocus autoComplete="off"
                />
              </div>
              {query.trim() && !selectedTargetId && (
                <ul className="mt-1.5 rounded-md border border-border/60 divide-y divide-border/40 overflow-hidden">
                  {candidates.map((c) => (
                    <li key={c.person.id}>
                      <button type="button" onClick={() => { setSelectedTargetId(c.person.id); setQuery(c.person.name) }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex items-center justify-between gap-2">
                        <span className="truncate">{c.person.name}</span>
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground/60 flex-shrink-0">existe</span>
                      </button>
                    </li>
                  ))}
                  <li>
                    <button type="button" onClick={handleLink}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex items-center gap-2 text-brand">
                      <UserPlus size={13} strokeWidth={1.75} className="flex-shrink-0" /> Crear «{query.trim()}» como persona nueva
                    </button>
                  </li>
                </ul>
              )}
              {selectedTargetId && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Vinculando a <span className="text-foreground">{peopleById.get(selectedTargetId)?.name}</span>.{' '}
                  <button type="button" className="underline hover:text-foreground" onClick={() => { setSelectedTargetId(null); setQuery('') }}>cambiar</button>
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="pro-kind" className="text-xs">Vínculo (respecto de {firstNameOf(person.name)})</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as ProfessionalKind)}>
                <SelectTrigger id="pro-kind" className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRO_KIND_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="pro-context" className="text-xs">Contexto (opcional)</Label>
              <Input id="pro-context" value={context} onChange={(e) => setContext(e.target.value)}
                placeholder="Ej: mismo equipo del área TAC en HNG" className="mt-1 text-[13px]" />
            </div>

            <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
              Enlaza a una persona REAL del grafo. Esto abre los caminos de red (a quién llegás vía quién) sin mezclarse con la familia.
            </p>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={resetForm}>Cancelar</Button>
              <Button size="sm" onClick={handleLink} disabled={!query.trim()}>Vincular</Button>
            </div>
          </div>
        )}

        {proRows.length === 0 ? (
          !adding && (
            <p className="text-sm text-muted-foreground">
              Sin vínculos profesionales/sociales. <span className="text-muted-foreground/60">Declará quién conoce a quién para trazar caminos de red.</span>
            </p>
          )
        ) : (
          <ul className="space-y-1.5">
            {proRows.map((r) => {
              const target = peopleById.get(r.otherId)
              const targetName = target?.name ?? '(persona eliminada)'
              return (
                <li key={r.link.id} className="flex items-center justify-between gap-2 py-1 border-b border-border/40 last:border-0">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 w-24 flex-shrink-0">{r.roleLabel}</span>
                      {target?.slug ? (
                        <Link href={`/relaciones/${target.slug}`} className="text-sm text-foreground hover:underline truncate">{targetName}</Link>
                      ) : (
                        <span className="text-sm text-foreground truncate">{targetName}</span>
                      )}
                    </div>
                    {r.link.context && <p className="text-[11px] text-muted-foreground/70 ml-[6.5rem]">{r.link.context}</p>}
                  </div>
                  <button type="button" onClick={() => { removePersonLink(r.link.id); toast.success('Vínculo eliminado') }}
                    className="flex items-center justify-center h-8 w-8 -m-1.5 rounded text-muted-foreground/50 hover:text-bad flex-shrink-0"
                    aria-label={`Quitar vínculo ${r.roleLabel}`}>
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
