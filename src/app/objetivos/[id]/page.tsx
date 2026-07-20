'use client'
// SIR V2 — /objetivos/[id] · centro de mando de un objetivo. Reúne en una sola
// vista todo lo relacionado: significado (por qué + hitos), costos (relacional
// + material), episodio (gente involucrada), progreso y fricción. Los pasos se
// editan en /objetivos. Goals viven en el store del cliente → client component.
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { ArrowLeft, Target, Anchor, Users, ExternalLink, Pencil, Check, X as XIcon } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useGoalStore } from '@/stores/useGoalStore'
import { useRelationshipStore } from '@/stores/useRelationshipStore'
import dynamic from 'next/dynamic'
// Los 5 paneles de detalle de objetivo se apilan below-the-fold. Dynamic
// ssr:false los saca del First Load JS (era 236 KB).
const panelLoad = () => <div className="h-32 rounded-lg border border-border animate-pulse" />
const GoalMeaning = dynamic(() => import('@/components/objetivos/GoalMeaning').then((m) => ({ default: m.GoalMeaning })), { ssr: false, loading: panelLoad })
const ObjectivePlanPanel = dynamic(() => import('@/components/objetivos/ObjectivePlanPanel').then((m) => ({ default: m.ObjectivePlanPanel })), { ssr: false, loading: panelLoad })
const ExternalSignalsPanel = dynamic(() => import('@/components/objetivos/ExternalSignalsPanel').then((m) => ({ default: m.ExternalSignalsPanel })), { ssr: false, loading: panelLoad })
const GoalCosts = dynamic(() => import('@/components/objetivos/GoalCosts').then((m) => ({ default: m.GoalCosts })), { ssr: false, loading: panelLoad })
const GoalMoneyLinked = dynamic(() => import('@/components/objetivos/GoalMoneyLinked').then((m) => ({ default: m.GoalMoneyLinked })), { ssr: false, loading: () => null })
const GoalConflictFriction = dynamic(() => import('@/components/objetivos/GoalConflictFriction').then((m) => ({ default: m.GoalConflictFriction })), { ssr: false, loading: panelLoad })
import { matchEpisodesToGoal, type EpisodeLite } from '@/lib/goals/episodeFriction'

function firstName(n: string): string { return (n || '').trim().split(/\s+/)[0] || n }

export default function ObjetivoDetailPage() {
  const params = useParams()
  const id = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : ''
  const { goals, updateGoal } = useGoalStore()
  const { people } = useRelationshipStore()
  const goal = goals.find((g) => g.id === id)

  const [milestones, setMilestones] = useState<string[]>([])
  const [episodes, setEpisodes] = useState<EpisodeLite[]>([])
  const [conflicts, setConflicts] = useState<{ personId: string; value: number; note: string; date: string }[]>([])

  // Edición inline de la IDENTIDAD del objetivo (título · meta · baseline · por
  // qué · fecha). Antes esto forzaba un viaje a /objetivos aunque la página se
  // vende como "centro de mando" (UX audit). Los pasos siguen en su panel.
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ title: '', target: '', baseline: '', why: '', targetDate: '' })
  function startEdit() {
    if (!goal) return
    setForm({
      title: goal.title,
      target: goal.target ?? '',
      baseline: goal.baseline ?? '',
      why: goal.why ?? '',
      targetDate: goal.targetDate ? goal.targetDate.slice(0, 10) : '',
    })
    setEditing(true)
  }
  function saveEdit() {
    if (!goal) return
    const title = form.title.trim()
    if (!title) { toast.error('El título no puede quedar vacío'); return }
    updateGoal(goal.id, {
      title,
      target: form.target.trim() || undefined,
      baseline: form.baseline.trim() || undefined,
      why: form.why.trim() || undefined,
      targetDate: form.targetDate || undefined,
    })
    setEditing(false)
    toast.success('Objetivo actualizado')
  }

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
          <Card><CardContent className="p-5 text-sm text-muted-foreground">No encontré ese objetivo. Quizá lo recargas desde <Link href="/objetivos" className="text-primary hover:underline">Objetivos</Link>.</CardContent></Card>
        ) : (
          <>
            <header className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Target size={20} className="text-brand shrink-0" />
                {editing ? (
                  <Input
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    className="flex-1 min-w-[12rem] text-lg font-semibold"
                    placeholder="Título del objetivo"
                    aria-label="Título del objetivo"
                  />
                ) : (
                  <h1 className="text-2xl font-semibold tracking-tight">{goal.title}</h1>
                )}
                {goal.isAnchor && <Badge variant="outline" className="text-[10px] border-brand/30 bg-brand-soft text-brand-soft-foreground gap-1"><Anchor size={10} /> Norte del año</Badge>}
                {!editing && (
                  <button type="button" onClick={startEdit} className="ml-auto inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground" aria-label="Editar objetivo">
                    <Pencil size={13} /> Editar
                  </button>
                )}
              </div>

              {editing ? (
                <div className="space-y-3 rounded-lg border border-border bg-card p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="text-[11px] uppercase tracking-[0.06em] text-text-tertiary">Meta</span>
                      <Input value={form.target} onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))} placeholder="Ej: Pesar 75 kg" className="mt-1" />
                    </label>
                    <label className="block text-sm">
                      <span className="text-[11px] uppercase tracking-[0.06em] text-text-tertiary">Hoy (baseline)</span>
                      <Input value={form.baseline} onChange={(e) => setForm((f) => ({ ...f, baseline: e.target.value }))} placeholder="Ej: 82 kg" className="mt-1" />
                    </label>
                  </div>
                  <label className="block text-sm">
                    <span className="text-[11px] uppercase tracking-[0.06em] text-text-tertiary">Por qué importa</span>
                    <textarea
                      value={form.why}
                      onChange={(e) => setForm((f) => ({ ...f, why: e.target.value }))}
                      rows={2}
                      placeholder="Qué cambia en tu vida si lo logras."
                      className="mt-1 w-full rounded-md border border-input bg-secondary px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-[11px] uppercase tracking-[0.06em] text-text-tertiary">Fecha objetivo</span>
                    <Input type="date" value={form.targetDate} onChange={(e) => setForm((f) => ({ ...f, targetDate: e.target.value }))} className="mt-1 w-full sm:w-48" />
                  </label>
                  <div className="flex items-center gap-2 pt-1">
                    <Button size="sm" onClick={saveEdit}><Check size={14} className="mr-1" /> Guardar</Button>
                    <Button size="sm" variant="outline" onClick={() => setEditing(false)}><XIcon size={14} className="mr-1" /> Cancelar</Button>
                  </div>
                </div>
              ) : (
                goal.target && <div className="text-sm text-foreground/90"><span className="font-medium">Meta:</span> {goal.target}{goal.baseline ? ` · hoy: ${goal.baseline}` : ''}</div>
              )}

              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-secondary rounded-full"><div className="h-1.5 rounded-full bg-brand" style={{ width: `${Math.min(100, Math.max(0, goal.progress))}%` }} /></div>
                <span className="text-xs font-mono tabular-nums text-muted-foreground w-9">{Math.round(goal.progress)}%</span>
              </div>
            </header>

            <ObjectivePlanPanel goalId={goal.id} />
            <ExternalSignalsPanel goalId={goal.id} />
            <GoalMeaning why={goal.why} milestones={milestones} />
            <GoalCosts goalId={goal.id} relationalNames={epNames} />
            {/* Dinero REAL vinculado a este objetivo (rescate de finance_movements.related_goal) */}
            <GoalMoneyLinked goalId={goal.id} />

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

            <Link href="/objetivos" className="block text-center text-[12px] text-muted-foreground hover:text-foreground">Ver todos los objetivos →</Link>
          </>
        )}
      </main>
    </AppShell>
  )
}
