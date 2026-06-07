'use client'

// SIR V2 — /horario · Brief del día (Fase 2, superficie).
//
// Arriba de la vista Día: un resumen CORTO y escaneable de hoy. Dos capas:
//   - Baseline determinístico (briefSummaryLine): hechos puros, SIEMPRE visible,
//     sin gastar IA ni red. Degradación con gracia.
//   - Narrativa IA on-demand: botón "Generar brief" → /api/horario/brief
//     (cache del día, fail-open). Al generar, sumamos las "relaciones a atender"
//     desde /api/daily-actions (scoring sin IA) para enriquecer el contexto; si
//     ese fetch falla, el brief se genera igual sin ellas.
//
// Patrón = DailyActionsPanel: el componente se basta solo. No se auto-genera al
// montar (no gastamos un modelo por carga); sí hace un "peek" del cache del día
// para mostrar el brief si ya lo pediste hoy.

import { useCallback, useEffect, useState } from 'react'
import { Sparkles, Loader2, RefreshCw, Target } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ApiErrorNotice } from '@/components/ui/api-error-notice'
import { postJson, toApiError, type ApiError } from '@/lib/api/errors'
import {
  briefSummaryLine,
  hasBriefContent,
  type BriefSignals,
  type BriefRelation,
  type BriefResult,
} from '@/lib/horario/brief'
import type { DailyAction } from '@/lib/daily-actions/build'

type GenState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; result: BriefResult; cached: boolean }
  | { status: 'error'; error: ApiError }

/** Trae el top de relaciones a atender (best-effort, sin IA) para el contexto
 *  del brief. Falla en silencio: el brief se genera igual sin relaciones. */
async function fetchRelations(): Promise<BriefRelation[]> {
  try {
    const res = await fetch('/api/daily-actions', { cache: 'no-store' })
    if (!res.ok) return []
    const data = (await res.json()) as { actions?: DailyAction[] }
    return (data.actions ?? []).slice(0, 3).map((a) => ({
      name: a.personName,
      headline: a.headline,
      urgency: a.urgency,
    }))
  } catch {
    return []
  }
}

export function BriefPanel({ signals }: { signals: BriefSignals }) {
  const [gen, setGen] = useState<GenState>({ status: 'idle' })

  // Peek del cache del día (sin generar): si ya hay brief de hoy, mostralo.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`/api/horario/brief?date=${encodeURIComponent(signals.date)}`, {
          cache: 'no-store',
        })
        if (!res.ok) return
        const data = (await res.json()) as { brief: string | null; focus?: string; cached?: boolean }
        if (!cancelled && data.brief) {
          setGen({ status: 'ready', result: { brief: data.brief, focus: data.focus ?? '' }, cached: true })
        }
      } catch {
        /* sin peek: queda el baseline + botón Generar */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [signals.date])

  const generate = useCallback(
    async (force: boolean) => {
      setGen({ status: 'loading' })
      try {
        const relations = await fetchRelations()
        const { brief, focus, cached } = await postJson<{ brief: string; focus: string; cached: boolean }>(
          '/api/horario/brief',
          { signals: { ...signals, relations }, force },
        )
        setGen({ status: 'ready', result: { brief, focus: focus ?? '' }, cached })
      } catch (e) {
        setGen({ status: 'error', error: toApiError(e) })
      }
    },
    [signals],
  )

  const summary = briefSummaryLine(signals)
  const empty = !hasBriefContent(signals)

  return (
    <Card className="shadow-none border-brand/25 bg-brand-soft/40">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={13} strokeWidth={1.75} className="text-brand-soft-foreground" aria-hidden="true" />
          <div className="text-[11px] uppercase tracking-[0.07em] text-brand-soft-foreground">Brief del día</div>
          {gen.status === 'ready' && (
            <button
              type="button"
              onClick={() => generate(true)}
              className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              title="Regenerar el brief de hoy"
            >
              <RefreshCw size={11} strokeWidth={1.75} aria-hidden="true" />
              Regenerar
            </button>
          )}
        </div>

        {/* Baseline determinístico — siempre visible */}
        <p className="text-sm text-foreground/90 font-medium">{summary}</p>

        {/* Narrativa IA */}
        {gen.status === 'ready' && (
          <div className="mt-3 space-y-2">
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{gen.result.brief}</p>
            {gen.result.focus && (
              <div className="inline-flex items-center gap-1.5 rounded-md border border-brand/30 bg-card px-2.5 py-1.5 text-xs text-foreground">
                <Target size={12} strokeWidth={1.75} className="text-brand-soft-foreground shrink-0" aria-hidden="true" />
                <span className="text-text-tertiary">Foco:</span>
                <span className="font-medium">{gen.result.focus}</span>
              </div>
            )}
          </div>
        )}

        {gen.status === 'loading' && (
          <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Loader2 size={12} className="animate-spin" aria-hidden="true" />
            Armando tu brief…
          </div>
        )}

        {gen.status === 'error' && (
          <div className="mt-3">
            <ApiErrorNotice error={gen.error} className="p-2" />
            <Button variant="ghost" size="sm" onClick={() => generate(false)} className="mt-1 h-7 text-[11px]">
              Reintentar
            </Button>
          </div>
        )}

        {gen.status === 'idle' && !empty && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => generate(false)}
            className="mt-3 h-7 text-[11px] border-brand/30 bg-card text-brand-soft-foreground hover:bg-brand/15"
          >
            <Sparkles size={11} strokeWidth={1.75} className="mr-1" />
            Generar brief
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
