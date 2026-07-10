'use client'
// SIR V2 — EstadoConPersona: síntesis del estado con esta persona.
//
// Cruza toda la data que ya vive en la ficha (person_logs, moments,
// person_cycles, memorias) y muestra insights determinísticos + una
// etiqueta general del vínculo. Cero LLM en la ruta base — pura y rápida.
// El botón "Análisis con IA" queda para la siguiente iteración (se hará
// contra Claude Sonnet con cache 24h para no gastar tokens al pedo).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { HeartHandshake, TrendingUp, TrendingDown, Minus, AlertCircle, MessageCircle, Sparkles, Loader2, RefreshCcw } from 'lucide-react'

import { EmbeddableCard } from './EmbeddableCard'
import { OriginBadge } from './OriginBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { buildEstadoInsights, LABEL_HUMAN, type EstadoInsights } from '@/lib/estado-con-persona/insights'
import type { PersonLog } from '@/lib/person-logs/types'
import type { RelationshipMoment } from '@/lib/moments/types'
import type { PersonCycleEntry } from '@/lib/person-cycles/types'
import type { Memory } from '@/types'

interface Props {
  personId: string
  personName: string
  personLogs: PersonLog[]
  moments: RelationshipMoment[]
  personCycles: PersonCycleEntry[]
  memories: Memory[]
}

interface BriefingCache {
  synthesis: string
  generatedAt: string
  isFresh: boolean
  ageHours: number
}

const CYCLE_LABEL: Record<string, string> = {
  bleeding: 'Sangrado',
  pms: 'PMS',
  mid_cycle: 'Medio del ciclo',
  ovulation: 'Ovulación',
  luteal: 'Fase lútea',
  unknown: 'Fase indefinida',
}

function daysLabel(n: number | null): string {
  if (n == null) return '—'
  if (n === 0) return 'hoy'
  if (n === 1) return 'ayer'
  if (n < 7) return `hace ${n}d`
  if (n < 30) return `hace ${Math.floor(n / 7)}sem`
  return `hace ${Math.floor(n / 30)}mes`
}

function overdueUrgencyText(insights: EstadoInsights): string | null {
  if (!insights.mostUrgent) return null
  const { title, urgency, deltaDays } = insights.mostUrgent
  if (urgency === 'overdue' && deltaDays != null) {
    return `${title} — vencido hace ${Math.abs(deltaDays)} día${Math.abs(deltaDays) === 1 ? '' : 's'}`
  }
  if (urgency === 'dueSoon' && deltaDays != null) {
    if (deltaDays === 0) return `${title} — hoy`
    if (deltaDays === 1) return `${title} — mañana`
    return `${title} — en ${deltaDays} días`
  }
  return title
}

export function EstadoConPersona({ personId, personName, personLogs, moments, personCycles, memories, embedded = false }: Props & { embedded?: boolean }) {
  const insights = useMemo(
    () => buildEstadoInsights({ personLogs, moments, personCycles, memories, now: new Date() }),
    [personLogs, moments, personCycles, memories],
  )

  const [briefing, setBriefing] = useState<BriefingCache | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Al montar: chequear si hay cache reciente (GET, sin gastar tokens).
  useEffect(() => {
    let cancel = false
    void fetch(`/api/estado-persona/briefing?person_id=${encodeURIComponent(personId)}`)
      .then(async (r) => {
        if (cancel || !r.ok) return
        const j = (await r.json()) as { cached?: boolean; synthesis?: string; generatedAt?: string; isFresh?: boolean; ageHours?: number }
        if (j.cached && j.synthesis && j.generatedAt) {
          setBriefing({ synthesis: j.synthesis, generatedAt: j.generatedAt, isFresh: !!j.isFresh, ageHours: j.ageHours ?? 0 })
        }
      })
      .catch(() => {})
    return () => { cancel = true }
  }, [personId])

  const generate = useCallback(async (force = false) => {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/estado-persona/briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_id: personId, force }),
      })
      const j = (await res.json()) as { synthesis?: string; generatedAt?: string; error?: string }
      if (!res.ok) { setError(j.error ?? `HTTP ${res.status}`); return }
      if (j.synthesis && j.generatedAt) {
        setBriefing({ synthesis: j.synthesis, generatedAt: j.generatedAt, isFresh: true, ageHours: 0 })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }, [personId])

  const labelMeta = LABEL_HUMAN[insights.overallLabel]

  const trendIcon = insights.toneDelta == null || insights.toneDelta === 0
    ? Minus
    : insights.toneDelta > 0 ? TrendingUp : TrendingDown
  const TrendIcon = trendIcon
  const trendColor = insights.toneDelta == null || insights.toneDelta === 0
    ? 'text-muted-foreground'
    : insights.toneDelta > 0 ? 'text-ok' : 'text-bad'

  return (
    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <EmbeddableCard embedded={embedded} className={cn('border', labelMeta.toneClass)} contentClassName="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <HeartHandshake size={14} strokeWidth={1.75} className="opacity-70" aria-hidden="true" />
            <span className="text-[10px] uppercase tracking-widest font-sans opacity-80">
              Cómo estás con {personName.split(' ')[0]}
            </span>
            <Badge variant="outline" className={cn('text-[10px] font-medium border-current', 'bg-transparent')}>
              {labelMeta.label}
            </Badge>
            <OriginBadge origin="computed" className="ml-auto" />
          </div>

          <p className="text-xs leading-relaxed opacity-90">{labelMeta.description}</p>

          <div className="grid grid-cols-2 gap-3 pt-1 border-t border-current/20">
            <MetricCell
              icon={<MessageCircle size={11} strokeWidth={1.75} className="opacity-60" />}
              label="Última interacción"
              value={insights.lastInteractionAt ? daysLabel(insights.daysSinceLast) : 'sin registro'}
              hint={insights.lastInteractionValue != null ? `tono ${insights.lastInteractionValue}/5` : undefined}
            />
            <MetricCell
              icon={<TrendIcon size={11} strokeWidth={1.75} className={trendColor} />}
              label="Tono reciente"
              value={insights.recentAvg != null ? `${insights.recentAvg}/5` : '—'}
              hint={
                insights.toneDelta != null
                  ? `${insights.toneDelta > 0 ? '+' : ''}${insights.toneDelta} vs anterior`
                  : insights.recentAvg != null ? 'sin comparación' : undefined
              }
              hintClass={insights.toneDelta && insights.toneDelta < 0 ? 'text-bad' : insights.toneDelta && insights.toneDelta > 0 ? 'text-ok' : ''}
            />
          </div>

          {(insights.openMomentsCount > 0 || insights.todayCyclePhase) && (
            <div className="space-y-1.5 pt-2 border-t border-current/20">
              {insights.openMomentsCount > 0 && (
                <div className="flex items-start gap-2 text-xs">
                  <AlertCircle size={11} strokeWidth={1.75} className="mt-0.5 flex-shrink-0 opacity-70" />
                  <span className="leading-relaxed">
                    <span className="font-medium">
                      {insights.openMomentsCount} pendiente{insights.openMomentsCount === 1 ? '' : 's'}
                    </span>
                    {insights.overdueCount > 0 && (
                      <span className="text-bad"> · {insights.overdueCount} vencido{insights.overdueCount === 1 ? '' : 's'}</span>
                    )}
                    {overdueUrgencyText(insights) && (
                      <span className="block text-muted-foreground/80 mt-0.5">{overdueUrgencyText(insights)}</span>
                    )}
                  </span>
                </div>
              )}
              {insights.todayCyclePhase && (
                <div className="flex items-start gap-2 text-xs">
                  <Sparkles size={11} strokeWidth={1.75} className="mt-0.5 flex-shrink-0 opacity-70" />
                  <span className="leading-relaxed">
                    Hoy: <span className="font-medium">{CYCLE_LABEL[insights.todayCyclePhase] ?? insights.todayCyclePhase}</span>
                    <span className="text-muted-foreground/80"> (registro del ciclo)</span>
                  </span>
                </div>
              )}
            </div>
          )}

          {insights.latestMemoryTitle && insights.recentMemoryCount > 0 && (
            <p className="text-[10px] text-muted-foreground/80 leading-relaxed pt-2 border-t border-current/20">
              Último detalle guardado: <span className="italic">{insights.latestMemoryTitle}</span>
              {insights.recentMemoryCount > 1 && (
                <span> · {insights.recentMemoryCount - 1} más en los últimos 60 días</span>
              )}
            </p>
          )}

          {/* Síntesis IA — botón para pedir prosa a Claude Sonnet.
              Cache 24h en person_briefings; auto-lee al montar sin gastar tokens. */}
          <div className="pt-3 border-t border-current/20 space-y-2">
            {briefing ? (
              <div className="space-y-1.5">
                <p className="text-xs leading-relaxed text-foreground/90 whitespace-pre-line">
                  {briefing.synthesis}
                </p>
                <div className="flex items-center gap-2 flex-wrap text-[10px] opacity-70">
                  <span>
                    Análisis IA · {briefing.isFresh ? `hace ${briefing.ageHours}h` : `hace ${briefing.ageHours}h (vencido)`}
                  </span>
                  <button
                    type="button"
                    onClick={() => void generate(true)}
                    disabled={busy}
                    className="inline-flex items-center gap-1 hover:text-foreground underline underline-offset-2 disabled:opacity-50"
                    aria-label="Regenerar análisis"
                  >
                    {busy ? <Loader2 size={9} className="animate-spin" /> : <RefreshCcw size={9} />}
                    {busy ? 'Regenerando…' : 'Regenerar'}
                  </button>
                </div>
              </div>
            ) : (
              insights.overallLabel !== 'sin_data' && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void generate(false)}
                    disabled={busy}
                    className="h-7 text-xs"
                  >
                    {busy ? <><Loader2 size={11} className="mr-1.5 animate-spin" /> Analizando…</> : <><Sparkles size={11} className="mr-1.5" /> Análisis con IA</>}
                  </Button>
                  <span className="text-[10px] opacity-60">Claude Sonnet lee todo lo cargado y escribe 3-4 líneas.</span>
                </div>
              )
            )}
            {error && (
              <div className="flex items-start gap-1.5 text-[10px] text-bad">
                <AlertCircle size={10} className="mt-0.5" /> {error}
              </div>
            )}
          </div>
      </EmbeddableCard>
    </motion.div>
  )
}

function MetricCell({
  icon,
  label,
  value,
  hint,
  hintClass,
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
  hintClass?: string
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest opacity-70 mb-0.5">
        {icon} {label}
      </div>
      <div className="text-sm font-medium truncate">{value}</div>
      {hint && <div className={cn('text-[10px] opacity-70', hintClass)}>{hint}</div>}
    </div>
  )
}
