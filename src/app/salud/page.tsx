'use client'
// SIR V2 — /salud: estado biológico, métricas, tendencias y captura de datos de salud.
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Activity, Plus, Moon, Heart, Clock, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CollapsibleSection } from '@/components/ui/collapsible-section'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SectionTitle } from '@/components/ui/section-title'
import { EmptyState } from '@/components/ui/empty-state'
import { useSelfStore } from '@/stores/useSelfStore'
import { useMemoryStore } from '@/stores'
import { analyzeBiologicalState, analyzeSleepTrend } from '@/engines/biological'
import { createSelfMetricMemory, createSleepMemory } from '@/engines/memory'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { RouteSkeleton } from '@/components/skeletons/RouteSkeleton'
import { getHealthMetricLabel } from '@/lib/health-metrics/labels'
import { TrendChart } from '@/components/charts/TrendChart'
import { BodyMetricsTrend } from '@/components/charts/BodyMetricsTrend'
import dynamic from 'next/dynamic'
// Los 3 paneles pesados de /salud viven bajo el fold; dynamic + ssr:false
// los saca del First Load JS del route inicial.
const PatronesPanel = dynamic(
  () => import('@/components/salud/PatronesPanel').then((m) => ({ default: m.PatronesPanel })),
  { ssr: false, loading: () => <div className="h-32 rounded-lg border border-border animate-pulse" /> },
)
const LearningCard = dynamic(
  () => import('@/components/salud/LearningCard').then((m) => ({ default: m.LearningCard })),
  { ssr: false },
)
const SintesisCruzadaPanel = dynamic(
  () => import('@/components/salud/SintesisCruzadaPanel').then((m) => ({ default: m.SintesisCruzadaPanel })),
  { ssr: false, loading: () => <div className="h-32 rounded-lg border border-border animate-pulse" /> },
)
const ChequeosPanel = dynamic(
  () => import('@/components/salud/ChequeosPanel').then((m) => ({ default: m.ChequeosPanel })),
  { ssr: false },
)
const HeartRateAlertsPanel = dynamic(
  () => import('@/components/salud/HeartRateAlertsPanel').then((m) => ({ default: m.HeartRateAlertsPanel })),
  { ssr: false, loading: () => <div className="h-32 rounded-lg border border-border animate-pulse" /> },
)
// Los dos que unifican lo médico. `TratamientosPanel` es EL MISMO componente que
// usa /medicacion — se reúsa, no se duplica: si mañana cambia, cambia en las dos.
const LazosMedicosPanel = dynamic(
  () => import('@/components/salud/LazosMedicosPanel').then((m) => ({ default: m.LazosMedicosPanel })),
  { ssr: false },
)
const TratamientosPanel = dynamic(
  () => import('@/components/medicacion/TratamientosPanel').then((m) => ({ default: m.TratamientosPanel })),
  { ssr: false, loading: () => <div className="h-32 rounded-lg border border-border animate-pulse" /> },
)
import { selfMetricSeries, sleepDurationSeries } from '@/lib/charts/adapters'
import { rangeWindowLabel, type ChartRange } from '@/lib/charts/series'
import { cn } from '@/lib/utils'
import type { MetricCategory, HealthMetricType } from '@/types'
import { MetricScale } from '@/components/yo/MetricScale'
import { MissingDataCard } from '@/components/salud/MissingDataCard'
import { SleepDebtCard } from '@/components/salud/SleepDebtCard'
import { SleepQualityCard } from '@/components/salud/SleepQualityCard'
import { SleepForecastCard } from '@/components/salud/SleepForecastCard'
import { SleepAftermathCard } from '@/components/salud/SleepAftermathCard'
import { EmotionWindowCard } from '@/components/salud/EmotionWindowCard'
import { ChronotypeCard } from '@/components/salud/ChronotypeCard'
import { EnergyCurveCard } from '@/components/salud/EnergyCurveCard'
import { FocusWindowCard } from '@/components/salud/FocusWindowCard'
import { TwoProcessCard } from '@/components/salud/TwoProcessCard'
import { WeatherMoodCard } from '@/components/system/WeatherMoodCard'
import { proposeEmotionLabels, emotionalDiversity } from '@/lib/emotion/granularity'
import { MisCapturas } from '@/components/yo/MisCapturas'
import { track, EVENTS } from '@/lib/analytics/track'

const METRIC_CATS: MetricCategory[] = ['energy', 'mood', 'stress', 'focus', 'motivation', 'confidence']
const HEALTH_TYPES: HealthMetricType[] = ['weight', 'heart_rate', 'hrv_avg', 'steps', 'calories', 'hydration', 'blood_pressure', 'custom']
const CAT_LABEL: Record<MetricCategory, string> = {
  energy: 'Energía', mood: 'Ánimo', stress: 'Estrés',
  focus: 'Enfoque', motivation: 'Motivación', confidence: 'Confianza',
}

const cardClass = 'transition-colors duration-200 hover:border-border-strong'

type Tone = 'ok' | 'warn' | 'bad'
function statTextClass(t: Tone): string {
  return t === 'ok' ? 'text-ok' : t === 'warn' ? 'text-warn' : 'text-bad'
}

// Métricas donde MENOS es mejor (estrés): el color se invierte. Para el resto
// (energía, ánimo, enfoque, motivación, confianza) más alto = mejor.
const INVERSE_METRICS: MetricCategory[] = ['stress']
function metricValueClass(category: MetricCategory, value: number): string {
  const v = INVERSE_METRICS.includes(category) ? 11 - value : value
  return v >= 7 ? 'text-ok' : v >= 4 ? 'text-warn' : 'text-bad'
}

export default function SaludPage() {
  const hydrated = useHasHydrated()
  if (!hydrated) return <RouteSkeleton cards={4} />
  return <SaludContent />
}

function SaludContent() {
  const { selfMetrics, sleepRecords, healthMetrics, addSelfMetric, addSleepRecord, addHealthMetric } = useSelfStore()
  const { addMemory } = useMemoryStore()
  const [logOpen, setLogOpen] = useState(false)
  const [mCat, setMCat] = useState<MetricCategory>('energy')
  const [mVal, setMVal] = useState('')
  const [mNote, setMNote] = useState('')
  const [sHours, setSHours] = useState('')
  const [sQual, setSQual] = useState('7')
  const [sBed, setSBed] = useState('23:00')
  const [sWake, setSWake] = useState('07:00')
  const [sDreams, setSDreams] = useState('')
  const [hType, setHType] = useState<HealthMetricType>('weight')
  const [hVal, setHVal] = useState('')
  const [hUnit, setHUnit] = useState('kg')
  const [hNote, setHNote] = useState('')

  const bio = useMemo(() => analyzeBiologicalState(sleepRecords, selfMetrics), [sleepRecords, selfMetrics])
  const sleepTrend = useMemo(() => analyzeSleepTrend(sleepRecords.slice(-7)), [sleepRecords])
  const recentMetrics = [...selfMetrics].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 12)
  const lastSleep = [...sleepRecords].sort((a, b) => b.date.localeCompare(a.date))[0]
  // Feature 3: series de evolución (energía + duración de sueño).
  const energySeries = useMemo(() => selfMetricSeries(selfMetrics, 'energy'), [selfMetrics])
  const sleepSeries = useMemo(() => sleepDurationSeries(sleepRecords), [sleepRecords])
  // Granularidad emocional (Barrett, 13·M3): cuántas emociones finas DISTINTAS
  // nombró en las notas de ánimo de los últimos ~60 días. Nombrar fino = mejor
  // regulación. Refuerza la práctica que ya proponen los chips de proposeEmotionLabels.
  const emotionGranularity = useMemo(() => {
    const cutoff = new Date(Date.now() - 60 * 86_400_000).toISOString()
    const notes = selfMetrics.filter((m) => m.category === 'mood' && m.timestamp >= cutoff).map((m) => m.note)
    return emotionalDiversity(notes)
  }, [selfMetrics])

  // Toggle GLOBAL de ventana temporal para TODOS los charts de la página
  // (Energía + Sueño + Tendencia corporal). Aaron: "en una card por semana y
  // en otra por mes, ¿por qué no se ve ordenado todo?" — 1 control, todo alineado.
  const [chartRange, setChartRange] = useState<ChartRange>('semana')
  const [chartOffset, setChartOffset] = useState(0)
  function setRangeGlobal(r: ChartRange) { setChartRange(r); setChartOffset(0) }

  function addMetric() {
    const v = parseFloat(mVal)
    if (isNaN(v) || v < 1 || v > 10) { toast.error('Valor inválido', { description: 'Debe estar entre 1 y 10.' }); return }
    const metric = { id: 'm_' + Date.now(), category: mCat, value: v, timestamp: new Date().toISOString(), note: mNote || undefined }
    addSelfMetric(metric); addMemory(createSelfMetricMemory(metric))
    track(EVENTS.moodLogged, { category: mCat })
    setMVal(''); setMNote('')
    toast.success('Métrica registrada', { description: `${CAT_LABEL[mCat]}: ${v}/10` })
  }
  function addSleep() {
    const h = parseFloat(sHours)
    if (isNaN(h) || h < 0 || h > 24) { toast.error('Horas inválidas', { description: 'Debe estar entre 0 y 24.' }); return }
    const q = parseInt(sQual)
    if (isNaN(q) || q < 1 || q > 10) { toast.error('Calidad inválida', { description: 'Debe estar entre 1 y 10.' }); return }
    const sleepRecord = { id: 'sl_' + Date.now(), date: new Date().toISOString().split('T')[0], bedtime: sBed, wakeTime: sWake, duration: h, quality: q, dreams: sDreams.trim() || undefined }
    addSleepRecord(sleepRecord); addMemory(createSleepMemory(sleepRecord))
    setSHours(''); setSDreams('')
    toast.success('Sueño registrado', { description: `${h}h · calidad ${q}/10` })
  }
  function addHealth() {
    const v = parseFloat(hVal)
    if (isNaN(v)) { toast.error('Valor inválido', { description: 'Ingresa un número válido.' }); return }
    addHealthMetric({ id: 'h_' + Date.now(), type: hType, value: v, unit: hUnit, timestamp: new Date().toISOString(), note: hNote.trim() || undefined })
    setHVal(''); setHNote('')
    toast.success('Registro de salud agregado', { description: `${getHealthMetricLabel(hType)}: ${v} ${hUnit}` })
  }

  const eC: Tone = bio.energyLevel >= 7 ? 'ok' : bio.energyLevel >= 4 ? 'warn' : 'bad'
  const sC: Tone = sleepTrend.averageDuration >= 7 ? 'ok' : sleepTrend.averageDuration >= 5 ? 'warn' : 'bad'
  const qC: Tone = sleepTrend.averageQuality >= 6 ? 'ok' : 'warn'
  const dC: Tone = bio.sleepDebt < 2 ? 'ok' : bio.sleepDebt < 5 ? 'warn' : 'bad'

  const stats: { label: string; value: string; unit: string; tone: Tone }[] = [
    { label: 'Energía', value: bio.energyLevel.toFixed(1), unit: '/10', tone: eC },
    { label: 'Sueño prom.', value: sleepTrend.averageDuration.toFixed(1), unit: 'h', tone: sC },
    { label: 'Calidad sueño', value: sleepTrend.averageQuality.toFixed(1), unit: '/10', tone: qC },
    { label: 'Deuda sueño', value: bio.sleepDebt.toFixed(1), unit: 'h', tone: dC },
  ]

  return (
    <AppShell>
      <div className="mb-8">
        <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary mb-1">SIR V2</div>
        <div className="flex items-center gap-3 mt-1">
          <Heart size={28} strokeWidth={1.5} className="text-muted-foreground" />
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Salud</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">Estado biológico, métricas y tus capturas de salud</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {stats.map((s) => (
          <Card key={s.label} className={cardClass}>
            <CardContent className="p-3 sm:p-4">
              <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary mb-1">{s.label}</div>
              <div className={cn('text-xl sm:text-2xl font-mono font-bold tabular-nums', statTextClass(s.tone))}>
                {s.value}<span className="text-sm text-muted-foreground/50">{s.unit}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recordatorio de data faltante — "que me diga falta el peso". Se auto-oculta
          si Aaron está al día. Arriba porque es accionable (mandar la captura). */}
      <MissingDataCard />

      {/* ═══ LO MÉDICO, PRIMERO ══════════════════════════════════════════════
          Aaron, 4-ago-2026, después de entrar acá: *"ha quedado horroroso, cero UX
          UI y orden, no se entiende para nada lo que tomo ni para qué ni por qué"*.

          La auditoría de ese día encontró que este bloque estaba DESPUÉS de ~7
          pantallas de análisis: el grid de stats, el control de tendencias, el
          acordeón de registro, dos gráficos de línea y las dos familias completas de
          tendencia corporal (hasta 8 tarjetas). Alguien con 4 recetas activas y un
          examen médico en 3 días tenía que scrollear todo el ruido analítico para
          llegar a sus medicamentos.

          Ahora va arriba, junto a lo accionable, y antes de cualquier gráfico. El
          análisis de tendencias no es urgente; saber qué tomar a las 22:00, sí. */}
      <div className="mb-6 space-y-4">
        <TratamientosPanel />
        <LazosMedicosPanel />
      </div>

      {/* Control GLOBAL de ventana temporal — aplica a Energía + Sueño +
          Tendencia corporal. Un solo toggle Semana/Mes + un solo par de chevrons. */}
      <Card className="shadow-none mb-3">
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Tendencias</div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-0.5 rounded-md bg-muted/40 p-0.5 text-[11px]">
                {(['semana', 'mes'] as ChartRange[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRangeGlobal(r)}
                    className={cn(
                      'px-2.5 py-0.5 rounded capitalize transition-colors',
                      chartRange === r ? 'bg-background text-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <button type="button" onClick={() => setChartOffset((o) => o + 1)}
                  className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 hover:bg-muted/50" aria-label="Período anterior">
                  <ChevronLeft size={14} />
                </button>
                <span className="font-mono tabular-nums min-w-[8ch] text-center">
                  {chartOffset === 0 ? (chartRange === 'semana' ? 'Esta semana' : 'Este mes') : rangeWindowLabel(chartRange, chartOffset)}
                </span>
                <button type="button" onClick={() => setChartOffset((o) => Math.max(0, o - 1))} disabled={chartOffset === 0}
                  className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 enabled:hover:bg-muted/50 disabled:opacity-30" aria-label="Período siguiente">
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Registrar de hoy — la acción MÁS frecuente, arriba y a un toque (antes
          vivía al fondo tras ~15 paneles de análisis; UX audit hallazgo A).
          Colapsado por defecto para no tapar la tendencia. */}
      <div className="mb-6">
        <button
          type="button"
          onClick={() => setLogOpen((v) => !v)}
          aria-expanded={logOpen}
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-left transition-colors hover:border-brand/40"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Plus size={15} strokeWidth={2} className="text-brand" /> Registrar de hoy
            <span className="text-[11px] font-normal text-muted-foreground">energía · ánimo · métrica · sueño</span>
          </span>
          <ChevronDown size={16} strokeWidth={1.75} className={cn('shrink-0 text-muted-foreground/70 transition-transform', logOpen && 'rotate-180')} aria-hidden="true" />
        </button>
        {logOpen && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
            <Card className={cardClass}>
              <CardContent className="p-4 sm:p-6">
                <SectionTitle icon={Plus} label="Registrar métrica" level="tarjeta" />
                <div className="space-y-2">
                  <Select value={mCat} onValueChange={(v) => setMCat(v as MetricCategory)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {METRIC_CATS.map(c => <SelectItem key={c} value={c}>{CAT_LABEL[c]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <MetricScale category={mCat} value={mVal} onChange={setMVal} />
                  {mCat === 'mood' && mVal !== '' && !isNaN(parseFloat(mVal)) && (
                    <div className="flex flex-wrap gap-1.5">
                      <span className="text-[10px] text-text-tertiary self-center mr-0.5">nómbralo mejor:</span>
                      {proposeEmotionLabels(parseFloat(mVal)).map((label) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => setMNote((n) => (n.toLowerCase().includes(label) ? n : `${n ? n.trim() + ' · ' : ''}${label}`))}
                          className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:border-brand hover:text-foreground"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                  <Input type="text" aria-label="Nota de la métrica" placeholder="Nota opcional" value={mNote} onChange={e => setMNote(e.target.value)} />
                  <Button onClick={addMetric} variant="outline" className="w-full">+ Registrar</Button>
                  {emotionGranularity.distinct > 0 && (
                    <p className="text-[11px] text-text-tertiary leading-relaxed">
                      Últimamente nombraste <span className="text-foreground/80 font-medium">{emotionGranularity.distinct}</span>{' '}
                      {emotionGranularity.distinct === 1 ? 'emoción distinta' : 'emociones distintas'}. Ponerle nombre fino a lo que sientes ayuda a regularlo.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className={cardClass}>
              <CardContent className="p-4 sm:p-6">
                <SectionTitle icon={Moon} label="Registrar sueño" level="tarjeta" />
                <div className="space-y-2">
                  <Input type="number" aria-label="Horas dormidas" min="0" max="24" step="0.5" placeholder="Horas dormidas" value={sHours} onChange={e => setSHours(e.target.value)} className="font-mono tabular-nums" />
                  <div className="flex gap-2">
                    <Input type="time" aria-label="Hora de dormir" value={sBed} onChange={e => setSBed(e.target.value)} className="font-mono" />
                    <Input type="time" aria-label="Hora de despertar" value={sWake} onChange={e => setSWake(e.target.value)} className="font-mono" />
                  </div>
                  <Input type="number" aria-label="Calidad del sueño de 1 a 10" min="1" max="10" placeholder="Calidad (1-10)" value={sQual} onChange={e => setSQual(e.target.value)} className="font-mono tabular-nums" />
                  <textarea
                    aria-label="Sueños recordados"
                    value={sDreams}
                    onChange={e => setSDreams(e.target.value)}
                    rows={2}
                    placeholder="¿Soñaste algo? (opcional) — lo que recuerdes, aparece en tu línea de tiempo y es buscable"
                    className="w-full resize-y rounded-md border border-border bg-background p-2.5 text-sm leading-relaxed outline-none focus:border-foreground/30"
                  />
                  <Button onClick={addSleep} variant="outline" className="w-full">+ Registrar sueño</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Feature 3: tendencias de energía y sueño en el tiempo. */}
      <div className="grid gap-3 sm:grid-cols-2 mb-6">
        <TrendChart
          label="Energía"
          icon={Activity}
          points={energySeries}
          windowable
          range={chartRange}
          offset={chartOffset}
          colorClass="text-brand"
          formatValue={(n) => n.toFixed(1)}
          emptyHint="Registra tu energía para ver la evolución."
          compactWhenEmpty
        />
        <TrendChart
          label="Sueño (horas)"
          icon={Moon}
          points={sleepSeries}
          windowable
          range={chartRange}
          offset={chartOffset}
          colorClass="text-brand"
          formatValue={(n) => `${n.toFixed(1)}h`}
          emptyHint="Registra tus noches para ver la tendencia."
          compactWhenEmpty
        />
      </div>

      {/* Tendencia corporal. Eran las DOS familias completas (Cuerpo y Corazón)
          abiertas, hasta 8 tarjetas, en el primer scroll — parte de por qué la
          pantalla se sentía interminable. Colapsada: es análisis, y el análisis no
          es lo que uno viene a ver con 4 recetas activas. */}
      <div className="mb-6">
        <CollapsibleSection title="Tendencia del cuerpo y del corazón" hint="peso · grasa · músculo · VFC · ritmo cardíaco">
          <BodyMetricsTrend metrics={healthMetrics} range={chartRange} offset={chartOffset} />
        </CollapsibleSection>
      </div>

      {/* DENSIDAD (#11): las 10 tarjetas de análisis profundo se agrupan en 2
          secciones colapsables (antes eran un muro plano). Lo secundario arranca
          cerrado; el resumen ya vive arriba (stats + tendencias). Mismo patrón
          que /yo, /relaciones, ficha y /panel. */}
      <div className="space-y-4 mb-6">
        <CollapsibleSection title="Sueño y ritmo circadiano" hint="deuda · calidad · pronóstico · cronotipo" count={6}>
          {/* 11·M1 — deuda de sueño acumulada real (no promedio). */}
          <SleepDebtCard />
          {/* SF·F2 — calidad/continuidad del sueño (no solo horas). */}
          <SleepQualityCard />
          {/* C1 — capa PREDICTIVA: pronóstico de la próxima noche (idiográfico). */}
          <SleepForecastCard />
          {/* SF·F3 — cruce sueño → día siguiente (estrés/energía/ánimo/FC). */}
          <SleepAftermathCard />
          {/* 11·M2+M4 — cronotipo + jet-lag social. */}
          <ChronotypeCard />
          {/* 11·M6 — modelo de fase acoplado S×C (experimental; solo si el backtest valida). */}
          <TwoProcessCard />
        </CollapsibleSection>

        <CollapsibleSection title="Energía, ánimo y foco" hint="ventana emocional · curva de energía · clima · foco" count={4}>
          {/* 13·M1+M2 — ventana de tolerancia + estrategia de regulación (Gross). */}
          <EmotionWindowCard />
          {/* 11·M3 — curva de energía por hora del día. */}
          <EnergyCurveCard />
          {/* 18·M2 — clima gris de Lima × tu energía; invisible salvo señal real */}
          <WeatherMoodCard />
          {/* 11·M5 — ventana óptima de foco (cruza cronotipo + curva de energía). */}
          <FocusWindowCard />
        </CollapsibleSection>
      </div>

      

      {/* Densidad: lo ANALÍTICO/secundario (patrones, aprendizajes, síntesis,
          chequeos, alertas de FC) arranca colapsado — el resumen y las tendencias
          ya viven arriba. Mismo patrón que las 2 secciones de arriba (#861). */}
      <div className="mb-6">
        <CollapsibleSection title="Análisis, patrones y chequeos" hint="patrones de lab · aprendizajes · síntesis cruzada · historial de chequeos · alertas de FC">
          <PatronesPanel />
          <LearningCard />
          <SintesisCruzadaPanel />
          <div className="mt-4"><ChequeosPanel metrics={healthMetrics} /></div>
          <div className="mt-4"><HeartRateAlertsPanel metrics={healthMetrics} /></div>
        </CollapsibleSection>
      </div>


      <Card className={cn('mb-4', cardClass)}>
        <CardContent className="p-4 sm:p-6">
          <SectionTitle icon={Activity} label="Ultimas metricas" count={recentMetrics.length} level="tarjeta" />
          {recentMetrics.length === 0 ? (
            <EmptyState
              icon={Activity}
              size="sm"
              title="Sin métricas todavía."
              hint="Registra tu primera medición arriba."
            />
          ) : (
            <div className="space-y-1">
              {recentMetrics.map((m) => (
                <div key={m.id} className="flex justify-between items-center py-1.5 border-b border-border/40 last:border-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] font-normal">{CAT_LABEL[m.category] || m.category}</Badge>
                    {m.note && <span className="text-xs text-muted-foreground">{m.note}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn('text-sm font-mono tabular-nums', metricValueClass(m.category, m.value))}>{m.value}/10</span>
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
            <SectionTitle icon={Clock} label="Ultima noche" level="tarjeta" />
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
          <SectionTitle icon={Heart} label="Salud básica" count={healthMetrics.length} level="tarjeta" />
          <div className="flex flex-wrap gap-2 mb-3">
            <Select value={hType} onValueChange={(v) => setHType(v as HealthMetricType)}>
              <SelectTrigger className="flex-1 basis-full sm:basis-auto min-w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {HEALTH_TYPES.map(t => <SelectItem key={t} value={t}>{getHealthMetricLabel(t)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="number" aria-label="Valor de salud" placeholder="Valor" value={hVal} onChange={e => setHVal(e.target.value)} className="w-24 font-mono tabular-nums" />
            <Input type="text" aria-label="Unidad de salud" placeholder="Unidad" value={hUnit} onChange={e => setHUnit(e.target.value)} className="w-20" />
            <Input type="text" aria-label="Nota de salud" placeholder="Nota (opcional): contexto, cómo te sentías…" value={hNote} onChange={e => setHNote(e.target.value)} className="flex-1 basis-full sm:basis-auto min-w-[160px]" />
            <Button onClick={addHealth} variant="outline" size="sm" className="w-full sm:w-auto">+ Agregar</Button>
          </div>
          {healthMetrics.length === 0 ? (
            <EmptyState
              icon={Heart}
              size="sm"
              title="Sin registros de salud."
              hint="Agrega una medición con el formulario de arriba, o importa Apple Health desde Mis capturas."
            />
          ) : (
            <div className="space-y-1">
              {[...healthMetrics].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 8).map((h) => (
                <div key={h.id} className="py-1 border-b border-border/40 last:border-0">
                  <div className="flex justify-between">
                    <span className="text-xs text-muted-foreground">{getHealthMetricLabel(h.type)}</span>
                    <span className="text-xs font-mono tabular-nums">{h.value} {h.unit}</span>
                  </div>
                  {h.note && <div className="text-[11px] text-foreground/70 italic mt-0.5">{h.note}</div>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      {/* Subir tus capturas de salud (báscula, sueño, frecuencia, Apple Health) — acá,
          no en /captura, que es solo para capturas de OTRAS personas. */}
      <MisCapturas />
    </AppShell>
  )
}
