'use client'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AnimatePresence, motion } from 'framer-motion'
import { Target, Plus, CheckCircle2, Archive, Activity } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SectionTitle } from '@/components/ui/section-title'
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
  AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { useGoalStore } from '@/stores/useGoalStore'
import { useMemoryStore } from '@/stores'
import { useRelationshipStore } from '@/stores/useRelationshipStore'
import { AlignmentPanel } from '@/components/objetivos/AlignmentPanel'
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
const PRIO_LABEL: Record<GoalPriority, string> = { critical: 'Critico', high: 'Alto', medium: 'Medio', low: 'Bajo' }
const PRIO_CLASS: Record<GoalPriority, string> = {
  critical: 'border-red-500/30 bg-red-500/10 text-red-400',
  high: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  medium: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
  low: 'border-border bg-muted text-muted-foreground',
}
const STATUS_COLORS: Record<Goal['status'], string> = {
  active: 'text-emerald-400', paused: 'text-amber-400',
  completed: 'text-blue-400', abandoned: 'text-muted-foreground/50',
}

const cardClass = 'shadow-none transition-colors duration-200 hover:border-primary/30'

export default function GoalsPage() {
  const hydrated = useHasHydrated()
  if (!hydrated) return <RouteSkeleton cards={4} />
  return <GoalsContent />
}

function GoalsContent() {
  const { goals, addGoal, updateGoal, updateGoalProgress, completeGoal, pauseGoal } = useGoalStore()
  const { addMemory } = useMemoryStore()
  const { people, relationships } = useRelationshipStore()
  const dash = useMemo(() => buildGoalDashboard(goals), [goals])
  const [adding, setAdding] = useState(false)
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

  function resetForm() {
    setTitle(''); setDesc(''); setCat('personal'); setPrio('medium')
    setTargetDate(''); setNextAction(''); setPeaceImpact('5'); setRelatedPersons([])
    setAdding(false); setEditId(null)
  }
  function saveGoal() {
    if (!title.trim()) { toast.error('Titulo requerido', { description: 'El titulo no puede estar vacio.' }); return }
    const pi = parseInt(peaceImpact)
    if (isNaN(pi) || pi < 1 || pi > 10) { toast.error('Impacto invalido', { description: 'El impacto de paz debe estar entre 1 y 10.' }); return }
    const now = new Date().toISOString()
    const linkedPersons = sanitizePersonIds(relatedPersons, new Set(people.map((p) => p.id)))
    if (editId) {
      updateGoal(editId, { title, description: desc, category: cat, priority: prio, targetDate: targetDate || undefined, nextAction, peaceImpact: pi, relatedPersons: linkedPersons })
      toast.success('Objetivo actualizado', { description: title })
    } else {
      const g: Goal = {
        id: 'g_' + Date.now(), title, description: desc, category: cat, priority: prio,
        status: 'active', progress: 0, milestones: [], relatedGoals: [], relatedPersons: linkedPersons,
        peaceImpact: pi, obstacles: [], nextAction, targetDate: targetDate || undefined,
        createdAt: now, updatedAt: now,
      }
      addGoal(g)
      toast.success('Objetivo creado', { description: title })
    }
    resetForm()
  }
  function startEdit(g: Goal) {
    setEditId(g.id); setTitle(g.title); setDesc(g.description); setCat(g.category)
    setPrio(g.priority); setTargetDate(g.targetDate || ''); setNextAction(g.nextAction || '')
    setPeaceImpact(String(g.peaceImpact)); setRelatedPersons(g.relatedPersons ?? []); setAdding(true)
  }
  function cancelProgress() {
    setProgressId(null); setProgressVal('')
  }
  function saveProgress() {
    if (!progressId) return
    const v = parseInt(progressVal)
    if (isNaN(v) || v < 0 || v > 100) { toast.error('Progreso invalido', { description: 'Debe estar entre 0 y 100.' }); return }
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
    toast.success('Objetivo pausado', { description: g.title })
  }
  function handleReactivate(g: Goal) {
    updateGoal(g.id, { status: 'active' })
    toast.success('Objetivo reactivado', { description: g.title })
  }

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
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mb-1">SIR V2</div>
          <div className="flex items-center gap-3 mt-1">
            <Target size={28} strokeWidth={1.5} className="text-muted-foreground" />
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Objetivos</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">Direccion, paz e impacto en vida</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setAdding(!adding)}>{adding ? 'Cancelar' : '+ Nuevo objetivo'}</Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {stats.map((s) => (
          <Card key={s.label} className={cardClass}>
            <CardContent className="p-3 sm:p-4">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-1">{s.label}</div>
              <div className="text-xl sm:text-2xl font-mono font-bold tabular-nums text-foreground">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <AlignmentPanel goals={goals} people={people} relationships={relationships} />

      <AnimatePresence initial={false}>
        {adding && (
          <motion.div
            key="goal-form"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            style={{ overflow: 'hidden' }}
          >
            <Card className={cn('mb-4', cardClass)}>
              <CardContent className="p-4 sm:p-6">
                <SectionTitle icon={Plus} label={editId ? 'Editar objetivo' : 'Nuevo objetivo'} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                  <Input placeholder="Titulo" value={title} onChange={e => setTitle(e.target.value)} className="col-span-2" />
                  <Input placeholder="Descripcion" value={desc} onChange={e => setDesc(e.target.value)} className="col-span-2" />
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
                  <Input placeholder="Siguiente accion" value={nextAction} onChange={e => setNextAction(e.target.value)} className="col-span-2" />
                  <div className="col-span-2">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-1.5">
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
                  <Button variant="outline" size="sm" onClick={saveGoal} className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-400">{editId ? 'Guardar' : '+ Agregar objetivo'}</Button>
                  <Button variant="ghost" size="sm" onClick={resetForm}>Cancelar</Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {activeGoals.length === 0 && !adding ? (
        <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
          <Target size={28} strokeWidth={1.5} className="text-muted-foreground/40" />
          <div className="text-sm text-muted-foreground">Sin objetivos activos.</div>
          <p className="text-xs text-muted-foreground/60">Crea tu primer objetivo para empezar a medir tu paz.</p>
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>+ Crear primer objetivo</Button>
        </div>
      ) : (
        <div className="space-y-2 mb-6">
          {activeGoals.map((g) => (
            <Card key={g.id} className={cardClass}>
              <CardContent className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 sm:gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-sm font-medium text-foreground">{g.title}</span>
                      <Badge variant="outline" className={cn('text-[10px] font-normal', PRIO_CLASS[g.priority])}>{PRIO_LABEL[g.priority]}</Badge>
                      <Badge variant="outline" className="text-[10px] font-normal">{CAT_LABEL[g.category]}</Badge>
                    </div>
                    {g.description && <p className="text-xs text-muted-foreground mb-2">{g.description}</p>}
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex-1 h-1 bg-muted rounded-full">
                        <div className="h-1 rounded-full bg-emerald-500 transition-all" style={{ width: g.progress + '%' }} />
                      </div>
                      <span className="text-xs font-mono tabular-nums text-muted-foreground w-8">{g.progress}%</span>
                    </div>
                    {progressId === g.id && (
                      <div className="flex gap-2 mb-2 flex-wrap">
                        <Input type="number" min="0" max="100" placeholder="% nuevo progreso" value={progressVal} onChange={e => setProgressVal(e.target.value)} className="flex-1 min-w-0 max-w-[10rem] font-mono" />
                        <Button variant="outline" size="sm" onClick={saveProgress} className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-400">Guardar</Button>
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
                    <Button variant="ghost" size="sm" onClick={() => { setProgressId(g.id === progressId ? null : g.id); setProgressVal(String(g.progress)) }}>%</Button>
                    <Button variant="ghost" size="sm" onClick={() => startEdit(g)}>Editar</Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-400">Completar</Button>
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
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {otherGoals.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Archive size={14} strokeWidth={1.75} className="text-muted-foreground/70" />
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-sans">Historial</span>
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
                  <span className={cn('text-[10px] font-mono', STATUS_COLORS[g.status])}>{g.status}</span>
                  <Button variant="ghost" size="sm" onClick={() => handleReactivate(g)}>Reactivar</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </AppShell>
  )
}
