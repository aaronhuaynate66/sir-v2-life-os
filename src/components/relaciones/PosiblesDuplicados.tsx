'use client'
// SIR V2 — PosiblesDuplicados: señala personas que probablemente sean la misma
// (mismo nombre/alias normalizado o prefijo de tokens) y ofrece FUSIONAR desde
// acá con 1 click. El "canonical" es la persona del grupo con más tokens en
// el nombre (el más completo suele ganar); las demás muestran "Fusionar aquí →"
// que dispara POST /api/people/merge y las borra localmente al éxito.
//
// Se oculta si no hay nada que mostrar (cero ruido cuando el grafo está limpio).

import { useState } from 'react'
import Link from 'next/link'
import { AlertCircle, ArrowRight, Loader2 } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useRelationshipStore } from '@/stores'
import { findDuplicatePeople, type DupPerson } from '@/lib/people/duplicates'

function tokenCount(name: string): number {
  return name.trim().split(/\s+/).filter(Boolean).length
}

/** Elige la persona más "completa" del grupo (más tokens en el nombre). En
 *  caso de empate: la primera (order-stable). Aaron puede corregir manualmente
 *  luego editando el nombre del canonical si quiere. */
function pickCanonical(g: DupPerson[]): DupPerson {
  let best = g[0]
  let bestTokens = tokenCount(best.name)
  for (let i = 1; i < g.length; i++) {
    const t = tokenCount(g[i].name)
    if (t > bestTokens) { best = g[i]; bestTokens = t }
  }
  return best
}

export function PosiblesDuplicados() {
  const people = useRelationshipStore((s) => s.people)
  const removePerson = useRelationshipStore((s) => s.removePerson)

  const [busyId, setBusyId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const input: DupPerson[] = people.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    alias: p.alias,
  }))
  const groups = findDuplicatePeople(input)

  if (groups.length === 0) return null

  async function merge(canonicalId: string, duplicateId: string) {
    setBusyId(duplicateId); setErrorMsg(null)
    try {
      const res = await fetch('/api/people/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canonical_id: canonicalId, duplicate_id: duplicateId }),
      })
      const j = (await res.json()) as { ok?: boolean; error?: string; detail?: string }
      if (!res.ok || !j.ok) {
        setErrorMsg(j.error ?? `Error HTTP ${res.status}`)
        return
      }
      // Local: sacamos el duplicate del store. Realtime lo confirmará luego.
      removePerson(duplicateId)
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Card className="mb-6 shadow-none border-warn/30">
      <CardContent className="p-4 sm:p-6 space-y-3">
        <div className="flex items-center gap-2">
          <AlertCircle size={16} strokeWidth={1.75} className="text-warn-foreground/80" aria-hidden="true" />
          <h2 className="text-sm font-semibold tracking-tight">Posibles duplicados</h2>
          <Badge variant="secondary" className="text-[10px] font-mono">{groups.length}</Badge>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
          Estas personas parecen la misma. Marcá con <span className="text-foreground font-medium">Fusionar aquí</span> las
          que querés unir al nombre principal — se mueven observaciones, memorias, links, tags y notas al canónico, y la
          duplicada se borra. No hay undo, así que revisá antes.
        </p>
        {errorMsg && (
          <div className="rounded-md border border-bad/30 bg-bad-soft px-3 py-2 text-xs text-bad flex items-start gap-2">
            <AlertCircle size={12} strokeWidth={1.75} className="mt-0.5 flex-shrink-0" />
            <span className="leading-relaxed">{errorMsg}</span>
          </div>
        )}
        <div className="space-y-2">
          {groups.map((g, i) => {
            const canonical = pickCanonical(g)
            return (
              <div key={i} className="rounded-md border border-border bg-muted/20 p-3">
                <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary mb-1.5">
                  {canonical.name} · {g.length}
                </div>
                <ul className="space-y-1">
                  {g.map((p) => {
                    const isCanonical = p.id === canonical.id
                    return (
                      <li key={p.id} className="flex items-center gap-2">
                        <Link
                          href={p.slug ? `/relaciones/${p.slug}` : '#'}
                          className="flex-1 min-w-0 text-xs flex items-center justify-between gap-3 rounded px-2 py-1.5 hover:bg-accent/10"
                        >
                          <span className="text-foreground truncate">
                            {p.name}
                            {p.alias && <span className="text-muted-foreground"> · {p.alias}</span>}
                            {isCanonical && <Badge variant="outline" className="ml-2 text-[9px] border-ok/40 bg-ok-soft text-ok">canónica</Badge>}
                          </span>
                          <ArrowRight size={13} className="text-muted-foreground shrink-0" aria-hidden="true" />
                        </Link>
                        {!isCanonical && (
                          <button
                            type="button"
                            onClick={() => void merge(canonical.id, p.id)}
                            disabled={busyId != null}
                            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium text-foreground hover:bg-accent/10 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                            aria-label={`Fusionar ${p.name} dentro de ${canonical.name}`}
                          >
                            {busyId === p.id ? (
                              <>
                                <Loader2 size={11} className="animate-spin" strokeWidth={2} />
                                Fusionando…
                              </>
                            ) : (
                              <>Fusionar aquí →</>
                            )}
                          </button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
