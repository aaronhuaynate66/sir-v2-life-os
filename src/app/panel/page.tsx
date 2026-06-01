'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Activity, Target, Brain, Wallet, Users, Bell,
  Moon, Zap, ArrowRightLeft, Sparkles,
  AlertCircle, TrendingUp, TrendingDown, Minus,
  CheckCircle2, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { calculatePeaceScore, detectPeaceThreats } from '@/engines/peace'
import { analyzeBiologicalState, analyzeSleepTrend } from '@/engines/biological'
import { analyzeFinancialStability, detectFinancialAlerts, analyzeSpendingByIntent } from '@/engines/financial'
import { detectRelationshipAlerts } from '@/engines/relationship'
import { LunarChip } from '@/components/lunar/LunarChip'
import { buildSignalContext } from '@/engines/signal'
import { generateRecommendations } from '@/engines/recommendation'
import { buildGoalDashboard } from '@/engines/goal'
import { getCurrentTimingWindow } from '@/engines/timing'
import { computeWeeklyScore, windowAverages } from '@/engines/weekly'
import { assessRecovery } from '@/engines/recovery'
import { useSelfStore } from '@/stores/useSelfStore'
import { useRelationshipStore } from '@/stores/useRelationshipStore'
import { useGoalStore } from '@/stores/useGoalStore'
import { useFinanceStore } from '@/stores/useFinanceStore'
import { useSignalStore } from '@/stores/useSignalStore'
import { useRecommendationStore } from '@/stores/useRecommendationStore'
import { useMemoryStore } from '@/stores'
import { SEED_FIXTURES } from '@/data/fixtures/seed'
import { DailyBriefingCard } from '@/components/panel/DailyBriefingCard'
import { WeeklyScoreCard } from '@/components/panel/WeeklyScoreCard'
import { RecoveryPanel } from '@/components/panel/RecoveryPanel'
import { ProximoPanel } from '@/components/agenda/ProximoPanel'
import { createSleepMemory, createSelfMetricMemory, createFinancialMovementMemory, createSignalAddedMemory } from '@/engines/memory'
import { AppShell } from '@/components/layout/AppShell'
import { useSnapshotCapture } from '@/hooks/useSnapshotCapture'
import { formatPEN, formatCurrencyCompact } from '@/lib/format/currency'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { RouteSkeleton } from '@/components/skeletons/RouteSkeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { SectionTitle } from '@/components/ui/section-title'
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
  AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'

type Mode = 'normal' | 'focused' | 'recovery' | 'strategic'

const MODE_LABEL: Record<Mode, string> = {
  normal: 'OPERATIVO', focused: 'ENFOCADO', recovery: 'RECUPERACION', strategic: 'ESTRATEGICO',
}
const MODE_CLASSES: Record<Mode, string> = {
  normal: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  focused: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
  recovery: 'border-red-500/30 bg-red-500/10 text-red-400',
  strategic: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
}

function statusColor(level: 'ok' | 'warn' | 'bad' | undefined): string {
  if (level === 'ok') return 'text-emerald-400'
  if (level === 'warn') return 'text-amber-400'
  if (level === 'bad') return 'text-red-400'
  return 'text-foreground'
}

const cardClass = 'shadow-none transition-colors duration-200 hover:border-primary/30'

function Row({ label, value, status }: { label: string; value: string; status?: 'ok' | 'warn' | 'bad' }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn('text-sm font-mono tabular-nums', statusColor(status))}>{value}</span>
    </div>
  )
}

export default function DashboardPage() {
  const hydrated = useHasHydrated()
  if (!hydrated) return <RouteSkeleton cards={6} />
  return <DashboardContent />
}

function DashboardContent() {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => { setNow(new Date()) }, [])
  useSnapshotCapture()
  const { sleepRecords, selfMetrics, addSleepRecord, addSelfMetric, resetToFixtures: resetSelf, clearAll: clearSelf } = useSelfStore()
  const { people, relationships, resetToFixtures: resetRelationship, clearAll: clearRelationship } = useRelationshipStore()
  const { goals, resetToFixtures: resetGoal, clearAll: clearGoal } = useGoalStore()
  const { financialMovements, addFinancialMovement, resetToFixtures: resetFinance, clearAll: clearFinance } = useFinanceStore()
  const { signals, addSignal, resolveSignal, resetToFixtures: resetSignal, clearAll: clearSignal } = useSignalStore()
  const { recommendations, completeRecommendation, dismissRecommendation, resetToFixtures: resetRec, clearAll: clearRec } = useRecommendationStore()
  const { addMemory } = useMemoryStore()
  const [sleepHours, setSleepHours] = useState('')
  const [energyVal, setEnergyVal] = useState('')
  const [stressVal, setStressVal] = useState('')
  const [finAmount, setFinAmount] = useState('')
  const [finDesc, setFinDesc] = useState('')
  const [finType, setFinType] = useState<'income' | 'expense'>('expense')
  const [signalContent, setSignalContent] = useState('')

  const bio = useMemo(() => analyzeBiologicalState(sleepRecords, selfMetrics), [sleepRecords, selfMetrics])
  const sleep = useMemo(() => analyzeSleepTrend(sleepRecords.slice(-7)), [sleepRecords])
  const fin = useMemo(() => analyzeFinancialStability(financialMovements, 2.5), [financialMovements])
  const finAlerts = useMemo(() => detectFinancialAlerts(financialMovements, 2.5), [financialMovements])
  const relAlerts = useMemo(() => detectRelationshipAlerts(people, relationships), [people, relationships])
  const signalCtx = useMemo(() => buildSignalContext(signals), [signals])
  const goalsDash = useMemo(() => buildGoalDashboard(goals), [goals])
  const timing = getCurrentTimingWindow(bio, now?.getHours() ?? 0)
  const peace = useMemo(() => calculatePeaceScore({ biologicalState: bio, financialState: { stabilityScore: fin.stability, monthlyBalance: fin.monthlyBalance, liquidityMonths: 2.5, activeAlerts: finAlerts.map(a => a.message), timestamp: new Date().toISOString() }, goals, moodScore: 6.5, relationshipAlertCount: relAlerts.length }), [bio, fin, finAlerts, relAlerts, goals])
  const weekly = useMemo(
    () => computeWeeklyScore({ selfMetrics, sleepRecords, financialMovements, goals }, { now: now ?? undefined, liquidityMonths: 2.5 }),
    [selfMetrics, sleepRecords, financialMovements, goals, now],
  )
  // P4: evaluación dinámica de recuperación sobre señales de sobrecarga.
  const spendIntent = useMemo(() => analyzeSpendingByIntent(financialMovements), [financialMovements])
  const winAvg = useMemo(() => windowAverages(selfMetrics, sleepRecords, { now: now ?? undefined }), [selfMetrics, sleepRecords, now])
  const recoveryAssessment = useMemo(() => {
    const nonEss = spendIntent.classifiedPEN > 0
      ? (spendIntent.items.find((i) => i.intent === 'no_esencial')?.pct ?? null)
      : null
    return assessRecovery({
      weeklyTier: weekly.tier,
      avgSleepHours: winAvg.avgSleepHours,
      avgStress: winAvg.avgStress,
      avgEnergy: winAvg.avgEnergy,
      nonEssentialShare: nonEss,
    })
  }, [weekly.tier, winAvg, spendIntent])
  const recoveryHard = recoveryAssessment.severity === 'hard'
  // En recuperación dura simplificamos la UI; el usuario puede expandir igual.
  const [showAll, setShowAll] = useState(false)
  const simplified = recoveryHard && !showAll
  const threats = useMemo(() => detectPeaceThreats(peace), [peace])
  const recs = useMemo(() => generateRecommendations({ peaceScore: peace, biologicalState: bio, activeGoals: goals, activeSignals: signals, relationshipAlerts: relAlerts }), [peace, bio, goals, signals, relAlerts])
  const topRec = recommendations.find(r => r.status === 'pending') ?? recs[0] ?? null
  const activeSignals = signalCtx.activeSignals.filter(s => !s.resolved)

  const mode: Mode = recoveryAssessment.active || peace.recoveryMode || bio.energyLevel < 4 ? 'recovery' : peace.total > 8 && bio.energyLevel > 7 ? 'strategic' : bio.energyLevel > 7 ? 'focused' : 'normal'
  const peaceColor = peace.total >= 7 ? 'text-emerald-400' : peace.total >= 4 ? 'text-amber-400' : 'text-red-400'
  const peaceDotColor = peace.total >= 7 ? 'bg-emerald-400' : peace.total >= 4 ? 'bg-amber-400' : 'bg-red-400'

  function handleAddSleep() {
    const h = parseFloat(sleepHours)
    if (isNaN(h) || h < 0 || h > 24) { toast.error('Horas invalidas', { description: 'Debe ser un numero entre 0 y 24.' }); return }
    const record = { id: `sl_${Date.now()}`, date: new Date().toISOString().split('T')[0], bedtime: '23:00', wakeTime: '07:00', duration: h, quality: h >= 7 ? 8 : h >= 5 ? 5 : 3 }
    addSleepRecord(record); addMemory(createSleepMemory(record)); setSleepHours('')
    toast.success('Sueno registrado', { description: `${h}h agregadas a tu historial` })
  }
  function handleAddEnergy() {
    const e = parseInt(energyVal), s = parseInt(stressVal)
    const eOk = !isNaN(e) && e >= 1 && e <= 10
    const sOk = !isNaN(s) && s >= 1 && s <= 10
    if (!eOk && !sOk) { toast.error('Sin datos validos', { description: 'Energia o estres deben estar entre 1 y 10.' }); return }
    if (eOk) { const m = { id: `m_e_${Date.now()}`, category: 'energy' as const, value: e, timestamp: new Date().toISOString() }; addSelfMetric(m); addMemory(createSelfMetricMemory(m)) }
    if (sOk) { const m = { id: `m_s_${Date.now()}`, category: 'stress' as const, value: s, timestamp: new Date().toISOString() }; addSelfMetric(m); addMemory(createSelfMetricMemory(m)) }
    setEnergyVal(''); setStressVal('')
    toast.success('Metricas registradas', { description: [eOk ? `energia ${e}` : null, sOk ? `estres ${s}` : null].filter(Boolean).join(' · ') })
  }
  function handleAddFinance() {
    const amt = parseFloat(finAmount)
    if (isNaN(amt) || amt <= 0) { toast.error('Monto invalido', { description: 'El monto debe ser mayor que 0.' }); return }
    // Quick action: always PEN. Para flujos USD usa /finance.
    const movement = { id: `f_${Date.now()}`, type: finType, amount: amt, currency: 'PEN' as const, exchangeRate: 1.0, amountPEN: amt, category: 'other' as const, description: finDesc || 'Movimiento rapido', date: new Date().toISOString().split('T')[0], recurrent: false, tags: [] }
    addFinancialMovement(movement); addMemory(createFinancialMovementMemory(movement)); setFinAmount(''); setFinDesc('')
    toast.success('Movimiento registrado', { description: `${finType === 'income' ? '+' : '-'}${formatPEN(amt)}` })
  }
  function handleAddSignal() {
    if (!signalContent.trim()) { toast.error('Senal vacia', { description: 'Escribe el contenido de la senal.' }); return }
    const sig = { id: `sig_${Date.now()}`, source: 'manual' as const, type: 'pattern' as const, content: signalContent, strength: 5, urgency: 'soon' as const, relatedPersons: [], relatedGoals: [], meaning: signalContent, actionRequired: false, detectedAt: new Date().toISOString(), resolved: false }
    addSignal(sig); addMemory(createSignalAddedMemory(sig)); setSignalContent('')
    toast.success('Senal registrada')
  }
  function handleResetAll() {
    resetSelf(); resetRelationship(); resetGoal(); resetFinance(); resetSignal(); resetRec()
    toast.success('Datos reseteados', { description: 'Fixtures cargados.' })
  }
  function handleClearAll() {
    clearSelf(); clearRelationship(); clearGoal(); clearFinance(); clearSignal(); clearRec()
    toast.success('Datos eliminados', { description: 'Todo el storage local quedo vacio.' })
  }

  const TrendIcon = peace.trend === 'improving' ? TrendingUp : peace.trend === 'declining' ? TrendingDown : Minus
  const trendLabel = peace.trend === 'improving' ? 'Mejorando' : peace.trend === 'declining' ? 'Declinando' : 'Estable'
  const trendColor = peace.trend === 'improving' ? 'text-emerald-400' : peace.trend === 'declining' ? 'text-red-400' : 'text-muted-foreground'

  const recTimingLabel = topRec?.timing === 'now' ? 'AHORA' : topRec?.timing === 'today' ? 'HOY' : topRec?.timing === 'this_week' ? 'ESTA SEMANA' : 'CUANDO LISTO'
  const recTimingClass = topRec?.timing === 'now' ? 'border-red-500/30 bg-red-500/10 text-red-400' : topRec?.timing === 'today' ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border bg-muted text-muted-foreground'

  return (
    <AppShell wide>
      {recoveryAssessment.active && (
        <div className={cn(
          'fixed top-0 inset-x-0 z-50 px-6 py-2 border-b',
          recoveryHard ? 'bg-red-500/10 border-red-500/20' : 'bg-amber-500/10 border-amber-500/20',
        )}>
          <div className="max-w-5xl mx-auto flex items-center gap-3">
            <span className={cn('w-2 h-2 rounded-full animate-pulse', recoveryHard ? 'bg-red-500' : 'bg-amber-500')} />
            <span className={cn('text-xs font-mono', recoveryHard ? 'text-red-400' : 'text-amber-400')}>
              RECOVERY MODE &mdash; {recoveryAssessment.reasons[0] ?? 'cuidá tu energía'}
            </span>
          </div>
        </div>
      )}

      <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="flex justify-between items-start gap-4 mb-6 sm:mb-8">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-sans mb-1">SIR V2 &mdash; Life Operating System</div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Mission Control</h1>
          <div className="flex items-center gap-2 flex-wrap mt-1">
            <span className="text-xs sm:text-sm text-muted-foreground capitalize">{now ? now.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' }) : ''}</span>
            {now && <LunarChip date={now} />}
          </div>
        </div>
        <div className="text-right flex flex-col items-end gap-2 flex-shrink-0">
          <div className="text-xl sm:text-2xl font-mono tabular-nums text-muted-foreground/70">{now ? now.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : ''}</div>
          <Badge variant="outline" className={cn('font-mono text-[10px] tracking-widest', MODE_CLASSES[mode])}>{MODE_LABEL[mode]}</Badge>
        </div>
      </motion.div>

      {/* Briefing diario (Fase 5): resumen accionable de hoy via LLM. */}
      <DailyBriefingCard />

      {/* Agenda "Próximo" (Feature 1): agrega cumpleaños, fechas especiales,
          objetivos por vencer, señales y contactos pendientes de TODA la red.
          Determinístico, sin LLM. Top 6 acá + link a /agenda. */}
      <ProximoPanel limit={6} showViewAll />

      <Card className={cn('mb-6', cardClass)}>
        <CardContent className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 p-4 sm:p-6">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-sans mb-1">Mision</div>
            <div className="text-foreground">Conseguir Paz.</div>
          </div>
          <div className="sm:text-right">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-sans mb-1">Ventana actual</div>
            <div className={cn('text-xs', timing.type === 'peak' ? 'text-emerald-400' : timing.type === 'avoid' ? 'text-amber-400' : 'text-muted-foreground')}>{timing.description}</div>
          </div>
        </CardContent>
      </Card>

      {/* Weekly score (P2): score semanal compuesto con tier S/A/B/C/D. */}
      <WeeklyScoreCard data={weekly} />

      {/* Recovery Mode dinámico (P4): prioridades de recuperación cuando hay sobrecarga. */}
      <RecoveryPanel data={recoveryAssessment} />

      {/* HERO: Peace Score + Recomendacion */}
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }} className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-6">
        <Card className={cn('lg:col-span-5', cardClass)}>
          <CardContent className="p-4 sm:p-6">
            <SectionTitle icon={Activity} label="Peace Score" />
            <div className="flex items-baseline gap-2 mb-3">
              <span className={cn('text-5xl sm:text-6xl lg:text-7xl font-mono font-semibold tabular-nums', peaceColor)}>{peace.total.toFixed(1)}</span>
              <span className="text-xl sm:text-2xl text-muted-foreground/50 font-mono">/10</span>
            </div>
            <div className="flex items-center gap-2">
              <TrendIcon size={14} strokeWidth={1.75} className={trendColor} />
              <span className={cn('text-xs', trendColor)}>{trendLabel}</span>
              <span className={cn('ml-2 w-1.5 h-1.5 rounded-full animate-pulse', peaceDotColor)} />
            </div>
            {threats.length > 0 && (
              <>
                <Separator className="my-4" />
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-2">Atencion</div>
                <div className="space-y-1.5">
                  {threats.map((t, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <AlertCircle size={12} strokeWidth={2} className="text-red-400 mt-0.5 flex-shrink-0" />
                      <span className="text-xs text-muted-foreground leading-relaxed">{t.description}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {topRec ? (
          <Card className={cn('lg:col-span-7', cardClass)}>
            <CardContent className="p-4 sm:p-6 h-full flex flex-col">
              <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Target size={14} strokeWidth={1.75} className="text-muted-foreground/70" />
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-sans">Foco del dia</span>
                </div>
                <Badge variant="outline" className={cn('text-[10px] font-mono tracking-wider', recTimingClass)}>{recTimingLabel}</Badge>
              </div>

              <div className="flex gap-3 flex-1">
                <div className={cn('w-0.5 self-stretch rounded-full flex-shrink-0', topRec.priority === 'critical' ? 'bg-red-500' : topRec.priority === 'high' ? 'bg-primary' : 'bg-blue-500')} />
                <div className="flex-1 flex flex-col min-w-0">
                  <h2 className="text-lg sm:text-xl font-semibold tracking-tight mb-2">{topRec.title}</h2>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-3">{topRec.description}</p>
                  <div className="text-[11px] text-muted-foreground/70 font-mono leading-relaxed mb-4">{topRec.reasoning}</div>

                  <div className="flex gap-4 mb-4">
                    <div className="flex items-baseline gap-1">
                      <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60">Impacto</span>
                      <span className="text-sm font-mono tabular-nums text-emerald-400">+{topRec.expectedPeaceImpact}</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60">Confianza</span>
                      <span className="text-sm font-mono tabular-nums text-foreground">{Math.round(topRec.confidence * 100)}%</span>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-auto">
                    <Button size="sm" variant="outline" onClick={() => completeRecommendation(topRec.id)} className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-400">
                      <CheckCircle2 size={14} strokeWidth={1.75} />
                      Completar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => dismissRecommendation(topRec.id)}>
                      Descartar
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className={cn('lg:col-span-7', cardClass)}>
            <CardContent className="p-4 sm:p-6 h-full flex flex-col items-center justify-center text-center min-h-[200px]">
              <Target size={24} strokeWidth={1.25} className="text-muted-foreground/40 mb-2" />
              <div className="text-sm text-muted-foreground">Sin recomendaciones activas.</div>
              <div className="text-xs text-muted-foreground/60 mt-1">El sistema esta calibrando senales.</div>
            </CardContent>
          </Card>
        )}
      </motion.div>

      {/* En recuperación dura, simplificamos: ocultamos métricas secundarias,
          listas y formularios para reducir carga cognitiva y priorizar descanso.
          El usuario puede expandir igual. */}
      {simplified && (
        <div className="mb-6 text-center">
          <Button size="sm" variant="ghost" onClick={() => setShowAll(true)} className="text-muted-foreground">
            Mostrar el panel completo
          </Button>
          <p className="text-[10px] text-muted-foreground/60 mt-1">
            En recuperación ocultamos lo secundario para que te enfoques en lo que importa hoy: descansar.
          </p>
        </div>
      )}

      {!simplified && (
        <>
      {/* Métricas secundarias: Bio, Finanzas, Objetivos */}
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <Card className={cardClass}>
          <CardContent className="p-4 sm:p-6">
            <SectionTitle icon={Brain} label="Estado Biologico" />
            <Row label="Energia" value={`${bio.energyLevel.toFixed(1)}/10`} status={bio.energyLevel >= 6 ? 'ok' : bio.energyLevel >= 4 ? 'warn' : 'bad'} />
            <Row label="Sueno promedio" value={`${sleep.averageDuration.toFixed(1)}h`} status={sleep.averageDuration >= 7 ? 'ok' : sleep.averageDuration >= 5 ? 'warn' : 'bad'} />
            <Row label="Calidad sueno" value={`${sleep.averageQuality.toFixed(1)}/10`} status={sleep.averageQuality >= 6 ? 'ok' : 'warn'} />
            <Row label="Deuda sueno" value={`${bio.sleepDebt.toFixed(1)}h`} status={bio.sleepDebt < 2 ? 'ok' : bio.sleepDebt < 5 ? 'warn' : 'bad'} />
          </CardContent>
        </Card>

        <Card className={cardClass}>
          <CardContent className="p-4 sm:p-6">
            <SectionTitle icon={Wallet} label="Finanzas" />
            <Row label="Estabilidad" value={`${fin.stability.toFixed(1)}/10`} status={fin.riskLevel === 'low' ? 'ok' : fin.riskLevel === 'medium' ? 'warn' : 'bad'} />
            <Row label="Balance mensual" value={formatCurrencyCompact(fin.monthlyBalance, 'PEN')} status={fin.monthlyBalance >= 0 ? 'ok' : 'bad'} />
            <Row label="Tasa ahorro" value={`${fin.savingsRate.toFixed(0)}%`} status={fin.savingsRate >= 20 ? 'ok' : fin.savingsRate >= 10 ? 'warn' : 'bad'} />
            {finAlerts[0] && (
              <>
                <Separator className="my-3" />
                <div className="flex gap-1.5 items-start">
                  <AlertCircle size={12} strokeWidth={2} className="text-amber-400 mt-0.5 flex-shrink-0" />
                  <span className="text-[11px] text-amber-400 leading-relaxed">{finAlerts[0].message}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className={cn('sm:col-span-2 lg:col-span-1', cardClass)}>
          <CardContent className="p-4 sm:p-6">
            <SectionTitle icon={Target} label="Objetivos" count={`${goalsDash.criticalGoals.length} criticos`} />
            {goalsDash.criticalGoals.length === 0 ? (
              <div className="text-xs text-muted-foreground/70 py-2">Sin objetivos criticos.</div>
            ) : (
              <div className="space-y-3">
                {goalsDash.criticalGoals.slice(0, 3).map((g) => (
                  <div key={g.id}>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm truncate">{g.title}</span>
                      <span className="text-xs font-mono tabular-nums text-muted-foreground">{g.progress}%</span>
                    </div>
                    <div className="h-1 bg-muted rounded-full overflow-hidden">
                      <div className="h-1 rounded-full bg-emerald-500 transition-all duration-300" style={{ width: `${g.progress}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Listas: alertas relacionales + señales activas */}
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15 }} className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card className={cardClass}>
          <CardContent className="p-4 sm:p-6">
            <SectionTitle icon={Users} label="Alertas Relacionales" count={relAlerts.length} />
            {relAlerts.length === 0 ? (
              <div className="text-xs text-muted-foreground/70 py-2">Sin alertas relacionales.</div>
            ) : (
              <div className="space-y-3">
                {relAlerts.slice(0, 3).map((a, i) => (
                  <div key={i} className="flex gap-3 py-1.5 border-b border-border/40 last:border-0">
                    <div className={cn('w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0', a.urgency === 'immediate' ? 'bg-red-500' : 'bg-amber-500')} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-foreground">{a.personName}</div>
                      <div className="text-xs text-muted-foreground">{a.message}</div>
                      {a.suggestedAction && <div className="text-[11px] text-muted-foreground/60 mt-0.5">{a.suggestedAction}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={cardClass}>
          <CardContent className="p-4 sm:p-6">
            <SectionTitle icon={Bell} label="Senales Activas" count={activeSignals.length} />
            {activeSignals.length === 0 ? (
              <div className="text-xs text-muted-foreground/70 py-2">Sin senales activas.</div>
            ) : (
              <div className="space-y-2">
                {activeSignals.slice(0, 3).map((sig) => (
                  <div key={sig.id} className="flex gap-2 items-start py-1.5 border-b border-border/40 last:border-0 group">
                    <span className="text-[10px] font-mono text-muted-foreground/60 mt-0.5 w-16 flex-shrink-0 uppercase tracking-wider">{sig.source}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-foreground">{sig.content}</div>
                      {sig.meaning && sig.meaning !== sig.content && <div className="text-xs text-muted-foreground mt-0.5">{sig.meaning}</div>}
                    </div>
                    <button
                      onClick={() => resolveSignal(sig.id)}
                      className="text-muted-foreground/40 hover:text-foreground flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Resolver"
                    >
                      <X size={14} strokeWidth={1.75} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Forms rápidos: 2x2 en lg, single col en mobile */}
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }} className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
        <Card className={cardClass}>
          <CardContent className="p-4 sm:p-5">
            <SectionTitle icon={Moon} label="Registrar sueno" />
            <div className="flex gap-2">
              <Input type="number" min="0" max="24" step="0.5" placeholder="Horas (ej: 7.5)" value={sleepHours} onChange={e => setSleepHours(e.target.value)} className="flex-1 font-mono tabular-nums" />
              <Button size="sm" variant="outline" onClick={handleAddSleep}>+ Agregar</Button>
            </div>
          </CardContent>
        </Card>

        <Card className={cardClass}>
          <CardContent className="p-4 sm:p-5">
            <SectionTitle icon={Zap} label="Energia / Estres (1-10)" />
            <div className="flex gap-2">
              <Input type="number" min="1" max="10" placeholder="Energia" value={energyVal} onChange={e => setEnergyVal(e.target.value)} className="flex-1 font-mono tabular-nums" />
              <Input type="number" min="1" max="10" placeholder="Estres" value={stressVal} onChange={e => setStressVal(e.target.value)} className="flex-1 font-mono tabular-nums" />
              <Button size="sm" variant="outline" onClick={handleAddEnergy}>+ Agregar</Button>
            </div>
          </CardContent>
        </Card>

        <Card className={cardClass}>
          <CardContent className="p-4 sm:p-5">
            <SectionTitle icon={ArrowRightLeft} label="Movimiento financiero" />
            <div className="flex flex-wrap gap-2">
              <Select value={finType} onValueChange={(v) => setFinType(v as 'income' | 'expense')}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">Gasto</SelectItem>
                  <SelectItem value="income">Ingreso</SelectItem>
                </SelectContent>
              </Select>
              <Input type="number" min="0" placeholder="S/" value={finAmount} onChange={e => setFinAmount(e.target.value)} className="w-24 font-mono tabular-nums" />
              <Input type="text" placeholder="Descripcion" value={finDesc} onChange={e => setFinDesc(e.target.value)} className="flex-1 min-w-[140px]" />
              <Button size="sm" variant="outline" onClick={handleAddFinance} className="w-full sm:w-auto">+ Agregar</Button>
            </div>
          </CardContent>
        </Card>

        <Card className={cardClass}>
          <CardContent className="p-4 sm:p-5">
            <SectionTitle icon={Sparkles} label="Senal rapida" />
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="Registrar senal o patron..."
                value={signalContent}
                onChange={e => setSignalContent(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddSignal() }}
                className="flex-1"
              />
              <Button size="sm" variant="outline" onClick={handleAddSignal}>+ Agregar</Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {recoveryHard && showAll && (
        <div className="mb-6 text-center">
          <Button size="sm" variant="ghost" onClick={() => setShowAll(false)} className="text-muted-foreground">
            Volver al modo recuperación (vista simple)
          </Button>
        </div>
      )}
        </>
      )}

      {/* Footer: datos locales + debug + branding.
          Controles destructivos SOLO en dev (SEED_FIXTURES): en prod,
          "Resetear a fixtures" / "Borrar todo" pondrían los slices en []
          y el sync engine emitiría un DELETE de la data real (ej. Diana)
          hacia Supabase. Footgun del split-brain — oculto en producción. */}
      {SEED_FIXTURES && (
      <div className="mt-8 pt-4 border-t border-border flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-sans">Datos locales</span>
        <div className="flex gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="ghost">Resetear a fixtures</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Resetear todos los datos?</AlertDialogTitle>
                <AlertDialogDescription>
                  Tus registros locales seran reemplazados por los datos de muestra (fixtures). Esta accion no se puede deshacer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleResetAll}>Resetear</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="ghost" className="hover:bg-red-500/10 hover:text-red-400">Borrar todo</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Borrar todos los datos locales?</AlertDialogTitle>
                <AlertDialogDescription>
                  Vas a eliminar permanentemente todo el storage local: sueno, metricas, finanzas, objetivos, senales y relaciones. Esta accion no se puede deshacer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleClearAll} className="bg-red-500 text-white hover:bg-red-500/90">Borrar todo</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      )}

      <div className="mt-8 pt-4 border-t border-border flex justify-between">
        <span className="text-[10px] text-muted-foreground/60 font-mono">SIR V2 &mdash; Fase 4 &mdash; UI Produccion</span>
        <span className="text-[10px] text-muted-foreground/60 font-mono">datos &rarr; senales &rarr; contexto &rarr; memoria &rarr; timing &rarr; recomendacion</span>
      </div>
    </AppShell>
  )
}
