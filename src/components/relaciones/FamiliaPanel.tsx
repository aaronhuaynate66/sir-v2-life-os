'use client'
// SIR V2 — FamiliaPanel (Fase 1 + 1.5): FAMILIA como VÍNCULO REAL.
//
// El problema que resuelve: la familia se cargaba como texto ("MADRE: maria")
// y no reconciliaba contra la persona que YA existe ("María Isabel Espinoza
// Vidaurre"). Ahora:
//
//   • TU VÍNCULO (self↔persona): "¿Quién es esta persona para vos?" — madre,
//     hermana, etc. Se guarda como arista self→persona (person_links con
//     person_a_id='self', migration 0058). El dropdown genérico "Relación"
//     (PersonDetail) sigue intacto; esto es el parentesco específico.
//   • AUTOCOMPLETAR: al agregar un familiar de ESTA persona buscás entre las
//     personas que ya tenés (match tolerante a tildes/primer nombre) y elegís
//     UNA, o creás una nueva. Se guarda la ARISTA, no texto.
//   • BIDIRECCIONAL: una arista dirigida link(A→B, kind) se ve como "B es <kind>
//     de A" en la ficha de A y como "A es <inverso> de B" en la ficha de B.
//   • SUGERENCIAS (nunca automáticas): inferencia transitiva — incluyendo con el
//     self (tu hermana + la madre de tu hermana ⇒ tu madre, y la inversa) — y
//     reconciliación del texto libre de las notas. Aaron acepta o descarta; los
//     descartes se recuerdan (localStorage).
//
// Persiste vía el store (sync engine): addPerson + addPersonLink → upsert a
// Supabase. Dedupe por (familiar, parentesco).

import { useEffect, useMemo, useState } from 'react'
import { track, EVENTS } from '@/lib/analytics/track'
import { toast } from 'sonner'
import Link from 'next/link'
import { Users, Plus, X, Check, Sparkles, Search, UserPlus, Heart } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useRelationshipStore } from '@/stores'
import { useMounted } from '@/hooks/useMounted'
import { generateSlug } from '@/lib/people/slug'
import { cn } from '@/lib/utils'
import { KIND_OPTIONS, KIND_LABEL, inverseRoleLabel, SELF_ID } from '@/lib/relationships/family'
import { matchStrength } from '@/lib/relationships/nameMatch'
import {
  inferFamilyLinks,
  reconcileFamilyFromNotes,
  type FamilySuggestion,
  type InferenceSuggestion, inferSelfPivotLinks} from '@/lib/relationships/suggest'
import type { Person, FamilyKind, PersonLink } from '@/types'

const DISMISSED_KEY = 'sir:family-suggest-dismissed'

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

function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] || name
}

/** Una fila de familia ya vinculada, normalizada para mostrar el rol correcto
 *  según la dirección de la arista respecto de la persona de la ficha. */
interface FamilyRow {
  link: PersonLink
  otherId: string
  roleLabel: string
}

export interface FamiliaPanelProps {
  person: Person
}

export function FamiliaPanel({ person }: FamiliaPanelProps) {
  const mounted = useMounted()
  const people = useRelationshipStore((s) => s.people)
  const personLinks = useRelationshipStore((s) => s.personLinks)
  const addPerson = useRelationshipStore((s) => s.addPerson)
  const addPersonLink = useRelationshipStore((s) => s.addPersonLink)
  const removePersonLink = useRelationshipStore((s) => s.removePersonLink)

  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null)
  const [kind, setKind] = useState<FamilyKind>('madre')

  // "Tu vínculo con esta persona" (self↔persona).
  const [editingSelf, setEditingSelf] = useState(false)
  const [selfKind, setSelfKind] = useState<FamilyKind>(person.relationship === 'romantic' ? 'pareja' : 'madre')

  // Descartes recordados entre sesiones (no re-sugerir lo que Aaron rechazó).
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DISMISSED_KEY)
      if (raw) setDismissed(new Set(JSON.parse(raw) as string[]))
    } catch {
      /* localStorage no disponible — sin persistencia de descartes */
    }
  }, [])

  function dismiss(key: string) {
    setDismissed((prev) => {
      const next = new Set(prev)
      next.add(key)
      try {
        window.localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next]))
      } catch {
        /* noop */
      }
      return next
    })
  }

  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])
  const links = useMemo(() => personLinks ?? [], [personLinks])

  // Vínculo SELF↔esta persona (si existe). Es único por persona en la UI.
  const selfLink = useMemo(
    () => links.find((l) => l.personAId === SELF_ID && l.personBId === person.id) ?? null,
    [links, person.id],
  )

  // El selector "¿Quién es esta persona para vos?" refleja el vínculo YA guardado
  // (si existe); si no, propone por defecto según la relación (pareja si es
  // romántica) — nunca "madre" para una pareja/ex.
  useEffect(() => {
    setSelfKind(selfLink?.kind ?? (person.relationship === 'romantic' ? 'pareja' : 'madre'))
  }, [selfLink, person.relationship])

  // Vista bidireccional de la familia de ESTA persona: salientes (B es <kind>
  // de la ficha) + entrantes (A es <inverso> de la ficha). Excluye las aristas
  // del self — esas viven en "Tu vínculo con esta persona", no en su familia.
  const familyRows: FamilyRow[] = useMemo(() => {
    const rows: FamilyRow[] = []
    for (const l of links) {
      if (l.personAId === SELF_ID) continue
      if (l.personAId === person.id) {
        rows.push({ link: l, otherId: l.personBId, roleLabel: KIND_LABEL[l.kind] ?? l.kind })
      } else if (l.personBId === person.id) {
        rows.push({ link: l, otherId: l.personAId, roleLabel: inverseRoleLabel(l.kind) })
      }
    }
    return rows
  }, [links, person.id])

  // IDs ya vinculados a la ficha (cualquier sentido) — se excluyen del buscador.
  const linkedIds = useMemo(
    () => new Set(familyRows.map((r) => r.otherId)),
    [familyRows],
  )

  // Candidatos del autocompletar: personas existentes que matchean la query,
  // excluyendo a la propia ficha y a quienes ya están vinculados.
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

  // Sugerencias self↔esta persona: inferencia desde el nodo "yo" cuyo destino
  // es ESTA persona ("María Isabel es tu madre"). Solo si aún no hay self-link.
  const selfSuggestions: InferenceSuggestion[] = useMemo(() => {
    if (!mounted || selfLink) return []
    return inferFamilyLinks(SELF_ID, links)
      .filter((s) => s.targetId === person.id && !dismissed.has(s.key))
  }, [mounted, selfLink, links, person.id, dismissed])

  // Sugerencias sobre la familia de ESTA persona (inferencia + reconciliación).
  const personSuggestions: FamilySuggestion[] = useMemo(() => {
    if (!mounted) return []
    const inferred = inferFamilyLinks(person.id, links)
    const pivot = inferSelfPivotLinks(person.id, links)
    const reconciled = reconcileFamilyFromNotes(person, people, links)
    // Dedupe: pivote e inferencia directa pueden proponer el mismo destino+rol.
    const byTarget = new Set<string>()
    const merged = [...inferred, ...pivot].filter((s) => {
      const k = `${s.targetId}:${s.kind}`
      if (byTarget.has(k)) return false
      byTarget.add(k)
      return true
    })
    return [...merged, ...reconciled].filter((s) => !dismissed.has(s.key))
  }, [mounted, person, people, links, dismissed])

  function resetForm() {
    setQuery('')
    setSelectedTargetId(null)
    setKind('madre')
    setAdding(false)
  }

  /** Crea (o reusa) la persona destino y devuelve su id. */
  function ensureTargetPerson(): string | null {
    if (selectedTargetId) return selectedTargetId
    const trimmed = query.trim()
    if (!trimmed) {
      toast.error('Elegí o nombrá un familiar')
      return null
    }
    const takenSlugs = new Set(people.map((p) => p.slug).filter(Boolean) as string[])
    const slug = localUniqueSlug(generateSlug(trimmed), takenSlugs)
    const now = new Date().toISOString()
    const id = `per_${Date.now()}_${rand(6)}`
    addPerson({
      id,
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
    return id
  }

  /** Vincula fromId → toId con el parentesco `linkKind` (dirigido). */
  function createLink(fromId: string, toId: string, linkKind: FamilyKind, label: string) {
    if (toId === fromId) {
      toast.error('No podés vincular a la persona consigo misma')
      return false
    }
    const dup = links.some(
      (l) =>
        (l.personAId === fromId && l.personBId === toId && l.kind === linkKind) ||
        (l.personAId === toId && l.personBId === fromId),
    )
    if (dup) {
      toast.error('Ese vínculo ya existe')
      return false
    }
    addPersonLink({
      id: `lnk_${Date.now()}_${rand(6)}`,
      personAId: fromId,
      personBId: toId,
      kind: linkKind,
      createdAt: new Date().toISOString(),
    })
    track(EVENTS.familyLinkAdded, { kind: linkKind })
    return true
  }

  function handleLink() {
    const targetId = ensureTargetPerson()
    if (!targetId) return
    if (createLink(person.id, targetId, kind, KIND_LABEL[kind])) {
      toast.success('Familiar vinculado', {
        description: `${KIND_LABEL[kind]}: ${peopleById.get(targetId)?.name ?? query.trim()}`,
      })
      resetForm()
    }
  }

  function handleRemove(l: PersonLink) {
    removePersonLink(l.id)
    toast.success('Vínculo de familia eliminado')
  }

  function acceptPersonSuggestion(s: FamilySuggestion, targetId: string) {
    if (createLink(person.id, targetId, s.kind, KIND_LABEL[s.kind])) {
      toast.success('Familiar vinculado', { description: `${KIND_LABEL[s.kind]}: ${peopleById.get(targetId)?.name ?? ''}` })
      dismiss(s.key)
    }
  }

  /** Setea (reemplazando) "esta persona es mi <kind>". Un único self-link por persona. */
  function setSelfLink(linkKind: FamilyKind) {
    for (const l of links) {
      if (l.personAId === SELF_ID && l.personBId === person.id) removePersonLink(l.id)
    }
    addPersonLink({
      id: `lnk_${Date.now()}_${rand(6)}`,
      personAId: SELF_ID,
      personBId: person.id,
      kind: linkKind,
      createdAt: new Date().toISOString(),
    })
    setEditingSelf(false)
    toast.success(`Es tu ${KIND_LABEL[linkKind].toLowerCase()}`, { description: person.name })
  }

  function removeSelfLink() {
    if (selfLink) removePersonLink(selfLink.id)
    setEditingSelf(false)
    toast.success('Vínculo personal eliminado')
  }

  const showSelfSetter = !selfLink || editingSelf

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Users size={14} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
            <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">
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

        {/* ─── Tu vínculo con esta persona (self↔persona) ──────────────── */}
        <div className="mb-4 rounded-md border border-border/60 p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Heart size={12} strokeWidth={1.75} className="text-brand/80" aria-hidden="true" />
            <span className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Tu vínculo con esta persona</span>
          </div>

          {selfLink && !editingSelf ? (
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm">
                Es tu <span className="text-foreground font-medium">{(KIND_LABEL[selfLink.kind] ?? selfLink.kind).toLowerCase()}</span>.
              </p>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button type="button" className="text-[11px] underline text-muted-foreground hover:text-foreground" onClick={() => { setSelfKind(selfLink.kind); setEditingSelf(true) }}>
                  cambiar
                </button>
                <button
                  type="button"
                  onClick={removeSelfLink}
                  className="flex items-center justify-center h-7 w-7 rounded text-muted-foreground/50 hover:text-bad"
                  aria-label="Quitar tu vínculo con esta persona"
                >
                  <X size={13} strokeWidth={1.75} />
                </button>
              </div>
            </div>
          ) : null}

          {showSelfSetter && (
            <div className="space-y-2">
              <p className="text-[11px] text-muted-foreground/70">¿Quién es esta persona para vos?</p>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Select value={selfKind} onValueChange={(v) => setSelfKind(v as FamilyKind)}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {KIND_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button size="sm" onClick={() => setSelfLink(selfKind)}>
                  Es mi {KIND_LABEL[selfKind].toLowerCase()}
                </Button>
                {selfLink && (
                  <Button size="sm" variant="ghost" onClick={() => setEditingSelf(false)}>Cancelar</Button>
                )}
              </div>

              {/* Sugerencias self↔persona (inferencia transitiva con el nodo "yo"). */}
              {selfSuggestions.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  {selfSuggestions.map((s) => {
                    const via = peopleById.get(s.viaId)
                    return (
                      <div key={s.key} className="flex items-center justify-between gap-2 rounded-md bg-brand/[0.05] px-2.5 py-1.5">
                        <div className="min-w-0 text-[13px]">
                          <Sparkles size={11} strokeWidth={1.75} className="inline mr-1 text-brand align-[-1px]" aria-hidden="true" />
                          ¿Es tu <span className="text-foreground">{(KIND_LABEL[s.kind] ?? s.kind).toLowerCase()}</span>?
                          {via && <span className="text-muted-foreground/60"> vía {firstNameOf(via.name)}</span>}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button type="button" onClick={() => { setSelfLink(s.kind); dismiss(s.key) }} className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-ok hover:bg-ok/10">
                            <Check size={12} strokeWidth={2} /> Sí
                          </button>
                          <button type="button" onClick={() => dismiss(s.key)} className="flex items-center justify-center h-7 w-7 rounded text-muted-foreground/50 hover:text-bad" aria-label="Descartar">
                            <X size={12} strokeWidth={2} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {adding && (
          <div className="mb-4 space-y-3 rounded-md border border-border/60 p-3">
            <div>
              <Label htmlFor="fam-search" className="text-xs">Agregar familiar de esta persona</Label>
              <div className="relative mt-1">
                <Search
                  size={13}
                  strokeWidth={1.75}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 pointer-events-none"
                  aria-hidden="true"
                />
                <Input
                  id="fam-search"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    setSelectedTargetId(null)
                  }}
                  placeholder="Ej: María (escribí para buscar)…"
                  className="pl-8"
                  autoFocus
                  autoComplete="off"
                />
              </div>

              {/* Resultados del autocompletar: personas existentes + crear nueva. */}
              {query.trim() && !selectedTargetId && (
                <ul className="mt-1.5 rounded-md border border-border/60 divide-y divide-border/40 overflow-hidden">
                  {candidates.map((c) => (
                    <li key={c.person.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTargetId(c.person.id)
                          setQuery(c.person.name)
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex items-center justify-between gap-2"
                      >
                        <span className="truncate">{c.person.name}</span>
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground/60 flex-shrink-0">
                          existe
                        </span>
                      </button>
                    </li>
                  ))}
                  <li>
                    <button
                      type="button"
                      onClick={handleLink}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex items-center gap-2 text-brand"
                    >
                      <UserPlus size={13} strokeWidth={1.75} className="flex-shrink-0" />
                      Crear «{query.trim()}» como persona nueva
                    </button>
                  </li>
                </ul>
              )}

              {selectedTargetId && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Vinculando a <span className="text-foreground">{peopleById.get(selectedTargetId)?.name}</span>.{' '}
                  <button type="button" className="underline hover:text-foreground" onClick={() => { setSelectedTargetId(null); setQuery('') }}>
                    cambiar
                  </button>
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="fam-kind" className="text-xs">Parentesco (respecto de {firstNameOf(person.name)})</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as FamilyKind)}>
                <SelectTrigger id="fam-kind" className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {KIND_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
              Enlaza a una persona REAL del grafo (no texto). En la ficha de esa persona aparece el vínculo inverso automáticamente.
            </p>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={resetForm}>Cancelar</Button>
              <Button size="sm" onClick={handleLink} disabled={!query.trim()}>Vincular</Button>
            </div>
          </div>
        )}

        {/* Sugerencias sobre la familia de esta persona (inferencia + reconciliación). */}
        {personSuggestions.length > 0 && (
          <div className="mb-4 space-y-2 rounded-md border border-brand/25 bg-brand/[0.04] p-3">
            <div className="flex items-center gap-1.5">
              <Sparkles size={12} strokeWidth={1.75} className="text-brand" aria-hidden="true" />
              <span className="text-[11px] uppercase tracking-[0.07em] text-brand/90">Sugerencias</span>
            </div>
            <ul className="space-y-2">
              {personSuggestions.map((s) => (
                <SuggestionRow
                  key={s.key}
                  suggestion={s}
                  subjectFirstName={firstNameOf(person.name)}
                  peopleById={peopleById}
                  onAccept={(targetId) => acceptPersonSuggestion(s, targetId)}
                  onDismiss={() => dismiss(s.key)}
                />
              ))}
            </ul>
          </div>
        )}

        {familyRows.length === 0 ? (
          !adding && (
            <p className="text-sm text-muted-foreground">
              Sin familiares vinculados. <span className="text-muted-foreground/60">Opcional — agregá padre, madre, hermanos, etc.</span>
            </p>
          )
        ) : (
          <ul className="space-y-1.5">
            {familyRows.map((r) => {
              const target = peopleById.get(r.otherId)
              const targetName = target?.name ?? '(persona eliminada)'
              const slug = target?.slug
              return (
                <li key={r.link.id} className="flex items-center justify-between gap-2 py-1 border-b border-border/40 last:border-0">
                  <div className="min-w-0 flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 w-20 flex-shrink-0">
                      {r.roleLabel}
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
                    onClick={() => handleRemove(r.link)}
                    className="flex items-center justify-center h-8 w-8 -m-1.5 rounded text-muted-foreground/50 hover:text-bad flex-shrink-0"
                    aria-label={`Quitar vínculo ${r.roleLabel}`}
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

/** Una fila de sugerencia sobre la familia de ESTA persona (inferencia o
 *  reconciliación), con aceptar/descartar. */
function SuggestionRow({
  suggestion,
  subjectFirstName,
  peopleById,
  onAccept,
  onDismiss,
}: {
  suggestion: FamilySuggestion
  subjectFirstName: string
  peopleById: Map<string, Person>
  onAccept: (targetId: string) => void
  onDismiss: () => void
}) {
  const kindLabel = KIND_LABEL[suggestion.kind] ?? suggestion.kind

  if (suggestion.source === 'inference') {
    const target = peopleById.get(suggestion.targetId)
    const via = peopleById.get(suggestion.viaId)
    if (!target) return null
    return (
      <li className="flex items-start justify-between gap-2">
        <div className="min-w-0 text-sm">
          <span className="text-foreground">{target.name}</span>{' '}
          <span className="text-muted-foreground">podría ser <span className="text-foreground">{kindLabel.toLowerCase()}</span> de {subjectFirstName}</span>
          {via && (
            <span className="block text-[11px] text-muted-foreground/60">vía {via.name}</span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={() => onAccept(suggestion.targetId)}
            className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-ok hover:bg-ok/10"
          >
            <Check size={12} strokeWidth={2} /> Aceptar
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="flex items-center justify-center h-7 w-7 rounded text-muted-foreground/50 hover:text-bad"
            aria-label="Descartar sugerencia"
          >
            <X size={12} strokeWidth={2} />
          </button>
        </div>
      </li>
    )
  }

  // Reconciliación de texto libre.
  return (
    <li className="space-y-1">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 text-sm">
          <span className="text-muted-foreground">Notas dicen </span>
          <span className="text-foreground">{kindLabel.toLowerCase()}: «{suggestion.rawName}»</span>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="flex items-center justify-center h-7 w-7 rounded text-muted-foreground/50 hover:text-bad flex-shrink-0"
          aria-label="Descartar sugerencia"
        >
          <X size={12} strokeWidth={2} />
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {suggestion.candidates.length === 0 ? (
          <span className="text-[11px] text-muted-foreground/60">Sin coincidencias entre tus personas — agregalo manualmente arriba.</span>
        ) : (
          suggestion.candidates.slice(0, 3).map((c) => {
            const p = peopleById.get(c.personId)
            if (!p) return null
            return (
              <button
                key={c.personId}
                type="button"
                onClick={() => onAccept(c.personId)}
                className={cn(
                  'flex items-center gap-1 rounded-full border border-border/60 px-2.5 py-1 text-[11px] hover:bg-muted/50',
                )}
              >
                <Check size={11} strokeWidth={2} className="text-ok" /> {p.name}
              </button>
            )
          })
        )}
      </div>
    </li>
  )
}
