'use client'
// SIR V2 — "Personas mencionadas — ¿crear?" (PR-B + idempotencia P2).
// Detecta TERCEROS referidos en las fechas importantes de un contacto (que el
// import promovió, ej. "Cumpleaños del sobrino de Adrian") y propone crear su
// perfil + vínculo con el contacto + su cumple. Confirmás (nunca crea solo).
//
// IDEMPOTENCIA (P2, 2026-06-19): como WhatsApp re-exporta TODO en cada subida,
// esto salía spameado en loop. Ahora: (1) DEDUP de menciones (Emilio x2,
// sobrino x2 → uno); (2) si la persona YA existe la ofrece VINCULAR (no crear
// duplicado) y si ya está vinculada la oculta; (3) lo creado/descartado se
// PERSISTE por contacto (localStorage) → no vuelve a salir al recargar/re-subir.
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { trackCreated, track, EVENTS } from '@/lib/analytics/track'
import { UserPlus, X, Link2 } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useRelationshipStore } from '@/stores'
import { useMounted } from '@/hooks/useMounted'
import { generateSlug } from '@/lib/people/slug'
import { KIND_OPTIONS } from '@/lib/relationships/family'
import {
  parseThirdPartyMentions, placeholderName, dedupeMentions, mentionKey, findExistingByName,
  type MentionedPerson,
} from '@/lib/relaciones/mentionedPeople'
import type { FamilyKind, Person, SpecialDate } from '@/types'

function rand(n: number): string {
  return Math.random().toString(36).slice(2, 2 + n)
}

const LS_PREFIX = 'sir-mencionadas-handled:'
function readHandled(personId: string): string[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(LS_PREFIX + personId) || '[]') as string[] } catch { return [] }
}
function writeHandled(personId: string, keys: string[]): void {
  try { localStorage.setItem(LS_PREFIX + personId, JSON.stringify(keys.slice(-300))) } catch { /* */ }
}

interface Props {
  personId: string
  personName: string
  specialDates?: SpecialDate[]
}

export function MencionadasPanel({ personId, personName, specialDates }: Props) {
  const mounted = useMounted()
  const people = useRelationshipStore((s) => s.people)
  const personLinks = useRelationshipStore((s) => s.personLinks)
  const addPerson = useRelationshipStore((s) => s.addPerson)
  const addPersonLink = useRelationshipStore((s) => s.addPersonLink)
  const updatePerson = useRelationshipStore((s) => s.updatePerson)

  // Claves ya manejadas (creadas/vinculadas/descartadas), persistidas por contacto.
  const [handled, setHandled] = useState<string[]>(() => (typeof window !== 'undefined' ? readHandled(personId) : []))
  const [names, setNames] = useState<Record<string, string>>({})
  const [kinds, setKinds] = useState<Record<string, FamilyKind>>({})

  // Menciones: parse → DEDUP → fuera las ya manejadas.
  const mentions = useMemo(() => {
    const all = dedupeMentions(parseThirdPartyMentions(specialDates, personName))
    const done = new Set(handled)
    return all.filter((m) => !done.has(mentionKey(m)))
  }, [specialDates, personName, handled])

  // ¿Ya existe esa persona en la red? (solo menciones CON nombre).
  const existingFor = useMemo(() => {
    const map = new Map<string, Person | null>()
    for (const m of mentions) {
      map.set(m.sourceId, m.name ? (findExistingByName(m.name, people) as Person | null) : null)
    }
    return map
  }, [mentions, people])

  function isLinked(otherId: string): boolean {
    return personLinks.some(
      (l) => (l.personAId === personId && l.personBId === otherId) || (l.personAId === otherId && l.personBId === personId),
    )
  }

  // Menciones visibles: si ya existe Y ya está vinculada, no hay nada que hacer → ocultar.
  const visible = useMemo(
    () => mentions.filter((m) => {
      const ex = existingFor.get(m.sourceId)
      return !(ex && isLinked(ex.id))
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mentions, existingFor, personLinks],
  )

  if (!mounted || visible.length === 0) return null

  function markHandled(m: MentionedPerson) {
    const next = [...handled, mentionKey(m)]
    setHandled(next); writeHandled(personId, next)
  }

  function nameFor(m: MentionedPerson): string {
    return (names[m.sourceId] ?? m.name ?? placeholderName(m, personName)).trim()
  }
  function kindFor(m: MentionedPerson): FamilyKind {
    return kinds[m.sourceId] ?? m.kind
  }

  function linkExisting(m: MentionedPerson, ex: Person) {
    const now = new Date().toISOString()
    addPersonLink({ id: `lnk_${Date.now()}_${rand(6)}`, personAId: personId, personBId: ex.id, kind: kindFor(m), createdAt: now })
    if (m.isBirthday && !ex.birthDate) updatePerson(ex.id, { birthDate: m.dateISO })
    track(EVENTS.familyLinkAdded, { kind: kindFor(m), source: 'mencionada_vincular' })
    markHandled(m)
    toast.success(`Vinculado a ${ex.name}`, { description: `${personName} → ${ex.name} (no dupliqué)` })
  }

  function create(m: MentionedPerson) {
    const name = nameFor(m)
    if (name.length < 2) { toast.error('Ponele un nombre'); return }
    const taken = new Set(people.map((p) => p.slug).filter(Boolean) as string[])
    let slug = generateSlug(name)
    while (taken.has(slug)) slug = `${slug}-${rand(3)}`
    const now = new Date().toISOString()
    const id = `per_${Date.now()}_${rand(6)}`
    const person: Person = {
      id, slug, name,
      relationship: 'family', category: 'peripheral',
      importanceScore: 4, energyImpact: 'neutral', trustLevel: 5,
      contactFrequency: '', tags: [],
      notes: `Creado desde una mención en la ficha de ${personName}.`,
      birthDate: m.isBirthday ? m.dateISO : undefined,
      createdAt: now, updatedAt: now,
    }
    addPerson(person)
    addPersonLink({ id: `lnk_${Date.now()}_${rand(6)}`, personAId: personId, personBId: id, kind: kindFor(m), createdAt: now })
    if (m.isBirthday) updatePerson(id, { birthDate: m.dateISO })
    trackCreated(EVENTS.personAdded, { method: 'mencionada' })
    track(EVENTS.familyLinkAdded, { kind: kindFor(m), source: 'mencionada' })
    markHandled(m)
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
          Detecté terceros en sus fechas importantes. Confirmá para crearlos como contacto + vínculo + cumple. Si ya lo tenés, te ofrezco vincularlo.
        </p>
        <div className="space-y-3">
          {visible.map((m) => {
            const ex = existingFor.get(m.sourceId) ?? null
            return (
              <div key={m.sourceId} className="rounded-md border border-border p-2.5">
                <div className="text-[11px] text-muted-foreground mb-2 truncate">De: &ldquo;{m.rawLabel}&rdquo;</div>
                {ex ? (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <div className="flex-1 min-w-0 text-sm">
                      Ya tenés a <span className="font-medium">{ex.name}</span> — ¿es el mismo?
                    </div>
                    <div className="flex gap-1.5">
                      <Button size="sm" onClick={() => linkExisting(m, ex)}>
                        <Link2 size={14} className="mr-1" /> Vincular
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => markHandled(m)} aria-label="No es / descartar">
                        <X size={15} />
                      </Button>
                    </div>
                  </div>
                ) : (
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
                      <Button size="sm" variant="ghost" onClick={() => markHandled(m)} aria-label="Descartar">
                        <X size={15} />
                      </Button>
                    </div>
                  </div>
                )}
                {m.isBirthday && (
                  <div className="text-[11px] text-muted-foreground mt-1.5">Cumpleaños: {m.dateISO}</div>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
