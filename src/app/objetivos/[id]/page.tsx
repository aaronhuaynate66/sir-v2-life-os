'use client'
// SIR V2 — /objetivos/[id] · centro de mando de un objetivo. Reúne en una sola
// vista todo lo relacionado: significado (por qué + hitos), costos (relacional
// + material), episodio (gente involucrada), progreso y fricción. Los pasos se
// editan en /objetivos. Goals viven en el store del cliente → client component.
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Target, Anchor, Users, ExternalLink } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useGoalStore } from '@/stores/useGoalStore'
import { useRelationshipStore } from '@/stores/useRelationshipStore'
import { GoalMeaning } from '@/components/objetivos/GoalMeaning'
import { GoalCosts } from '@/components/objetivos/GoalCosts'
import { GoalConflictFriction } from '@/components/objetivos/GoalConflictFriction'
import { matchEpisodesToGoal, type EpisodeLite } from '@/lib/goals/episodeFriction'

function firstName(n: string): string { return (n || '').trim().split(/\s+/)[0] || n }

export default function ObjetivoDetailPage() {
  const params = useParams()
  const id = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : ''
  const { goals } = useGoalStore()
  const { people } = useRelationshipStore()
  const goal = goals.find((g) => g.id === id)

  const [milestones, setMilestones] = useState<string[]>([])
  const [episodes, setEpisodes] = useState<EpisodeLite[]>([])
  const [conflicts, setConflicts] = useState<{ personId: string; value: number; note: string; date: string }[]>([])

  useEffect(() => {
    if (!goal) return
    let alive = true
    void (async () => {
      try {
        const r = await fetch(`/api/objectives/meaning?q=${encodeURIComponent(`${goal.title} ${goal.description ?? ''}`)}`)
        if (r.ok) { const j = (await r.json()) as { milestones?: string[] }; if (alive) setMilestones(j.milestones ?? []) }
      } catch { /* */ }
      try {
        const r = await fetch('/api/moments?open=1')
        if (r.ok) { const j = (await r.json()) as { moments?: { title?: string; detail?: string | null; status: string; participantIds?: string[] }[] }; if (alive) setEpisodes((j.moments ?? []).map((m) => ({ id: '', title: m.title ?? '', detail: m.detail ?? null, status: m.status, participantIds: m.participantIds ?? [] }))) }
      } catch { /* */ }
      try {
        const r = await fetch('/api/relaciones/recent-conflicts')
        if (r.ok) { const j = (await r.json()) as { conflicts?: { personId: string; value: number; note: string; date: string }[] }; if (alive && Array.isArray(j.conflicts)) setConflicts(j.conflicts) }
      } catch { /* */ }
    })()
    return () => { alive = false }
  }, [goal])

  const ep = useMemo(() => (goal ? matchEpisodesToGoal(goal.title, goal.description, episodes)[0] : undefined), [goal, episodes])
  const epNames = useMemo(() => {
    if (!ep) return []
    const nameById = new Map(people.map((p) => [p.id, p.name]))
    return ep.participantIds.map((pid) => firstName(nameById.get(pid) ?? '')).filter(Boolean)
  }, [ep, people])

  return (
    <AppShell>
      <main className="mx-auto max-w-2xl px-4 py-6 space-y-5">
        <Link href="/objetivos" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={14} /> Objetivos
        </Link>

        {!goal ? (
          <Card><CardContent className="p-5 text-sm text-muted-foreground">No encontré ese objetivo. Quizá lo recargás desde <Link href="/objetivos" className="text-primary hover:underline">Objetivos</Link>.</CardContent></Card>
        ) : (
          <>
            <header className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Target size={20} className="text-[#14b8a6]" />
                <h1 className="text-2xl font-semibold tracking-tight">{goal.title}</h1>
                {goal.isAnchor && <Badge variant="outline" className="text-[10px] border-brand/30 bg-brand-soft text-brand-soft-foreground gap-1"><Anchor size={10} /> Norte del año</Badge>}
              </div>
              {goal.target && <div className="text-sm text-foreground/90"><span className="font-medium">Meta:</span> {goal.target}{goal.baseline ? ` · hoy: ${goal.baseline}` : ''}</div>}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-secondary rounded-full"><div className="h-1.5 rounded-full bg-brand" style={{ width: `${Math.min(100, Math.max(0, goal.progress))}%` }} /></div>
                <span className="text-xs font-mono tabular-nums text-muted-foreground w-9">{Math.round(goal.progress)}%</span>
              </div>
            </header>

            <GoalMeaning why={goal.why} milestones={milestones} />
            <GoalCosts goalId={goal.id} relationalNames={epNames} />

            {ep && (
              <Card>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.06em] text-text-tertiary"><Users size={12} /> Episodio en juego</div>
                  <div className="text-sm font-medium text-foreground">{ep.title}</div>
                  {epNames.length > 0 && <div className="text-[12px] text-foreground/80">Involucra a: {epNames.join(', ')}.</div>}
                  <Link href="/red" className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline"><ExternalLink size={11} /> Verlo en el grafo</Link>
                </CardContent>
              </Card>
            )}

            <GoalConflictFriction goal={{ title: goal.title, description: goal.description, relatedPersons: goal.relatedPersons }} conflicts={conflicts} people={people} isNorte={goal.isAnchor === true} />

            <Link href="/objetivos" className="block text-center text-[12px] text-muted-foreground hover:text-foreground">Editar pasos y detalles en Objetivos →</Link>
          </>
        )}
      </main>
    </AppShell>
  )
}
