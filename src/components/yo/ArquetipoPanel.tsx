'use client'
// SIR V2 — Espejo de Arquetipo (Motor #4). Sobre los MISMOS hitos reales de "Tu
// rumbo", SIR nombra el arquetipo que estás viviendo (junguiano) y el que te
// hace tensión, y cierra con la pregunta de autoría. Auto-conocimiento, no
// propaganda. La IA reformula tus hitos; no inventa.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Drama, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { SectionTitle } from '@/components/ui/section-title'
import { useGoalStore } from '@/stores/useGoalStore'
import { useRelationshipStore } from '@/stores/useRelationshipStore'
import { useSelfStore } from '@/stores/useSelfStore'
import { useMemoryStore } from '@/stores'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { buildLifeThread, relationshipMilestones, memoryMilestones, mergeLifeThread, type LifeMilestone } from '@/lib/self/lifeThread'
import { buildBondEvolution } from '@/lib/people/bondEvolution'
import type { ScoreSnapshot } from '@/lib/people/scoreTrend'
import type { ArquetipoResult } from '@/lib/self/arquetipoPrompt'

export function ArquetipoPanel() {
  const hydrated = useHasHydrated()
  const goals = useGoalStore((s) => s.goals)
  const people = useRelationshipStore((s) => s.people)
  const memories = useMemoryStore((s) => s.memories)
  const identityProfile = useSelfStore((s) => s.identityProfile)
  const [relMilestones, setRelMilestones] = useState<LifeMilestone[]>([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/person-score/snapshot')
        if (!res.ok) return
        const data = (await res.json()) as { snapshots?: { personId: string; dateBucket: string; global: number }[] }
        const rows = data.snapshots ?? []
        if (rows.length === 0) return
        const nameById = new Map(people.map((p) => [p.id, p.name]))
        const byPerson = new Map<string, ScoreSnapshot[]>()
        for (const r of rows) {
          const arr = byPerson.get(r.personId) ?? []
          arr.push({ dateBucket: r.dateBucket, global: r.global })
          byPerson.set(r.personId, arr)
        }
        const now = new Date()
        const out: LifeMilestone[] = []
        for (const [pid, snaps] of byPerson) {
          const name = nameById.get(pid)
          if (!name) continue
          out.push(...relationshipMilestones(name, buildBondEvolution(snaps, now).shifts))
        }
        if (!cancelled) setRelMilestones(out)
      } catch { /* fail-soft */ }
    })()
    return () => { cancelled = true }
  }, [people])

  const memMilestones = useMemo(() => memoryMilestones(memories), [memories])
  const thread = useMemo(
    () => mergeLifeThread(buildLifeThread(goals), relMilestones, memMilestones),
    [goals, relMilestones, memMilestones],
  )
  const shown = thread.slice(0, 12)
  const anchorText = useMemo(() => {
    const a = goals.find((g) => g.isAnchor)
    if (!a) return null
    const sub = (a.anchorSubtitle ?? '').trim()
    return `${a.title}${sub ? ` · ${sub}` : ''}`
  }, [goals])
  const identitySummary = useMemo(() => {
    const p = identityProfile
    if (!p) return null
    const parts: string[] = []
    if (p.roles && p.roles.length > 0) parts.push(p.roles.slice(0, 4).join(', '))
    if (p.bio && p.bio.trim()) parts.push(p.bio.trim().slice(0, 160))
    return parts.length > 0 ? parts.join(' · ') : null
  }, [identityProfile])

  const [state, setState] = useState<{ status: 'idle' | 'loading' | 'ready' | 'error'; data?: ArquetipoResult; msg?: string }>({ status: 'idle' })

  const generar = useCallback(async () => {
    setState({ status: 'loading' })
    try {
      const res = await fetch('/api/self/arquetipo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ milestones: shown.map((m) => ({ label: m.label, date: m.date, kind: m.kind })), anchor: anchorText, identity: identitySummary }),
      })
      const data = (await res.json()) as ArquetipoResult & { error?: string; detail?: string }
      if (!res.ok || !data.archetype) { setState({ status: 'error', msg: data.detail || data.error || 'No se pudo leer.' }); return }
      setState({ status: 'ready', data })
    } catch { setState({ status: 'error', msg: 'No se pudo leer.' }) }
  }, [shown, anchorText, identitySummary])

  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <SectionTitle icon={Drama} label="Tu arquetipo" />
        <p className="mt-1 text-[13px] text-muted-foreground">
          ¿Qué historia estás viviendo? SIR la nombra desde tus hitos — para que decidas si es la que elegís.
        </p>

        {hydrated && shown.length < 2 && (
          <p className="mt-3 text-[13px] text-muted-foreground">Se teje a medida que ponés y movés objetivos. Necesito un par de hitos.</p>
        )}

        {shown.length >= 2 && state.status !== 'ready' && (
          <Button size="sm" className="mt-3" disabled={state.status === 'loading'} onClick={generar}>
            {state.status === 'loading' ? <Loader2 size={14} className="mr-1 animate-spin" /> : null}
            {state.status === 'loading' ? 'Leyendo…' : 'Leer mi arquetipo'}
          </Button>
        )}
        {state.status === 'error' && <p className="mt-2 text-[13px] text-red-500">{state.msg}</p>}

        {state.status === 'ready' && state.data && (
          <div className="mt-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-brand/15 px-3 py-1 text-[13px] font-semibold text-brand-soft-foreground">{state.data.archetype}</span>
              {state.data.tension && (
                <>
                  <span className="text-[12px] text-muted-foreground">en tensión con</span>
                  <span className="rounded-full border border-border px-3 py-1 text-[13px] text-foreground/80">{state.data.tension}</span>
                </>
              )}
            </div>
            <p className="mt-3 text-[13.5px] leading-relaxed text-foreground/90">{state.data.reflection}</p>
            <button type="button" onClick={generar} className="mt-2 text-[12px] text-muted-foreground underline underline-offset-2">Volver a leer</button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
