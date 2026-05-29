'use client'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import Link from 'next/link'
import { Brain, Activity, Plus, Moon, Heart, Clock, Scale, ArrowRight } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SectionTitle } from '@/components/ui/section-title'
import { useSelfStore } from '@/stores/useSelfStore'
import { useMemoryStore } from '@/stores'
import { analyzeBiologicalState, analyzeSleepTrend } from '@/engines/biological'
import { createSelfMetricMemory, createSleepMemory } from '@/engines/memory'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { RouteSkeleton } from '@/components/skeletons/RouteSkeleton'
import { cn } from '@/lib/utils'
import type { MetricCategory, HealthMetricType } from '@/types'

const METRIC_CATS: MetricCategory[] = ['energy', 'mood', 'stress', 'focus', 'motivation', 'confidence']
const HEALTH_TYPES: HealthMetricType[] = ['weight', 'heart_rate', 'steps', 'calories', 'hydration', 'blood_pressure', 'custom']
const CAT_LABEL: Record<MetricCategory, string> = {
  energy: 'Energia', mood: 'Animo', stress: 'Estres',
  focus: 'Enfoque', motivation: 'Motivacion', confidence: 'Confianza',
}

const cardClass = 'shadow-none transition-colors duration-200 hover:border-primary/30'

type Tone = 'ok' | 'warn' | 'bad'
function statTextClass(t: Tone): string {
  return t === 'ok' ? 'text-emerald-400' : t === 'warn' ? 'text-amber-400' : 'text-red-400'
}

export default function SelfPage() {
  const hydrated = useHasHydrated()
  if (!hydrated) return <RouteSkeleton cards={4} />
  return <SelfContent />
}

function SelfContent() {
  const { selfMetrics, sleepRecords, healthMetrics, addSelfMetric, addSleepRecord, addHealthMetric } = useSelfStore()
  const { addMemory } = useMemoryStore()
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
    if (isNaN(v) || v < 1 || v > 10) { toast.error('Valor invalido', { description: 'Debe estar entre 1 y 10.' }); return }
    const metric = { id: 'm_' + Date.now(), category: mCat, value: v, timestamp: new Date().toISOString(), note: mNote || undefined }
    addSelfMetric(metric); addMemory(createSelfMetricMemory(metric))
    setMVal(''); setMNote('')
    toast.success('Metrica registrada', { description: `${CAT_LABEL[mCat]}: ${v}/10` })
  }
  function addSleep() {
    const h = parseFloat(sHours)
    if (isNaN(h) || h < 0 || h > 24) { toast.error('Horas invalidas', { description: 'Debe estar entre 0 y 24.' }); return }
    const q = parseInt(sQual)
    if (isNaN(q) || q < 1 || q > 10) { toast.error('Calidad invalida', { description: 'Debe estar entre 1 y 10.' }); return }
    const sleepRecord = { id: 'sl_' + Date.now(), date: new Date().toISOString().split('T')[0], bedtime: sBed, wakeTime: sWake, duration: h, quality: q }
    addSleepRecord(sleepRecord); addMemory(createSleepMemory(sleepRecord))
    setSHours('')
    toast.success('Sueno registrado', { description: `${h}h · calidad ${q}/10` })
  }
  function addHealth() {
    const v = parseFloat(hVal)
    if (isNaN(v)) { toast.error('Valor invalido', { description: 'Ingresa un numero valido.' }); return }
    addHealthMetric({ id: 'h_' + Date.now(), type: hType, value: v, unit: hUnit, timestamp: new Date().toISOString() })
    setHVal('')
    toast.success('Registro de salud agregado', { description: `${hType}: ${v} ${hUnit}` })
  }

  const eC: Tone = bio.energyLevel >= 7 ? 'ok' : bio.energyLevel >= 4 ? 'warn' : 'bad'
  const sC: Tone = sleepTrend.averageDuration >= 7 ? 'ok' : sleepTrend.averageDuration >= 5 ? 'warn' : 'bad'
  const qC: Tone = sleepTrend.averageQuality >= 6 ? 'ok' : 'warn'
  const dC: Tone = bio.sleepDebt < 2 ? 'ok' : bio.sleepDebt < 5 ? 'warn' : 'bad'

  const stats: { label: string; value: string; unit: string; tone: Tone }[] = [
    { label: 'Energia', value: bio.energyLevel.toFixed(1), unit: '/10', tone: eC },
    { label: 'Sueno prom.', value: sleepTrend.averageDuration.toFixed(1), unit: 'h', tone: sC },
    { label: 'Calidad sueno', value: sleepTrend.averageQuality.toFixed(1), unit: '/10', tone: qC },
    { label: 'Deuda sueno', value: bio.sleepDebt.toFixed(1), unit: 'h', tone: dC },
  ]

  return (
    <AppShell>
      <div className="mb-8">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mb-1">SIR V2</div>
        <div className="flex items-center gap-3 mt-1">
          <Brain size={28} strokeWidth={1.5} className="text-muted-foreground" />
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Self</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">Estado biologico y metricas personales</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {stats.map((s) => (
          <Card key={s.label} className={cardClass}>
            <CardContent className="p-3 sm:p-4">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-1">{s.label}</div>
              <div className={cn('text-xl sm:text-2xl font-mono font-bold tabular-nums', statTextClass(s.tone))}>
                {s.value}<span className="text-sm text-muted-foreground/50">{s.unit}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className={cn('mb-4', cardClass)}>
        <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex-shrink-0 w-10 h-10 rounded-md bg-primary/10 border border-primary/30 flex items-center justify-center">
              <Scale size={18} strokeWidth={1.75} className="text-primary" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground">Captura báscula con foto</div>
              <div className="text-xs text-muted-foreground leading-snug">
                Subí el screenshot y Claude Vision extrae las 13 métricas automáticamente.
              </div>
            </div>
          </div>
          <Button size="sm" asChild className="flex-shrink-0">
            <Link href="/capture/scale" className="inline-flex items-center gap-1.5">
              + Subir foto
              <ArrowRight size={13} strokeWidth={1.75} aria-hidden="true" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card className={cardClass}>
          <CardContent className="p-4 sm:p-6">
            <SectionTitle icon={Plus} label="Registrar metrica" />
            <div className="space-y-2">
              <Select value={mCat} onValueChange={(v) => setMCat(v as MetricCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {METRIC_CATS.map(c => <SelectItem key={c} value={c}>{CAT_LABEL[c]}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input type="number" min="1" max="10" step="0.5" placeholder="Valor (1-10)" value={mVal} onChange={e => setMVal(e.target.value)} className="font-mono tabular-nums" />
              <Input type="text" placeholder="Nota opcional" value={mNote} onChange={e => setMNote(e.target.value)} />
              <Button onClick={addMetric} variant="outline" className="w-full">+ Registrar</Button>
            </div>
          </CardContent>
        </Card>

        <Card className={cardClass}>
          <CardContent className="p-4 sm:p-6">
            <SectionTitle icon={Moon} label="Registrar sueno" />
            <div className="space-y-2">
              <Input type="number" min="0" max="24" step="0.5" placeholder="Horas dormidas" value={sHours} onChange={e => setSHours(e.target.value)} className="font-mono tabular-nums" />
              <div className="flex gap-2">
                <Input type="time" value={sBed} onChange={e => setSBed(e.target.value)} className="font-mono" />
                <Input type="time" value={sWake} onChange={e => setSWake(e.target.value)} className="font-mono" />
              </div>
              <Input type="number" min="1" max="10" placeholder="Calidad (1-10)" value={sQual} onChange={e => setSQual(e.target.value)} className="font-mono tabular-nums" />
              <Button onClick={addSleep} variant="outline" className="w-full">+ Registrar sueno</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className={cn('mb-4', cardClass)}>
        <CardContent className="p-4 sm:p-6">
          <SectionTitle icon={Activity} label="Ultimas metricas" count={recentMetrics.length} />
          {recentMetrics.length === 0 ? (
            <div className="text-center py-8">
              <Activity size={24} strokeWidth={1.5} className="text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Sin metricas todavia</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Registra tu primera medicion arriba.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {recentMetrics.map((m) => (
                <div key={m.id} className="flex justify-between items-center py-1.5 border-b border-border/40 last:border-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] font-normal">{CAT_LABEL[m.category] || m.category}</Badge>
                    {m.note && <span className="text-xs text-muted-foreground">{m.note}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn('text-sm font-mono tabular-nums', m.value >= 7 ? 'text-emerald-400' : m.value >= 4 ? 'text-amber-400' : 'text-red-400')}>{m.value}/10</span>
                    <span className="text-[10px] text-muted-foreground/60 font-mono tabular-nums">{new Date(m.timestamp).toLocaleDateString('es', { day: '2-digit', month: '2-digit' })}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {lastSleep && (
        <Card className={cn('mb-4', cardClass)}>
          <CardContent className="p-4 sm:p-6">
            <SectionTitle icon={Clock} label="Ultima noche" />
            <div className="flex gap-6 flex-wrap">
              <div><div className="text-[10px] text-muted-foreground/60">Fecha</div><div className="text-sm font-mono tabular-nums">{lastSleep.date}</div></div>
              <div><div className="text-[10px] text-muted-foreground/60">Duracion</div><div className="text-sm font-mono tabular-nums">{lastSleep.duration}h</div></div>
              <div><div className="text-[10px] text-muted-foreground/60">Calidad</div><div className="text-sm font-mono tabular-nums">{lastSleep.quality}/10</div></div>
              <div><div className="text-[10px] text-muted-foreground/60">Horario</div><div className="text-sm font-mono tabular-nums">{lastSleep.bedtime}-{lastSleep.wakeTime}</div></div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className={cardClass}>
        <CardContent className="p-4 sm:p-6">
          <SectionTitle icon={Heart} label="Salud basica" count={healthMetrics.length} />
          <div className="flex flex-wrap gap-2 mb-3">
            <Select value={hType} onValueChange={(v) => setHType(v as HealthMetricType)}>
              <SelectTrigger className="flex-1 min-w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {HEALTH_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="number" placeholder="Valor" value={hVal} onChange={e => setHVal(e.target.value)} className="w-24 font-mono tabular-nums" />
            <Input type="text" placeholder="Unidad" value={hUnit} onChange={e => setHUnit(e.target.value)} className="w-20" />
            <Button onClick={addHealth} variant="outline" size="sm" className="w-full sm:w-auto">+ Agregar</Button>
          </div>
          {healthMetrics.length === 0 ? (
            <div className="text-center py-6">
              <Heart size={20} strokeWidth={1.5} className="text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">Sin registros de salud.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {[...healthMetrics].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 8).map((h) => (
                <div key={h.id} className="flex justify-between py-1 border-b border-border/40 last:border-0">
                  <span className="text-xs text-muted-foreground">{h.type}</span>
                  <span className="text-xs font-mono tabular-nums">{h.value} {h.unit}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  )
}
