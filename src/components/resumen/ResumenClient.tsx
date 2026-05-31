'use client'
// SIR V2 — ResumenClient (Fase 3c): genera + muestra el resumen semanal.
//
// Botón "Generar resumen de la semana" -> POST /api/longitudinal/weekly ->
// router.refresh() (la page re-fetchea el historial server-side). Muestra
// el resumen más reciente con sus secciones parseadas (Resumen / Patrones /
// Destacado / Próxima semana) + historial de semanas previas.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarRange, Sparkles, Loader2, ChevronDown } from 'lucide-react'

import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ApiErrorNotice } from '@/components/ui/api-error-notice'
import { parseErrorResponse, toApiError, type ApiError } from '@/lib/api/errors'
import { cn } from '@/lib/utils'
import type { LongitudinalSummary } from '@/lib/longitudinal/types'

const ABS = new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short' })
const ABS_FULL = new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const SECTION_LABELS = ['Resumen', 'Patrones', 'Destacado', 'Próxima semana']

function fmtRange(s: LongitudinalSummary): string {
  try {
    return `${ABS.format(new Date(s.periodStart))} – ${ABS.format(new Date(s.periodEnd))}`
  } catch {
    return `${s.periodStart} – ${s.periodEnd}`
  }
}

export function ResumenClient({ initialSummaries }: { initialSummaries: LongitudinalSummary[] }) {
  const router = useRouter()
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  const latest = initialSummaries[0] ?? null
  const history = initialSummaries.slice(1)

  async function generate() {
    if (generating) return
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/longitudinal/weekly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 7 }),
      })
      if (!res.ok) {
        setError(await parseErrorResponse(res))
        return
      }
      router.refresh()
    } catch (e) {
      setError(toApiError(e))
    } finally {
      setGenerating(false)
    }
  }

  return (
    <AppShell>
      <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mb-1">SIR V2</div>
          <div className="flex items-center gap-3">
            <CalendarRange size={28} strokeWidth={1.5} className="text-muted-foreground" aria-hidden="true" />
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Resumen semanal</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Patrones observados de tu semana (estado, conversaciones y memorias), con una acción para la próxima.
          </p>
        </div>
        <Button onClick={generate} disabled={generating}>
          {generating ? <Loader2 size={15} className="animate-spin mr-1.5" /> : <Sparkles size={15} strokeWidth={1.75} className="mr-1.5" />}
          {generating ? 'Generando…' : 'Generar resumen de la semana'}
        </Button>
      </div>

      {error && <ApiErrorNotice error={error} className="mb-4" />}

      {!latest ? (
        <Card className="shadow-none border-dashed">
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Todavía no generaste ningún resumen. Tocá <span className="font-medium text-foreground">Generar resumen de la semana</span> para analizar tus últimos 7 días.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card className="shadow-none">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <Badge variant="outline" className="text-[10px] font-mono">{fmtRange(latest)}</Badge>
                <span className="text-[10px] font-mono text-muted-foreground/50">
                  {latest.sourceCounts.logs ?? 0} regs · {latest.sourceCounts.observations ?? 0} obs · {latest.sourceCounts.memories ?? 0} mem
                </span>
              </div>
              <SummaryBody text={latest.summaryText} />
              <div className="text-[10px] font-mono text-muted-foreground/50 border-t border-border/40 pt-2 mt-3">
                Generado {ABS_FULL.format(new Date(latest.generatedAt))} · {latest.modelUsed}
              </div>
            </CardContent>
          </Card>

          {history.length > 0 && <History items={history} />}
        </div>
      )}
    </AppShell>
  )
}

/** Parsea el resumen estructurado en secciones. Fallback a párrafos planos. */
function SummaryBody({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean)
  return (
    <div className="space-y-3">
      {blocks.map((block, i) => {
        const label = SECTION_LABELS.find((l) => block.toLowerCase().startsWith(l.toLowerCase() + ':'))
        if (label) {
          const value = block.slice(label.length + 1).trim()
          const isResumen = label === 'Resumen'
          const isAction = label === 'Próxima semana'
          // "Patrones" suele venir con líneas "- ..."
          const bullets = label === 'Patrones'
            ? value.split('\n').map((l) => l.replace(/^[-•]\s*/, '').trim()).filter(Boolean)
            : null
          return (
            <div
              key={i}
              className={cn(
                isResumen && 'rounded-md border border-accent/30 bg-accent/5 p-3',
                isAction && 'rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3',
              )}
            >
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-1">{label}</div>
              {bullets ? (
                <ul className="space-y-1 list-disc pl-4">
                  {bullets.map((b, j) => (
                    <li key={j} className="text-sm text-foreground leading-relaxed">{b}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-foreground leading-relaxed">{value}</p>
              )}
            </div>
          )
        }
        return <p key={i} className="text-sm text-foreground leading-relaxed">{block}</p>
      })}
    </div>
  )
}

function History({ items }: { items: LongitudinalSummary[] }) {
  const [open, setOpen] = useState(false)
  return (
    <Card className="shadow-none">
      <CardContent className="p-4 sm:p-6">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-2 group"
          aria-expanded={open}
        >
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
            Semanas anteriores ({items.length})
          </div>
          <ChevronDown size={16} strokeWidth={1.75} className={cn('text-muted-foreground/60 transition-transform group-hover:text-foreground', open && 'rotate-180')} aria-hidden="true" />
        </button>
        {open && (
          <div className="mt-4 space-y-4">
            {items.map((s) => (
              <div key={s.id} className="border-t border-border/40 pt-3 first:border-0 first:pt-0">
                <Badge variant="outline" className="text-[10px] font-mono mb-2">{fmtRange(s)}</Badge>
                <SummaryBody text={s.summaryText} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
