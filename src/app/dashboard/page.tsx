'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { calculatePeaceScore, evaluateRecoveryMode, detectPeaceThreats } from '@/engines/peace'
import { analyzeBiologicalState, analyzeSleepTrend } from '@/engines/biological'
import { analyzeFinancialStability, detectFinancialAlerts } from '@/engines/financial'
import { detectRelationshipAlerts } from '@/engines/relationship'
import { buildSignalContext } from '@/engines/signal'
import { generateRecommendations } from '@/engines/recommendation'
import { buildGoalDashboard } from '@/engines/goal'
import { getCurrentTimingWindow } from '@/engines/timing'
import { useSelfStore } from '@/stores/useSelfStore'
import { useRelationshipStore } from '@/stores/useRelationshipStore'
import { useGoalStore } from '@/stores/useGoalStore'
import { useFinanceStore } from '@/stores/useFinanceStore'
import { useSignalStore } from '@/stores/useSignalStore'
import { useRecommendationStore } from '@/stores/useRecommendationStore'
import { RichContextDebugPanel } from '@/components/context/RichContextDebugPanel'
import { useSnapshotCapture } from '@/hooks/useSnapshotCapture'

function Badge({ label, color }: { label: string; color: string }) {
  return <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${color}`}>{label}</span>
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
      className={`bg-[#111] border border-[#1e1e1e] rounded-lg p-4 ${className}`}>
      {children}
    </motion.div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] text-[#444] uppercase tracking-widest mb-3 font-mono">{children}</div>
}

function Row({ label, value, status }: { label: string; value: string; status?: 'ok' | 'warn' | 'bad' }) {
  const c = status === 'ok' ? 'text-[#22c55e]' : status === 'warn' ? 'text-[#f59e0b]' : status === 'bad' ? 'text-[#ef4444]' : 'text-[#f5f5f5]'
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-[#1a1a1a] last:border-0">
      <span className="text-xs text-[#555]">{label}</span>
      <span className={`text-sm font-mono ${c}`}>{value}</span>
    </div>
  )
}

export default function DashboardPage() {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
  }, [])
  useSnapshotCapture()
  const { sleepRecords, selfMetrics, addSleepRecord, addSelfMetric, resetToFixtures: resetSelf, clearAll: clearSelf } = useSelfStore()
  const { people, relationships, resetToFixtures: resetRelationship, clearAll: clearRelationship } = useRelationshipStore()
  const { goals, resetToFixtures: resetGoal, clearAll: clearGoal } = useGoalStore()
  const { financialMovements, addFinancialMovement, resetToFixtures: resetFinance, clearAll: clearFinance } = useFinanceStore()
  const { signals, addSignal, resolveSignal, resetToFixtures: resetSignal, clearAll: clearSignal } = useSignalStore()
  const { recommendations, completeRecommendation, dismissRecommendation, resetToFixtures: resetRec, clearAll: clearRec } = useRecommendationStore()
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
  const recovery = useMemo(() => evaluateRecoveryMode(peace), [peace])
  const threats = useMemo(() => detectPeaceThreats(peace), [peace])
  const recs = useMemo(() => generateRecommendations({ peaceScore: peace, biologicalState: bio, activeGoals: goals, activeSignals: signals, relationshipAlerts: relAlerts }), [peace, bio, goals, signals, relAlerts])
  const topRec = recommendations.find(r => r.status === 'pending') ?? recs[0] ?? null
  const mode = peace.recoveryMode || bio.energyLevel < 4 ? 'recovery' : peace.total > 8 && bio.energyLevel > 7 ? 'strategic' : bio.energyLevel > 7 ? 'focused' : 'normal'
  const modeBadge: Record<string, string> = { normal: 'text-[#22c55e] border-[#22c55e]/30 bg-[#22c55e]/10', focused: 'text-[#3b82f6] border-[#3b82f6]/30 bg-[#3b82f6]/10', recovery: 'text-[#ef4444] border-[#ef4444]/30 bg-[#ef4444]/10', strategic: 'text-[#d4af37] border-[#d4af37]/30 bg-[#d4af37]/10' }
  const modeLabel: Record<string, string> = { normal: 'OPERATIVO', focused: 'ENFOCADO', recovery: 'RECUPERACION', strategic: 'ESTRATEGICO' }
  const peaceColor = peace.total >= 7 ? 'text-[#22c55e]' : peace.total >= 4 ? 'text-[#f59e0b]' : 'text-[#ef4444]'
  function handleAddSleep() { const h = parseFloat(sleepHours); if (isNaN(h) || h < 0 || h > 24) return; addSleepRecord({ id: `sl_${Date.now()}`, date: new Date().toISOString().split('T')[0], bedtime: '23:00', wakeTime: '07:00', duration: h, quality: h >= 7 ? 8 : h >= 5 ? 5 : 3 }); setSleepHours('') }
  function handleAddEnergy() { const e = parseInt(energyVal), s = parseInt(stressVal); if (!isNaN(e) && e >= 1 && e <= 10) addSelfMetric({ id: `m_e_${Date.now()}`, category: 'energy', value: e, timestamp: new Date().toISOString() }); if (!isNaN(s) && s >= 1 && s <= 10) addSelfMetric({ id: `m_s_${Date.now()}`, category: 'stress', value: s, timestamp: new Date().toISOString() }); setEnergyVal(''); setStressVal('') }
  function handleAddFinance() { const amt = parseFloat(finAmount); if (isNaN(amt) || amt <= 0) return; addFinancialMovement({ id: `f_${Date.now()}`, type: finType, amount: amt, currency: 'USD', category: 'other', description: finDesc || 'Movimiento rapido', date: new Date().toISOString().split('T')[0], recurrent: false, tags: [] }); setFinAmount(''); setFinDesc('') }
  function handleAddSignal() { if (!signalContent.trim()) return; addSignal({ id: `sig_${Date.now()}`, source: 'manual', type: 'pattern', content: signalContent, strength: 5, urgency: 'soon', relatedPersons: [], relatedGoals: [], meaning: signalContent, actionRequired: false, detectedAt: new Date().toISOString(), resolved: false }); setSignalContent('') }
  function handleResetAll() { resetSelf(); resetRelationship(); resetGoal(); resetFinance(); resetSignal(); resetRec() }
  function handleClearAll() { clearSelf(); clearRelationship(); clearGoal(); clearFinance(); clearSignal(); clearRec() }
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5]">
      {recovery.active && (<div className="fixed top-0 inset-x-0 z-50 bg-[#ef4444]/10 border-b border-[#ef4444]/20 px-6 py-2"><div className="max-w-5xl mx-auto flex items-center gap-3"><span className="w-2 h-2 rounded-full bg-[#ef4444] animate-pulse" /><span className="text-xs text-[#ef4444] font-mono">RECOVERY MODE &mdash; {recovery.reason}</span></div></div>)}
      <div className="max-w-5xl mx-auto px-6 py-8">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-between items-start mb-8">
          <div><div className="text-[10px] text-[#333] font-mono uppercase tracking-widest mb-1">SIR V2 &mdash; Life Operating System</div><h1 className="text-lg font-medium">Mission Control</h1><div className="text-xs text-[#444] mt-1 capitalize">{now ? now.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' }) : ''}</div></div>
          <div className="text-right flex flex-col items-end gap-2"><div className="text-2xl font-mono text-[#2a2a2a]">{now ? now.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : ''}</div><Badge label={modeLabel[mode] || 'OPERATIVO'} color={modeBadge[mode] || modeBadge.normal} /></div>
        </motion.div>
        <Card className="mb-6 border-[#1a1a1a]"><div className="flex justify-between items-center"><div><div className="text-[10px] text-[#2a2a2a] uppercase tracking-widest font-mono mb-1">Mision</div><div className="text-[#555]">Conseguir Paz.</div></div><div className="text-right"><div className="text-[10px] text-[#2a2a2a] uppercase tracking-widest font-mono mb-1">Ventana actual</div><div className={`text-xs ${timing.type === 'peak' ? 'text-[#22c55e]' : timing.type === 'avoid' ? 'text-[#f59e0b]' : 'text-[#444]'}`}>{timing.description}</div></div></div></Card>
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 md:col-span-4 space-y-4">
            <Card><div className="flex flex-col gap-1"><div className="text-[10px] text-[#444] uppercase tracking-widest font-mono">Peace Score</div><div className={`text-5xl font-mono font-bold ${peaceColor}`}>{peace.total.toFixed(1)}<span className="text-xl text-[#333]">/10</span></div><div className="flex items-center gap-2 mt-1"><span className={`w-1.5 h-1.5 rounded-full ${peaceColor.replace('text-', 'bg-')} animate-pulse`} /><span className="text-xs text-[#555]">{peace.trend === 'improving' ? 'up Mejorando' : peace.trend === 'declining' ? 'down Declinando' : 'stable Estable'}</span></div></div>{threats.length > 0 && (<div className="mt-4 pt-4 border-t border-[#1a1a1a] space-y-2">{threats.map((t, i) => (<div key={i} className="flex gap-2 items-start"><span className="text-[#ef4444] text-xs mt-0.5">!</span><span className="text-[11px] text-[#555]">{t.description}</span></div>))}</div>)}</Card>
            <Card><Label>Estado Biologico</Label><Row label="Energia" value={`${bio.energyLevel.toFixed(1)}/10`} status={bio.energyLevel >= 6 ? 'ok' : bio.energyLevel >= 4 ? 'warn' : 'bad'} /><Row label="Sueno promedio" value={`${sleep.averageDuration.toFixed(1)}h`} status={sleep.averageDuration >= 7 ? 'ok' : sleep.averageDuration >= 5 ? 'warn' : 'bad'} /><Row label="Calidad sueno" value={`${sleep.averageQuality.toFixed(1)}/10`} status={sleep.averageQuality >= 6 ? 'ok' : 'warn'} /><Row label="Deuda sueno" value={`${bio.sleepDebt.toFixed(1)}h`} status={bio.sleepDebt < 2 ? 'ok' : bio.sleepDebt < 5 ? 'warn' : 'bad'} /></Card>
            <Card><Label>Finanzas</Label><Row label="Estabilidad" value={`${fin.stability.toFixed(1)}/10`} status={fin.riskLevel === 'low' ? 'ok' : fin.riskLevel === 'medium' ? 'warn' : 'bad'} /><Row label="Balance mensual" value={`$${fin.monthlyBalance.toLocaleString('en-US')}`} status={fin.monthlyBalance >= 0 ? 'ok' : 'bad'} /><Row label="Tasa ahorro" value={`${fin.savingsRate.toFixed(0)}%`} status={fin.savingsRate >= 20 ? 'ok' : fin.savingsRate >= 10 ? 'warn' : 'bad'} />{finAlerts[0] && <div className="mt-3 pt-3 border-t border-[#1a1a1a] text-[11px] text-[#f59e0b]">! {finAlerts[0].message}</div>}</Card>
          </div>
          <div className="col-span-12 md:col-span-8 space-y-4">
            {topRec && (<Card className="border-[#2a2a2a]"><Label>Recomendacion Principal</Label><div className="flex gap-3"><div className={`w-1 self-stretch rounded-full flex-shrink-0 ${topRec.priority === 'critical' ? 'bg-[#ef4444]' : topRec.priority === 'high' ? 'bg-[#f59e0b]' : 'bg-[#3b82f6]'}`} /><div className="flex-1"><div className="flex items-center gap-2 mb-1"><span className="text-sm font-medium">{topRec.title}</span><span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${topRec.timing === 'now' ? 'bg-[#ef4444]/20 text-[#ef4444]' : 'bg-[#333] text-[#666]'}`}>{topRec.timing === 'now' ? 'AHORA' : topRec.timing === 'today' ? 'HOY' : topRec.timing === 'this_week' ? 'SEMANA' : 'CUANDO LISTO'}</span></div><p className="text-xs text-[#555] leading-relaxed">{topRec.description}</p><div className="mt-2 text-[10px] text-[#333] font-mono">{topRec.reasoning}</div><div className="mt-2 flex gap-3"><span className="text-[10px] text-[#333]">Impacto paz: +{topRec.expectedPeaceImpact}</span><span className="text-[10px] text-[#333]">Confianza: {Math.round(topRec.confidence * 100)}%</span></div><div className="mt-3 flex gap-2"><button onClick={() => completeRecommendation(topRec.id)} className="text-[10px] font-mono px-2 py-1 rounded bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/20 hover:bg-[#22c55e]/20">Completar</button><button onClick={() => dismissRecommendation(topRec.id)} className="text-[10px] font-mono px-2 py-1 rounded bg-[#333] text-[#555] border border-[#222] hover:bg-[#3a3a3a]">Descartar</button></div></div></div></Card>)}
            <Card><Label>Objetivos - {goalsDash.criticalGoals.length} criticos</Label><div className="space-y-3">{goalsDash.criticalGoals.slice(0, 3).map((g) => (<div key={g.id} className="flex items-center gap-3"><div className="flex-1"><div className="flex justify-between mb-1"><span className="text-xs">{g.title}</span><span className="text-xs font-mono text-[#444]">{g.progress}%</span></div><div className="h-1 bg-[#1a1a1a] rounded-full"><div className="h-1 rounded-full bg-[#22c55e]" style={{ width: `${g.progress}%` }} /></div></div></div>))}</div></Card>
            {relAlerts.length > 0 && (<Card><Label>Alertas Relacionales - {relAlerts.length}</Label>{relAlerts.slice(0, 2).map((a, i) => (<div key={i} className="flex gap-3 mb-2 last:mb-0"><div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${a.urgency === 'immediate' ? 'bg-[#ef4444]' : 'bg-[#f59e0b]'}`} /><div><div className="text-xs">{a.personName}</div><div className="text-[11px] text-[#444]">{a.message}</div><div className="text-[10px] text-[#333] mt-0.5">{a.suggestedAction}</div></div></div>))}</Card>)}
            <Card><Label>Senales activas - {signalCtx.activeSignals.filter(s => !s.resolved).length}</Label><div className="space-y-2">{signalCtx.activeSignals.filter(s => !s.resolved).slice(0, 3).map((sig) => (<div key={sig.id} className="flex gap-2 items-start"><span className="text-[10px] font-mono text-[#333] mt-0.5 w-16 flex-shrink-0">{sig.source}</span><div className="flex-1"><div className="text-[11px] text-[#555]">{sig.content}</div>{sig.meaning && <div className="text-[10px] text-[#333] mt-0.5">{sig.meaning}</div>}</div><button onClick={() => resolveSignal(sig.id)} className="text-[10px] text-[#333] hover:text-[#555] flex-shrink-0">x</button></div>))}</div></Card>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-12 gap-4">
          <div className="col-span-12 md:col-span-6 space-y-3">
            <Card><Label>Registrar sueno</Label><div className="flex gap-2"><input type="number" min="0" max="24" step="0.5" placeholder="Horas (ej: 7.5)" value={sleepHours} onChange={e => setSleepHours(e.target.value)} className="flex-1 bg-[#0a0a0a] border border-[#1e1e1e] rounded px-2 py-1.5 text-xs font-mono text-[#f5f5f5] placeholder-[#333] focus:outline-none focus:border-[#333]" /><button onClick={handleAddSleep} className="text-[10px] font-mono px-3 py-1.5 rounded bg-[#1a1a1a] text-[#555] border border-[#222] hover:bg-[#222]">+ Agregar</button></div></Card>
            <Card><Label>Energia / Estres (1-10)</Label><div className="flex gap-2"><input type="number" min="1" max="10" placeholder="Energia" value={energyVal} onChange={e => setEnergyVal(e.target.value)} className="flex-1 bg-[#0a0a0a] border border-[#1e1e1e] rounded px-2 py-1.5 text-xs font-mono text-[#f5f5f5] placeholder-[#333] focus:outline-none focus:border-[#333]" /><input type="number" min="1" max="10" placeholder="Estres" value={stressVal} onChange={e => setStressVal(e.target.value)} className="flex-1 bg-[#0a0a0a] border border-[#1e1e1e] rounded px-2 py-1.5 text-xs font-mono text-[#f5f5f5] placeholder-[#333] focus:outline-none focus:border-[#333]" /><button onClick={handleAddEnergy} className="text-[10px] font-mono px-3 py-1.5 rounded bg-[#1a1a1a] text-[#555] border border-[#222] hover:bg-[#222]">+ Agregar</button></div></Card>
          </div>
          <div className="col-span-12 md:col-span-6 space-y-3">
            <Card><Label>Movimiento financiero rapido</Label><div className="flex gap-2"><select value={finType} onChange={e => setFinType(e.target.value as 'income' | 'expense')} className="bg-[#0a0a0a] border border-[#1e1e1e] rounded px-2 py-1.5 text-xs font-mono text-[#f5f5f5] focus:outline-none focus:border-[#333]"><option value="expense">Gasto</option><option value="income">Ingreso</option></select><input type="number" min="0" placeholder="Monto USD" value={finAmount} onChange={e => setFinAmount(e.target.value)} className="w-24 bg-[#0a0a0a] border border-[#1e1e1e] rounded px-2 py-1.5 text-xs font-mono text-[#f5f5f5] placeholder-[#333] focus:outline-none focus:border-[#333]" /><input type="text" placeholder="Descripcion" value={finDesc} onChange={e => setFinDesc(e.target.value)} className="flex-1 bg-[#0a0a0a] border border-[#1e1e1e] rounded px-2 py-1.5 text-xs font-mono text-[#f5f5f5] placeholder-[#333] focus:outline-none focus:border-[#333]" /><button onClick={handleAddFinance} className="text-[10px] font-mono px-3 py-1.5 rounded bg-[#1a1a1a] text-[#555] border border-[#222] hover:bg-[#222]">+ Agregar</button></div></Card>
            <Card><Label>Senal rapida</Label><div className="flex gap-2"><input type="text" placeholder="Registrar senal o patron..." value={signalContent} onChange={e => setSignalContent(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleAddSignal() }} className="flex-1 bg-[#0a0a0a] border border-[#1e1e1e] rounded px-2 py-1.5 text-xs font-mono text-[#f5f5f5] placeholder-[#333] focus:outline-none focus:border-[#333]" /><button onClick={handleAddSignal} className="text-[10px] font-mono px-3 py-1.5 rounded bg-[#1a1a1a] text-[#555] border border-[#222] hover:bg-[#222]">+ Agregar</button></div></Card>
          </div>
        </div>
        <div className="mt-8 pt-4 border-t border-[#111] flex items-center justify-between">
          <span className="text-[10px] text-[#222] font-mono uppercase tracking-widest">Datos locales</span>
          <div className="flex gap-3"><button onClick={handleResetAll} className="text-[10px] font-mono text-[#333] hover:text-[#555] border border-[#1a1a1a] px-2 py-1 rounded hover:border-[#333]">Resetear a fixtures</button><button onClick={handleClearAll} className="text-[10px] font-mono text-[#2a2a2a] hover:text-[#ef4444] border border-[#1a1a1a] px-2 py-1 rounded hover:border-[#ef4444]/30">Borrar todo</button></div>
        </div>
        <RichContextDebugPanel />
        <div className="mt-8 pt-4 border-t border-[#1a1a1a] flex justify-between">
          <span className="text-[10px] text-[#222] font-mono">SIR V2 - Fase 2 - Stores</span>
          <span className="text-[10px] text-[#222] font-mono">datos a senales a contexto a memoria a timing a recomendacion a accion</span>
        </div>
      </div>
    </div>
  )
}
