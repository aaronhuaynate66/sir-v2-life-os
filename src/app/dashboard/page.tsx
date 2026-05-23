'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { calculatePeaceScore, evaluateRecoveryMode, detectPeaceThreats } from '@/engines/peace'
import { analyzeBiologicalState, analyzeSleepTrend } from '@/engines/biological'
import { analyzeFinancialStability, detectFinancialAlerts } from '@/engines/financial'
import { detectRelationshipAlerts } from '@/engines/relationship'
import { buildSignalContext } from '@/engines/signal'
import { generateRecommendations } from '@/engines/recommendation'
import { buildGoalDashboard } from '@/engines/goal'
import { getCurrentTimingWindow } from '@/engines/timing'
import { fixturePeople, fixtureRelationships, fixtureGoals, fixtureSignals, fixtureSleepRecords, fixtureMetrics, fixtureFinancialMovements } from '@/data/fixtures'

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
  const now = new Date()
  const bio = useMemo(() => analyzeBiologicalState(fixtureSleepRecords, fixtureMetrics), [])
  const sleep = useMemo(() => analyzeSleepTrend(fixtureSleepRecords.slice(-7)), [])
  const fin = useMemo(() => analyzeFinancialStability(fixtureFinancialMovements, 2.5), [])
  const finAlerts = useMemo(() => detectFinancialAlerts(fixtureFinancialMovements, 2.5), [])
  const relAlerts = useMemo(() => detectRelationshipAlerts(fixturePeople, fixtureRelationships), [])
  const signals = useMemo(() => buildSignalContext(fixtureSignals), [])
  const goals = useMemo(() => buildGoalDashboard(fixtureGoals), [])
  const timing = getCurrentTimingWindow(bio, now.getHours())

  const peace = useMemo(() => calculatePeaceScore({
    biologicalState: bio,
    financialState: { stabilityScore: fin.stability, monthlyBalance: fin.monthlyBalance, liquidityMonths: 2.5, activeAlerts: finAlerts.map(a => a.message), timestamp: new Date().toISOString() },
    goals: fixtureGoals, moodScore: 6.5, relationshipAlertCount: relAlerts.length
  }), [bio, fin, finAlerts, relAlerts])

  const recovery = useMemo(() => evaluateRecoveryMode(peace), [peace])
  const threats = useMemo(() => detectPeaceThreats(peace), [peace])
  const recs = useMemo(() => generateRecommendations({ peaceScore: peace, biologicalState: bio, activeGoals: fixtureGoals, activeSignals: fixtureSignals, relationshipAlerts: relAlerts }), [peace, bio, relAlerts])
  const topRec = recs[0]

  const mode = peace.recoveryMode || bio.energyLevel < 4 ? 'recovery' : peace.total > 8 && bio.energyLevel > 7 ? 'strategic' : bio.energyLevel > 7 ? 'focused' : 'normal'
  const modeBadge: Record<string, string> = { normal: 'text-[#22c55e] border-[#22c55e]/30 bg-[#22c55e]/10', focused: 'text-[#3b82f6] border-[#3b82f6]/30 bg-[#3b82f6]/10', recovery: 'text-[#ef4444] border-[#ef4444]/30 bg-[#ef4444]/10', strategic: 'text-[#d4af37] border-[#d4af37]/30 bg-[#d4af37]/10' }
  const modeLabel: Record<string, string> = { normal: 'OPERATIVO', focused: 'ENFOCADO', recovery: 'RECUPERACION', strategic: 'ESTRATEGICO' }
  const peaceColor = peace.total >= 7 ? 'text-[#22c55e]' : peace.total >= 4 ? 'text-[#f59e0b]' : 'text-[#ef4444]'

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5]">
      {recovery.active && (
        <div className="fixed top-0 inset-x-0 z-50 bg-[#ef4444]/10 border-b border-[#ef4444]/20 px-6 py-2">
          <div className="max-w-5xl mx-auto flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-[#ef4444] animate-pulse" />
            <span className="text-xs text-[#ef4444] font-mono">RECOVERY MODE — {recovery.reason}</span>
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-6 py-8">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-between items-start mb-8">
          <div>
            <div className="text-[10px] text-[#333] font-mono uppercase tracking-widest mb-1">SIR V2 — Life Operating System</div>
            <h1 className="text-lg font-medium">Mission Control</h1>
            <div className="text-xs text-[#444] mt-1 capitalize">{now.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          </div>
          <div className="text-right flex flex-col items-end gap-2">
            <div className="text-2xl font-mono text-[#2a2a2a]">{now.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</div>
            <Badge label={modeLabel[mode] || 'OPERATIVO'} color={modeBadge[mode] || modeBadge.normal} />
          </div>
        </motion.div>

        <Card className="mb-6 border-[#1a1a1a]">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-[10px] text-[#2a2a2a] uppercase tracking-widest font-mono mb-1">Mision</div>
              <div className="text-[#555]">Conseguir Paz.</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-[#2a2a2a] uppercase tracking-widest font-mono mb-1">Ventana actual</div>
              <div className={`text-xs ${timing.type === 'peak' ? 'text-[#22c55e]' : timing.type === 'avoid' ? 'text-[#f59e0b]' : 'text-[#444]'}`}>{timing.description}</div>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 md:col-span-4 space-y-4">
            <Card>
              <div className="flex flex-col gap-1">
                <div className="text-[10px] text-[#444] uppercase tracking-widest font-mono">Peace Score</div>
                <div className={`text-5xl font-mono font-bold ${peaceColor}`}>{peace.total.toFixed(1)}<span className="text-xl text-[#333]">/10</span></div>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${peaceColor.replace('text-', 'bg-')} animate-pulse`} />
                  <span className="text-xs text-[#555]">{peace.trend === 'improving' ? '↑ Mejorando' : peace.trend === 'declining' ? '↓ Declinando' : '→ Estable'}</span>
                </div>
              </div>
              {threats.length > 0 && (
                <div className="mt-4 pt-4 border-t border-[#1a1a1a] space-y-2">
                  {threats.map((t, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <span className={`w-1 h-1 rounded-full mt-1.5 flex-shrink-0 ${t.severity === 'critical' || t.severity === 'high' ? 'bg-[#ef4444]' : 'bg-[#f59e0b]'}`} />
                      <span className="text-[11px] text-[#444]">{t.description}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <Label>Biologia</Label>
              <Row label="Sueno anoche" value={`${bio.lastSleepDuration}h`} status={bio.lastSleepDuration >= 7 ? 'ok' : bio.lastSleepDuration >= 6 ? 'warn' : 'bad'} />
              <Row label="Calidad sueno" value={`${bio.lastSleepQuality}/10`} status={bio.lastSleepQuality >= 7 ? 'ok' : 'warn'} />
              <Row label="Energia" value={`${bio.energyLevel.toFixed(1)}/10`} status={bio.energyLevel >= 6 ? 'ok' : 'warn'} />
              <Row label="Estres" value={`${bio.stressLevel.toFixed(1)}/10`} status={bio.stressLevel <= 5 ? 'ok' : bio.stressLevel <= 7 ? 'warn' : 'bad'} />
              <Row label="Recuperacion" value={`${bio.recoveryScore.toFixed(1)}/10`} status={bio.recoveryScore >= 6 ? 'ok' : 'warn'} />
              {sleep.sleepDebt > 2 && <div className="mt-3 pt-3 border-t border-[#1a1a1a] text-[11px] text-[#f59e0b]">⚠ Deuda sueno: {sleep.sleepDebt.toFixed(1)}h</div>}
            </Card>

            <Card>
              <Label>Finanzas</Label>
              <Row label="Estabilidad" value={`${fin.stability.toFixed(1)}/10`} status={fin.riskLevel === 'low' ? 'ok' : fin.riskLevel === 'medium' ? 'warn' : 'bad'} />
              <Row label="Balance mensual" value={`$${fin.monthlyBalance.toLocaleString()}`} status={fin.monthlyBalance > 0 ? 'ok' : 'bad'} />
              <Row label="Tasa ahorro" value={`${fin.savingsRate.toFixed(0)}%`} status={fin.savingsRate >= 20 ? 'ok' : fin.savingsRate >= 10 ? 'warn' : 'bad'} />
              {finAlerts[0] && <div className="mt-3 pt-3 border-t border-[#1a1a1a] text-[11px] text-[#f59e0b]">⚠ {finAlerts[0].message}</div>}
            </Card>
          </div>

          <div className="col-span-12 md:col-span-8 space-y-4">
            {topRec && (
              <Card className="border-[#2a2a2a]">
                <Label>Recomendacion Principal</Label>
                <div className="flex gap-3">
                  <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${topRec.priority === 'critical' ? 'bg-[#ef4444]' : topRec.priority === 'high' ? 'bg-[#f59e0b]' : 'bg-[#3b82f6]'}`} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium">{topRec.title}</span>
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${topRec.timing === 'now' ? 'bg-[#ef4444]/20 text-[#ef4444]' : topRec.timing === 'today' ? 'bg-[#f59e0b]/20 text-[#f59e0b]' : 'bg-[#1e1e1e] text-[#555]'}`}>
                        {topRec.timing === 'now' ? 'AHORA' : topRec.timing === 'today' ? 'HOY' : topRec.timing === 'this_week' ? 'ESTA SEMANA' : 'CUANDO LISTO'}
                      </span>
                    </div>
                    <p className="text-xs text-[#555] leading-relaxed">{topRec.description}</p>
                    <div className="mt-2 text-[10px] text-[#333] font-mono">{topRec.reasoning}</div>
                    <div className="mt-2 flex gap-3">
                      <span className="text-[10px] text-[#333]">Impacto paz: +{topRec.expectedPeaceImpact}</span>
                      <span className="text-[10px] text-[#333]">Confianza: {Math.round(topRec.confidence * 100)}%</span>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            <Card>
              <Label>Objetivos — {goals.criticalGoals.length} criticos</Label>
              <div className="space-y-3">
                {goals.activeGoals.slice(0, 3).map(g => (
                  <div key={g.id}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs">{g.title}</span>
                      <span className={`text-[9px] font-mono px-1 py-0.5 rounded ${g.priority === 'critical' ? 'bg-[#ef4444]/20 text-[#ef4444]' : 'bg-[#f59e0b]/20 text-[#f59e0b]'}`}>{g.priority.toUpperCase()}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-1 bg-[#1e1e1e] rounded-full overflow-hidden">
                        <div className="h-full bg-[#3b82f6] rounded-full" style={{ width: `${g.progress}%` }} />
                      </div>
                      <span className="text-[10px] font-mono text-[#444] w-8 text-right">{g.progress}%</span>
                    </div>
                    {g.nextAction && <div className="text-[10px] text-[#333] mt-0.5">→ {g.nextAction}</div>}
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <Label>Senales — {signals.activeSignals.length} activas {signals.hasImmediateAlert && <span className="text-[#ef4444]">● URGENTE</span>}</Label>
              <div className="space-y-2">
                {signals.activeSignals.slice(0, 3).map(s => (
                  <div key={s.id} className="flex gap-3 py-2 border-b border-[#1a1a1a] last:border-0">
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${s.urgency === 'immediate' ? 'bg-[#ef4444] animate-pulse' : s.urgency === 'soon' ? 'bg-[#f59e0b]' : 'bg-[#333]'}`} />
                    <div className="flex-1">
                      <div className="text-xs mb-0.5">{s.meaning || s.content}</div>
                      <div className="flex gap-2 text-[10px] text-[#333]">
                        <span className="font-mono uppercase">{s.source}</span>
                        <span>·</span>
                        <span>Intensidad {s.strength}/10</span>
                      </div>
                      {s.suggestedAction && <div className="text-[10px] text-[#444] mt-0.5">→ {s.suggestedAction}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {relAlerts.length > 0 && (
              <Card>
                <Label>Alertas Relacionales — {relAlerts.length}</Label>
                {relAlerts.slice(0, 2).map((a, i) => (
                  <div key={i} className="flex gap-3 mb-2 last:mb-0">
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${a.urgency === 'immediate' ? 'bg-[#ef4444]' : 'bg-[#f59e0b]'}`} />
                    <div>
                      <div className="text-xs">{a.personName}</div>
                      <div className="text-[11px] text-[#444]">{a.message}</div>
                      <div className="text-[10px] text-[#333] mt-0.5">→ {a.suggestedAction}</div>
                    </div>
                  </div>
                ))}
              </Card>
            )}
          </div>
        </div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
          className="mt-8 pt-4 border-t border-[#1a1a1a] flex justify-between">
          <span className="text-[10px] text-[#222] font-mono">SIR V2 — Fase 1 — Fundacion</span>
          <span className="text-[10px] text-[#222] font-mono">datos → senales → contexto → memoria → timing → recomendacion → accion</span>
        </motion.div>
      </div>
    </div>
  )
}
