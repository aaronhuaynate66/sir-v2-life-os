'use client'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { track, EVENTS } from '@/lib/analytics/track'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { AnimatePresence, motion } from 'framer-motion'
import { Target, Plus, Archive, ListChecks, ChevronRight, Sparkles, Anchor } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SectionTitle } from '@/components/ui/section-title'
import { EmptyState } from '@/components/ui/empty-state'
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
  AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { useGoalStore } from '@/stores/useGoalStore'
import { useObjectiveStepStore } from '@/stores/useObjectiveStepStore'
import { useMemoryStore } from '@/stores'
import { useRelationshipStore } from '@/stores/useRelationshipStore'
import { AlignmentPanel } from '@/components/objetivos/AlignmentPanel'
import { ObjectiveSteps } from '@/components/objetivos/ObjectiveSteps'
import { TrackerStrip } from '@/components/trackers/TrackerStrip'
import { SmartAssist } from '@/components/objetivos/SmartAssist'
import { SmartWizard } from '@/components/objetivos/SmartWizard'
import { computeObjectiveProgress } from '@/lib/objectives/steps'
import { isGoalSmartComplete, missingSmartFields } from '@/lib/objectives/smart'
import { togglePersonId, sanitizePersonIds } from '@/lib/goals/relatedPersons'
import { buildGoalDashboard } from '@/engines/goal'
import { createGoalProgressMemory } from '@/engines/memory'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { RouteSkeleton } from '@/components/skeletons/RouteSkeleton'
import { cn } from '@/lib/utils'
import type { GoalCategory, GoalPriority, Goal } from '@/types'

const CAT_LABEL: Record<GoalCategory, string> = {
  financial: 'Financiero', personal: 'Personal', relational: 'Relacional',
  health: 'Salud', career: 'Carrera', spiritual: 'Espiritual', creative: 'Creativo',
}
const PRIO_LABEL: Record<GoalPriority, string> = { critical: 'Crítico', high: 'Alto', medium: 'Medio', low: 'Bajo' }
const PRIO_CLASS: Record<GoalPriority, string> = {
  critical: 'border-bad/30 bg-bad-soft text-bad-foreground',
  high: 'border-warn/30 bg-warn-soft text-warn-foreground',
  medium: 'border-brand/30 bg-brand-soft text-brand-soft-foreground',
  low: 'border-border bg-muted text-muted-foreground',
}
const STATUS_COLORS: Record<Goal['status'], string> = {
  active: 'text-ok', paused: 'text-warn',
  completed: 'text-brand-soft-foreground', abandoned: 'text-muted-foreground/50',
}
const STATUS_LABEL: Record<Goal['status'], string> = {
  active: 'activo', paused: 'pausado',
  completed: 'completado', abandoned: 'abandonado',
}

const cardClass = 'transition-colors duration-200 hover:border-border-strong'

export default function GoalsPage() {
  const hydrated = useHasHydrated()
  if (!hydrated) return <RouteSkeleton cards={4} />
  return (
    <Suspense fallback={<RouteSkeleton cards={4} />}>
      <GoalsContent />
    </Suspense>
  )
}

function GoalsContent() {
  const { goals, addGoal, updateGoal, updateGoalProgress, completeGoal, pauseGoal, removeGoal, setAnchor } = useGoalStore()
  // Deep-link desde "TU AÑO" (Mission Control): ?goal=<id> → scroll + highlight.
  const params = useSearchParams()
  const focusGoalId = params.get('goal')
  const [highlightId, setHighlightId] = useState<string | null>(null)
  useEffect(() => {
    if (!focusGoalId) return
    const el = document.getElementById(`goal-${focusGoalId}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightId(focusGoalId)
    const t = setTimeout(() => setHighlightId(null), 2200)
    return () => clearTimeout(t)
  }, [focusGoalId])
  const objectiveSteps = useObjectiveStepStore((s) => s.steps)
  const { addMemory, memories } = useMemoryStore()
  const { people, relationships } = useRelationshipStore()
  const dash = useMemo(() => buildGoalDashboard(goals), [goals])

  // Pasos por objetivo (para rollup y para el toggle de la lista).
  const stepsByGoal = useMemo(() => {
    const map = new Map<string, typeof objectiveSteps>()
    for (const s of objectiveSteps) {
      const arr = map.get(s.objectiveId)
      if (arr) arr.push(s)
      else map.set(s.objectiveId, [s])
    }
    return map
  }, [objectiveSteps])

  // El progreso del objetivo se calcula del rollup OKR cuando hay KRs: promedio
  // de % de cada KR → goal.progress (fuente única para dashboard, alineación y
  // agenda). Sólo objetivos ACTIVOS; idempotente (sólo escribe si difiere) →
  // converge en una pasada, sin loop. Si no hay KRs, no toca nada (cae al
  // progreso manual).
  useEffect(() => {
    for (const g of goals) {
      if (g.status !== 'active') continue
      const prog = computeObjectiveProgress(stepsByGoal.get(g.id) ?? [], g.id)
      if (prog && prog.percent !== g.progress) {
        updateGoalProgress(g.id, prog.percent)
      }
    }
  }, [goals, stepsByGoal, updateGoalProgress])

  const [adding, setAdding] = useState(false)
  // "Contale a SIR": relato libre → IA propone el objetivo → prefilla el form.
  const [aiOpen, setAiOpen] = useState(false)
  const [aiText, setAiText] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiReason, setAiReason] = useState<string | null>(null)
  const [aiUnmatched, setAiUnmatched] = useState<string[]>([])
  const [stepsOpenId, setStepsOpenId] = useState<string | null>(null)
  // Wizard de definición SMART (gating del plan IA) + disparo de generación.
  const [wizardGoalId, setWizardGoalId] = useState<string | null>(null)
  const [autoGenId, setAutoGenId] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [progressId, setProgressId] = useState<string | null>(null)
  const [progressVal, setProgressVal] = useState('')
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [cat, setCat] = useState<GoalCategory>('personal')
  const [prio, setPrio] = useState<GoalPriority>('medium')
  const [targetDate, setTargetDate] = useState('')
  const [nextAction, setNextAction] = useState('')
  const [peaceImpact, setPeaceImpact] = useState('5')
  const [relatedPersons, setRelatedPersons] = useState<string[]>([])
  // SMART (mig 0042)
  const [target, setTarget] = useState('')
  const [baseline, setBaseline] = useState('')
  const [why, setWhy] = useState('')
  // Ancla del año (mig 0060): subtítulo corto opcional.
  const [anchorSubtitle, setAnchorSubtitle] = useState('')

  async function runGoalSuggest() {
    const text = aiText.trim()
    if (text.length < 8 || aiLoading) return
    setAiLoading(true); setAiError(null)
    try {
      const res = await fetch('/api/objetivos/suggest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const data = await res.json()
      if (!res.ok) { setAiError(data?.error ?? 'No se pudo armar el objetivo'); return }
      const sug = data.suggestion as {
        title: string; description: string; category: GoalCategory; priority: GoalPriority
        peaceImpact: number; nextAction: string; targetDate: string | null
        relatedPersonNames: string[]; reasoning: string
      }
      setEditId(null)
      setTitle(sug.title); setDesc(sug.description); setCat(sug.category); setPrio(sug.priority)
      setPeaceImpact(String(sug.peaceImpact)); setNextAction(sug.nextAction)
      setTargetDate(sug.targetDate ?? '')
      setTarget(''); setBaseline(''); setWhy(''); setAnchorSubtitle('')
      // Matchear personas mencionadas a contactos existentes.
      const matched: string[] = []; const unmatched: string[] = []
      for (const nm of sug.relatedPersonNames) {
        const low = nm.toLowerCase()
        const hit = people.find((pp) => pp.name.toLowerCase().includes(low) || low.includes(pp.name.toLowerCase()))
        if (hit) matched.push(hit.id); else unmatched.push(nm)
      }
      setRelatedPersons(matched); setAiUnmatched(unmatched); setAiReason(sug.reasoning)
      setAiOpen(false); setAiText(''); setAdding(true)
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Error de red')
    } finally {
      setAiLoading(false)
    }
  }

  function resetForm() {
    setTitle(''); setDesc(''); setCat('personal'); setPrio('medium')
    setTargetDate(''); setNextAction(''); setPeaceImpact('5'); setRelatedPersons([])
    setTarget(''); setBaseline(''); setWhy(''); setAnchorSubtitle('')
    setAiReason(null); setAiUnmatched([])
    setAdding(false); setEditId(null)
  }
  const savingGuardRef = useRef(false)
  function saveGoal() {
    if (savingGuardRef.current) return
    if (!title.trim()) { toast.error('Título requerido', { description: 'El título no puede estar vacío.' }); return }
    const pi = parseInt(peaceImpact)
    if (isNaN(pi) || pi < 1 || pi > 10) { toast.error('Impacto inválido', { description: 'El impacto de paz debe estar entre 1 y 10.' }); return }
    const now = new Date().toISOString()
    const linkedPersons = sanitizePersonIds(relatedPersons, new Set(people.map((p) => p.id)))
    const smart = { target: target.trim() || undefined, baseline: baseline.trim() || undefined, why: why.trim() || undefined }
    const anchorMeta = { anchorSubtitle: anchorSubtitle.trim() || undefined }
    if (editId) {
      updateGoal(editId, { title, description: desc, category: cat, priority: prio, targetDate: targetDate || undefined, nextAction, peaceImpact: pi, relatedPersons: linkedPersons, ...smart, ...anchorMeta })
      toast.success('Objetivo actualizado', { description: title })
    } else {
      const g: Goal = {
        id: 'g_' + Date.now(), title, description: desc, category: cat, priority: prio,
        status: 'active', progress: 0, milestones: [], relatedGoals: [], relatedPersons: linkedPersons,
        peaceImpact: pi, obstacles: [], nextAction, targetDate: targetDate || undefined,
        ...smart, ...anchorMeta,
        createdAt: now, updatedAt: now,
      }
      addGoal(g)
      track(EVENTS.objectiveCreated)
      toast.success('Objetivo creado', { description: title })
    }
    savingGuardRef.current = true
    resetForm()
    setTimeout(() => { savingGuardRef.current = false }, 600)
  }
  function startEdit(g: Goal) {
    setEditId(g.id); setTitle(g.title); setDesc(g.description); setCat(g.category)
    setPrio(g.priority); setTargetDate(g.targetDate || ''); setNextAction(g.nextAction || '')
    setPeaceImpact(String(g.peaceImpact)); setRelatedPersons(g.relatedPersons ?? [])
    setTarget(g.target ?? ''); setBaseline(g.baseline ?? ''); setWhy(g.why ?? '')
    setAnchorSubtitle(g.anchorSubtitle ?? '')
    setAdding(true)
  }

  function handleToggleAnchor(g: Goal) {
    const next = !g.isAnchor
    setAnchor(g.id, next)
    toast.success(next ? 'Norte del año' : 'Norte quitado', {
      description: next ? `"${g.title}" es ahora el norte de tu año.` : g.title,
    })
  }
  function cancelProgress() {
    setProgressId(null); setProgressVal('')
  }
  function saveProgress() {
    if (!progressId) return
    const v = parseInt(progressVal)
    if (isNaN(v) || v < 0 || v > 100) { toast.error('Progreso inválido', { description: 'Debe estar entre 0 y 100.' }); return }
    const goal = goals.find(g => g.id === progressId); if (!goal) return
    const previousProgress = goal.progress
    updateGoalProgress(progressId, v)
    if (v !== previousProgress) addMemory(createGoalProgressMemory(goal, previousProgress, v))
    setProgressId(null); setProgressVal('')
    toast.success('Progreso actualizado', { description: `${goal.title}: ${previousProgress}% → ${v}%` })
  }
  function handleComplete(g: Goal) {
    completeGoal(g.id)
    toast.success('Objetivo completado', { description: g.title })
  }
  function handlePause(g: Goal) {
    pauseGoal(g.id)
  }
  function handleDelete(g: Goal) {
    removeGoal(g.id)
    toast.success('Objetivo eliminado', { description: g.title })
    toast.success('Objetivo pausado', { description: g.title })
  }
  function handleReactivate(g: Goal) {
    updateGoal(g.id, { status: 'active' })
    toast.success('Objetivo reactivado', { description: g.title })
  }

  const wizardGoal = wizardGoalId ? goals.find((g) => g.id === wizardGoalId) ?? null : null

  const activeGoals = goals.filter(g => g.status === 'active').sort((a, b) => {
    const po: Record<GoalPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 }
    return po[a.priority] - po[b.priority]
  })
  const otherGoals = goals.filter(g => g.status !== 'active')

  const stats = [
    { label: 'Activos', value: String(dash.activeGoals.length) },
    { label: 'Criticos', value: String(dash.criticalGoals.length) },
    { label: 'Completados', value: String(goals.filter(g => g.status === 'completed').length) },
    { label: 'Progreso prom.', value: activeGoals.length ? Math.round(activeGoals.reduce((s, g) => s + g.progress, 0) / activeGoals.length) + '%' : '—' },
  ]

  return (
    <AppShell>
      <div className="mb-8 flex justify-between items-start gap-3 flex-wrap">
        <div>
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary mb-1">SIR V2</div>
          <div className="flex items-center gap-3 mt-1">
            <Target size={28} strokeWidth={1.5} className="text-muted-foreground" />
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Objetivos</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">Dirección, paz e impacto en vida</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { setAiOpen((v) => !v); setAiError(null) }}>
            <Sparkles size={13} className="mr-1.5" />{aiOpen ? 'Cerrar' : 'Contale a SIR'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAdding(!adding)}>{adding ? 'Cancelar' : '+ Nuevo objetivo'}</Button>
        </div>
      </div>

      {aiOpen && (
        <Card className={cn('mb-4', cardClass)}>
          <CardContent className="p-4 sm:p-6 space-y-3">
            <SectionTitle icon={Sparkles} label="Contale a SIR" />
            <p className="text-xs text-muted-foreground">
              Escribí en tus palabras qué objetivo querés (ej. una charla que tuviste). SIR arma un borrador editable — vos confirmás. No inventa fechas.
            </p>
            <textarea
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
              disabled={aiLoading}
              rows={5}
              placeholder="Ej: Hablé con Guillermo y me dijo que el RIT de los bomberos quizás abra un curso. Quiero entrar cuando se abra; el aviso depende de él. Me pongo a entrenar."
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            />
            {aiError && <p className="text-xs text-bad">{aiError}</p>}
            <div className="flex justify-end">
              <Button size="sm" onClick={runGoalSuggest} disabled={aiLoading || aiText.trim().length < 8}>
                {aiLoading ? 'Armando…' : 'Armar objetivo'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {stats.map((s) => (
          <Card key={s.label} className={cardClass}>
            <CardContent className="p-3 sm:p-4">
              <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary mb-1">{s.label}</div>
              <div className="text-xl sm:text-2xl font-mono font-bold tabular-nums text-foreground">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <AlignmentPanel goals={goals} people={people} relationships={relationships} memories={memories} />

      {/* Render condicional simple (sin AnimatePresence): la animación de salida
          con height:auto dejaba el form como FANTASMA en el DOM tras guardar
          (no desmontaba), permitiendo un segundo submit → duplicados. */}
      {adding && (
        <div className="mb-1">
            <Card className={cn('mb-4', cardClass)}>
              <CardContent className="p-4 sm:p-6">
                <SectionTitle icon={Plus} label={editId ? 'Editar objetivo' : 'Nuevo objetivo'} />
                {aiReason && !editId && (
                  <div className="mb-3 rounded-md border border-brand/20 bg-brand-soft/20 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-mono mb-1">
                      <Sparkles size={11} className="inline mr-1" />Propuesta de SIR — revisá y ajustá
                    </p>
                    <p className="text-xs text-foreground/90 leading-snug">{aiReason}</p>
                    {aiUnmatched.length > 0 && (
                      <p className="text-[11px] text-warn mt-1.5">
                        No encontré en tus contactos: {aiUnmatched.join(', ')}. Crealos en Relaciones y vinculalos después.
                      </p>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                  <Input placeholder="Título" value={title} onChange={e => setTitle(e.target.value)} className="sm:col-span-2" />
                  <Input placeholder="Descripción" value={desc} onChange={e => setDesc(e.target.value)} className="sm:col-span-2" />
                  <Select value={cat} onValueChange={(v) => setCat(v as GoalCategory)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(CAT_LABEL) as GoalCategory[]).map(c => <SelectItem key={c} value={c}>{CAT_LABEL[c]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={prio} onValueChange={(v) => setPrio(v as GoalPriority)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(PRIO_LABEL) as GoalPriority[]).map(p => <SelectItem key={p} value={p}>{PRIO_LABEL[p]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} className="font-mono" />
                  <Input type="number" min="1" max="10" placeholder="Impacto paz (1-10)" value={peaceImpact} onChange={e => setPeaceImpact(e.target.value)} className="font-mono" />
                  <Input placeholder="Siguiente acción" value={nextAction} onChange={e => setNextAction(e.target.value)} className="sm:col-span-2" />
                  <div className="sm:col-span-2">
                    <Input placeholder="Subtítulo del norte (ej. Al Khobar · Taekwondo +80kg) · opcional" value={anchorSubtitle} onChange={e => setAnchorSubtitle(e.target.value)} />
                    <p className="text-[10px] text-muted-foreground/60 mt-1">
                      Solo si marcás este objetivo como <span className="font-mono text-foreground/80">tu norte del año</span>. Si lo dejás vacío, la brújula deriva el detalle del target o la descripción.
                    </p>
                  </div>

                  {/* ─── Definición SMART (medible + por qué) ─── */}
                  <div className="sm:col-span-2 rounded-md border border-border/50 bg-muted/20 p-3 space-y-2">
                    <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">
                      Definición SMART <span className="text-muted-foreground/50 normal-case tracking-normal">· medible + por qué</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Input placeholder="Meta medible (ej. Pesar 75 kg)" value={target} onChange={e => setTarget(e.target.value)} />
                      <Input placeholder="Hoy estás (ej. 82 kg) · opcional" value={baseline} onChange={e => setBaseline(e.target.value)} />
                      <Input placeholder="Por qué importa" value={why} onChange={e => setWhy(e.target.value)} className="sm:col-span-2" />
                    </div>
                    <SmartAssist
                      draft={{ title, description: desc, category: cat, targetDate }}
                      onApply={(f) => {
                        setTarget(f.target)
                        if (f.baseline !== undefined) setBaseline(f.baseline)
                        if (f.why !== undefined) setWhy(f.why)
                        if (f.suggestedTargetDate && !targetDate) setTargetDate(f.suggestedTargetDate)
                        toast.success('Definición SMART aplicada', { description: f.target })
                      }}
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary mb-1.5">
                      Personas vinculadas <span className="text-muted-foreground/50 normal-case tracking-normal">· opcional</span>
                    </div>
                    {people.length === 0 ? (
                      <p className="text-xs text-muted-foreground/70">
                        Opcional. Si este objetivo involucra a alguien, vas a poder vincular personas cuando las agregues en <span className="font-mono text-foreground/80">/relaciones</span>.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {people.map((p) => {
                          const active = relatedPersons.includes(p.id)
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => setRelatedPersons((ids) => togglePersonId(ids, p.id))}
                              aria-pressed={active}
                              className={cn(
                                'text-[11px] rounded-full border px-2.5 py-0.5 transition-colors',
                                active
                                  ? 'border-accent/50 bg-accent/10 text-foreground'
                                  : 'border-border text-muted-foreground hover:border-accent/40 hover:text-foreground',
                              )}
                            >
                              {p.name}
                            </button>
                          )
                        })}
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground/60 mt-1.5">
                      Opcional. La mayoría de los objetivos personales no involucran a nadie. Si este sí,
                      vinculá personas para ver señales de alineación (declarado ↔ comportamiento observado).
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={saveGoal}>{editId ? 'Guardar' : '+ Agregar objetivo'}</Button>
                  <Button variant="ghost" size="sm" onClick={resetForm}>Cancelar</Button>
                </div>
              </CardContent>
            </Card>
        </div>
      )}

      {activeGoals.length === 0 && !adding ? (
        <EmptyState
          icon={Target}
          title="Sin objetivos activos."
          hint="Creá tu primer objetivo para empezar a medir tu paz."
          action={<Button variant="outline" size="sm" onClick={() => setAdding(true)}>+ Crear primer objetivo</Button>}
        />
      ) : (
        <div className="space-y-2 mb-6">
          {activeGoals.map((g) => {
            const gSteps = stepsByGoal.get(g.id) ?? []
            const rollup = computeObjectiveProgress(gSteps, g.id)
            const hasSteps = rollup != null
            const displayPct = rollup ? rollup.percent : g.progress
            const stepsOpen = stepsOpenId === g.id
            const smartOk = isGoalSmartComplete(g)
            const smartMissing = missingSmartFields(g).length
            return (
            <Card
              key={g.id}
              id={`goal-${g.id}`}
              className={cn(
                cardClass,
                'scroll-mt-24 transition-shadow',
                highlightId === g.id && 'ring-2 ring-brand/60',
                g.isAnchor && 'border-brand/40',
              )}
            >
              <CardContent className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 sm:gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-sm font-medium text-foreground">{g.title}</span>
                      {g.isAnchor && (
                        <Badge variant="outline" className="text-[10px] font-normal border-brand/30 bg-brand-soft text-brand-soft-foreground gap-1">
                          <Anchor size={10} strokeWidth={2} /> Norte del año
                        </Badge>
                      )}
                      <Badge variant="outline" className={cn('text-[10px] font-normal', PRIO_CLASS[g.priority])}>{PRIO_LABEL[g.priority]}</Badge>
                      <Badge variant="outline" className="text-[10px] font-normal">{CAT_LABEL[g.category]}</Badge>
                    </div>
                    {g.description && <p className="text-xs text-muted-foreground mb-2">{g.description}</p>}
                    {(g.target || g.why) && (
                      <div className="mb-2 space-y-0.5">
                        {g.target && (
                          <div className="flex items-start gap-1.5 text-xs text-foreground/90 flex-wrap">
                            <Target size={11} className="mt-0.5 text-brand-soft-foreground flex-shrink-0" aria-hidden="true" />
                            <span className="font-medium break-words min-w-0">{g.target}</span>
                            {g.baseline && <span className="text-muted-foreground break-words min-w-0">· hoy: {g.baseline}</span>}
                          </div>
                        )}
                        {g.why && <div className="text-[11px] text-muted-foreground/80 italic">Por qué: {g.why}</div>}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mb-1">
                      <div className="flex-1 h-1 bg-secondary rounded-full">
                        <div className="h-1 rounded-full bg-brand transition-all" style={{ width: displayPct + '%' }} />
                      </div>
                      <span className="text-xs font-mono tabular-nums text-muted-foreground w-8">{displayPct}%</span>
                    </div>
                    <div className="mb-2">
                      <button
                        type="button"
                        onClick={() => setStepsOpenId(stepsOpen ? null : g.id)}
                        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                        aria-expanded={stepsOpen}
                      >
                        <ChevronRight size={12} className={cn('transition-transform', stepsOpen && 'rotate-90')} />
                        <ListChecks size={12} />
                        Plan{hasSteps ? ` · ${rollup.done}/${rollup.total} KR` : ''}
                      </button>
                      {hasSteps && (
                        <span className="ml-2 text-[10px] text-muted-foreground/50">progreso por KRs</span>
                      )}
                    </div>
                    {/* CTA primario, gateado por definición SMART: definir → o → generar plan */}
                    <div className="mb-2 flex items-center gap-2 flex-wrap">
                      {smartOk ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-brand/30 text-brand-soft-foreground hover:bg-brand-soft"
                          onClick={() => { setStepsOpenId(g.id); setAutoGenId(g.id) }}
                        >
                          <Sparkles size={12} className="mr-1.5" />Generar plan con IA
                        </Button>
                      ) : (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-brand/30 text-brand-soft-foreground hover:bg-brand-soft"
                            onClick={() => setWizardGoalId(g.id)}
                          >
                            <Sparkles size={12} className="mr-1.5" />Definir objetivo
                          </Button>
                          <span className="text-[10px] text-muted-foreground/60">
                            faltan {smartMissing}/5 SMART para el plan
                          </span>
                        </>
                      )}
                    </div>
                    {!hasSteps && progressId === g.id && (
                      <div className="flex gap-2 mb-2 flex-wrap">
                        <Input type="number" min="0" max="100" placeholder="% nuevo progreso" value={progressVal} onChange={e => setProgressVal(e.target.value)} className="flex-1 min-w-0 max-w-[10rem] font-mono" />
                        <Button variant="outline" size="sm" onClick={saveProgress}>Guardar</Button>
                        <Button variant="ghost" size="sm" onClick={cancelProgress}>Cancelar</Button>
                      </div>
                    )}
                    <div className="flex gap-4 text-[10px] text-muted-foreground/70 flex-wrap">
                      {g.nextAction && <span>siguiente: <span className="text-muted-foreground">{g.nextAction}</span></span>}
                      {g.targetDate && <span>fecha: <span className="text-muted-foreground font-mono">{g.targetDate}</span></span>}
                      <span>paz: <span className="text-muted-foreground font-mono">+{g.peaceImpact}</span></span>
                    </div>
                  </div>
                  <div className="flex gap-1 flex-wrap sm:flex-shrink-0 sm:justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleAnchor(g)}
                      aria-pressed={!!g.isAnchor}
                      title={g.isAnchor ? 'Quitar como norte del año' : 'Marcar como norte del año'}
                      className={cn(g.isAnchor && 'text-brand-soft-foreground')}
                    >
                      <Anchor size={14} strokeWidth={1.75} className={cn(g.isAnchor && 'fill-current')} />
                      Ancla
                    </Button>
                    {!hasSteps && (
                      <Button variant="ghost" size="sm" onClick={() => { setProgressId(g.id === progressId ? null : g.id); setProgressVal(String(g.progress)) }}>%</Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => startEdit(g)}>Editar</Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" className="border-ok/30 bg-ok-soft text-ok-foreground hover:bg-ok/20 hover:text-ok-foreground">Completar</Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>¿Marcar como completado?</AlertDialogTitle>
                          <AlertDialogDescription>
                            &ldquo;{g.title}&rdquo; pasara al historial como completado.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleComplete(g)}>Completar</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm">Pausar</Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>¿Pausar este objetivo?</AlertDialogTitle>
                          <AlertDialogDescription>
                            &ldquo;{g.title}&rdquo; dejara de aparecer en activos. Puedes reactivarlo cuando quieras desde el historial.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handlePause(g)}>Pausar</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-bad hover:text-bad hover:bg-bad/10">Eliminar</Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>¿Eliminar este objetivo?</AlertDialogTitle>
                          <AlertDialogDescription>
                            &ldquo;{g.title}&rdquo; se borra para siempre (no va al historial). Esta acción no se puede deshacer.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(g)}>Eliminar</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
                <TrackerStrip objectiveId={g.id} className="mt-3" />
                <AnimatePresence initial={false}>
                  {stepsOpen && (
                    <motion.div
                      key="steps"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                      style={{ overflow: 'hidden' }}
                    >
                      <ObjectiveSteps
                        goal={g}
                        smartComplete={smartOk}
                        onRequestDefine={() => setWizardGoalId(g.id)}
                        autoGenerate={autoGenId === g.id}
                        onAutoGenerateConsumed={() => setAutoGenId(null)}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </CardContent>
            </Card>
            )
          })}
        </div>
      )}

      {otherGoals.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Archive size={14} strokeWidth={1.75} className="text-muted-foreground/70" />
            <span className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary font-sans">Historial</span>
            <span className="text-[10px] font-mono tabular-nums text-muted-foreground/60 ml-auto">{otherGoals.length}</span>
          </div>
          <div className="space-y-1">
            {otherGoals.map((g) => (
              <div key={g.id} className="flex justify-between items-center py-2 border-b border-border/40 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{g.title}</span>
                  <Badge variant="outline" className="text-[10px] font-normal">{CAT_LABEL[g.category]}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn('text-[10px] font-mono', STATUS_COLORS[g.status])}>{STATUS_LABEL[g.status]}</span>
                  <Button variant="ghost" size="sm" onClick={() => handleReactivate(g)}>Reactivar</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {wizardGoal && (
        <SmartWizard goal={wizardGoal} onClose={() => setWizardGoalId(null)} />
      )}
    </AppShell>
  )
}
