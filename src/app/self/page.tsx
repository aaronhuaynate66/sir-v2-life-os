'use client'
// SIR V2 — /self
// Estado biologico, metricas, sueno
import { useMemo, useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { Card, Badge, Button, Input, Select, SectionHeader, EmptyState } from '@/components/ui'
import { useSelfStore } from '@/stores/useSelfStore'
import { analyzeBiologicalState, analyzeSleepTrend } from '@/engines/biological'
import type { MetricCategory, HealthMetricType } from '@/types'

const METRIC_CATS: MetricCategory[] = ['energy', 'mood', 'stress', 'focus', 'motivation', 'confidence']
const HEALTH_TYPES: HealthMetricType[] = ['weight', 'heart_rate', 'steps', 'calories', 'hydration', 'blood_pressure', 'custom']

const CAT_LABEL: Record<MetricCategory, string> = {
  energy: 'Energia', mood: 'Animo', stress: 'Estres', focus: 'Enfoque', motivation: 'Motivacion', confidence: 'Confianza'
}

export default function SelfPage() {
  const { selfMetrics, sleepRecords, healthMetrics, addSelfMetric, addSleepRecord, addHealthMetric } = useSelfStore()

  const [mCat, setMCat] = useState<MetricCategory>('energy')
  const [mVal, setMVal] = useState('')
  const [mNote, setMNote] = useState('')

  const [sHours, setSHours] = useState('')
  const [sQual, setSQual] = useState('7')
  const [sBed, setSBed] = useState('23:00')
  const [sWake, setSWake] = useState('07:00')

  const [hType, setHType] = useState<HealthMetricType>('weight')
  const [hVal, setHVal] = useState('')
  const [hUnit, setHUnit] = useState('kg')

  const bio = useMemo(() => analyzeBiologicalState(sleepRecords, selfMetrics), [sleepRecords, selfMetrics])
  const sleepTrend = useMemo(() => analyzeSleepTrend(sleepRecords.slice(-7)), [sleepRecords])

  const recentMetrics = [...selfMetrics].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 12)
  const lastSleep = [...sleepRecords].sort((a, b) => b.date.localeCompare(a.date))[0]

  function addMetric() {
    const v = parseFloat(mVal)
    if (isNaN(v) || v < 1 || v > 10) return
    addSelfMetric({ id: `m_${Date.now()}`, category: mCat, value: v, timestamp: new Date().toISOString(), notes: mNote || undefined })
    setMVal(''); setMNote('')
  }

  function addSleep() {
    const h = parseFloat(sHours)
    if (isNaN(h) || h < 0 || h > 24) return
    const today = new Date().toISOString().split('T')[0]
    addSleepRecord({ id: `sl_${Date.now()}`, date: today, bedtime: sBed, wakeTime: sWake, duration: h, quality: parseInt(sQual) })
    setSHours('')
  }

  function addHealth() {
    const v = parseFloat(hVal)
    if (isNaN(v)) return
    addHealthMetric({ id: `h_${Date.now()}`, type: hType, value: v, unit: hUnit, timestamp: new Date().toISOString() })
    setHVal('')
  }

  const energyColor = bio.energyLevel >= 7 ? 'ok' : bio.energyLevel >= 4 ? 'warn' : 'bad'
  const sleepColor = sleepTrend.averageDuration >= 7 ? 'ok' : sleepTrend.averageDuration >= 5 ? 'warn' : 'bad'

  return (
    <AppShell>
      <SectionHeader title="Self" subtitle="Estado biologico y metricas personales" />

      {/* Estado biologico summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Energia', value: bio.energyLevel.toFixed(1), unit: '/10', variant: energyColor },
          { label: 'Sueno prom.', value: sleepTrend.averageDuration.toFixed(1), unit: 'h', variant: sleepColor },
          { label: 'Calidad sueno', value: sleepTrend.averageQuality.toFixed(1), unit: '/10', variant: sleepTrend.averageQuality >= 6 ? 'ok' : 'warn' },
          { label: 'Deuda sueno', value: bio.sleepDebt.toFixed(1), unit: 'h', variant: bio.sleepDebt < 2 ? 'ok' : bio.sleepDebt < 5 ? 'warn' : 'bad' },
        ].map((s) => (
          <Card key={s.label} className="flex flex-col gap-1">
            <div className="text-[9px] font-mono text-[#333] uppercase tracking-widest">{s.label}</div>
            <div className={`text-2xl font-mono font-bold ${s.variant === 'ok' ? 'text-[#22c55e]' : s.variant === 'warn' ? 'text-[#f59e0b]' : 'text-[#ef4444]'}`}>
              {s.value}<span className="text-sm text-[#333]">{s.unit}</span>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Registrar metrica */}
        <Card>
          <div className="text-[10px] font-mono text-[#333] uppercase tracking-widest mb-3">Registrar metrica</div>
          <div className="space-y-2">
            <Select value={mCat} onChange={e => setMCat(e.target.value as MetricCategory)}>
              {METRIC_CATS.map(c => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
            </Select>
            <Input type="number" min="1" max="10" step="0.5" placeholder="Valor (1–10)" value={mVal} onChange={e => setMVal(e.target.value)} />
            <Input type="text" placeholder="Nota opcional" value={mNote} onChange={e => setMNote(e.target.value)} />
            <Button onClick={addMetric} className="w-full">+ Registrar</Button>
          </div>
        </Card>

        {/* Registrar sueno */}
        <Card>
          <div className="text-[10px] font-mono text-[#333] uppercase tracking-widest mb-3">Registrar sueno</div>
          <div className="space-y-2">
            <Input type="number" min="0" max="24" step="0.5" placeholder="Horas dormidas" value={sHours} onChange={e => setSHours(e.target.value)} />
            <div className="flex gap-2">
              <Input type="time" value={sBed} onChange={e => setSBed(e.target.value)} />
              <Input type="time" value={sWake} onChange={e => setSWake(e.target.value)} />
            </div>
            <Input type="number" min="1" max="10" placeholder="Calidad (1–10)" value={sQual} onChange={e => setSQual(e.target.value)} />
            <Button onClick={addSleep} className="w-full">+ Registrar sueno</Button>
          </div>
        </Card>
      </div>

      {/* Ultimas metricas */}
      <Card className="mb-4">
        <div className="text-[10px] font-mono text-[#333] uppercase tracking-widest mb-3">Ultimas metricas</div>
        {recentMetrics.length === 0 ? (
          <EmptyState message="Sin metricas. Registra tu primer valor." />
        ) : (
          <div className="space-y-1">
            {recentMetrics.map((m) => (
              <div key={m.id} className="flex justify-between items-center py-1.5 border-b border-[#1a1a1a] last:border-0">
                <div className="flex items-center gap-2">
                  <Badge label={CAT_LABEL[m.category] || m.category} variant="muted" />
                  {m.notes && <span className="text-[10px] text-[#333]">{m.notes}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-mono ${m.value >= 7 ? 'text-[#22c55e]' : m.value >= 4 ? 'text-[#f59e0b]' : 'text-[#ef4444]'}`}>{m.value}/10</span>
                  <span className="text-[9px] text-[#222]">{new Date(m.timestamp).toLocaleDateString('es', { day: '2-digit', month: '2-digit' })}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Ultimo sueno */}
      {lastSleep && (
        <Card className="mb-4">
          <div className="text-[10px] font-mono text-[#333] uppercase tracking-widest mb-3">Ultima noche</div>
          <div className="flex gap-6 flex-wrap">
            <div><div className="text-[9px] text-[#333] font-mono">Fecha</div><div className="text-sm font-mono text-[#f5f5f5]">{lastSleep.date}</div></div>
            <div><div className="text-[9px] text-[#333] font-mono">Duracion</div><div className="text-sm font-mono text-[#f5f5f5]">{lastSleep.duration}h</div></div>
            <div><div className="text-[9px] text-[#333] font-mono">Calidad</div><div className="text-sm font-mono text-[#f5f5f5]">{lastSleep.quality}/10</div></div>
            <div><div className="text-[9px] text-[#333] font-mono">Dormir / Despertar</div><div className="text-sm font-mono text-[#f5f5f5]">{lastSleep.bedtime} → {lastSleep.wakeTime}</div></div>
          </div>
        </Card>
      )}

      {/* Salud basica */}
      <Card>
        <div className="text-[10px] font-mono text-[#333] uppercase tracking-widest mb-3">Salud basica</div>
        <div className="flex gap-2 mb-3">
          <Select value={hType} onChange={e => setHType(e.target.value as HealthMetricType)} className="flex-1">
            {HEALTH_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </Select>
          <Input type="number" placeholder="Valor" value={hVal} onChange={e => setHVal(e.target.value)} className="w-24" />
          <Input type="text" placeholder="Unidad" value={hUnit} onChange={e => setHUnit(e.target.value)} className="w-16" />
          <Button onClick={addHealth}>+ Agregar</Button>
        </div>
        {healthMetrics.length === 0 ? (
          <div className="text-[10px] text-[#222] font-mono">Sin registros de salud.</div>
        ) : (
          <div className="space-y-1">
            {[...healthMetrics].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 8).map((h) => (
              <div key={h.id} className="flex justify-between py-1 border-b border-[#1a1a1a] last:border-0">
                <span className="text-xs text-[#555]">{h.type}</span>
                <span className="text-xs font-mono text-[#f5f5f5]">{h.value} {h.unit}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </AppShell>
  )
}
