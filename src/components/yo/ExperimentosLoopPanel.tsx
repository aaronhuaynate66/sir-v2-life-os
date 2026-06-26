'use client'
// SIR V2 — Loop de Experimentos (Motor #2). La mitad del ciclo que faltaba:
// SIR propone UN experimento conductual por semana (derivado del Espejo), vos lo
// corrés, registrás el resultado y ajustás. Activación conductual, no archivo.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { FlaskConical, Loader2, Check, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SectionTitle } from '@/components/ui/section-title'
import { useGoalStore } from '@/stores/useGoalStore'
import { useObjectiveStepStore } from '@/stores/useObjectiveStepStore'
import { useSelfStore } from '@/stores/useSelfStore'
import { computeEspejoSemanal } from '@/lib/self/espejoSemanal'
import { suggestExperiment } from '@/lib/experiments/suggest'
import { mondayLima, type Experiment } from '@/lib/experiments/types'
import { useEspejoRelacional } from '@/hooks/useEspejoRelacional'

export function ExperimentosLoopPanel() {
  const goals = useGoalStore((s) => s.goals)
  const steps = useObjectiveStepStore((s) => s.steps)
  const selfMetrics = useSelfStore((s) => s.selfMetrics)
  const sleepRecords = useSelfStore((s) => s.sleepRecords)
  const rel = useEspejoRelacional()

  const suggestion = useMemo(() => {
    const espejo = computeEspejoSemanal(goals, steps, sleepRecords, selfMetrics, new Date(), rel)
    return suggestExperiment(espejo)
  }, [goals, steps, sleepRecords, selfMetrics, rel])

  const [items, setItems] = useState<Experiment[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [custom, setCustom] = useState('')
  const [resultDraft, setResultDraft] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/experiments')
      if (!res.ok) throw new Error('load')
      const j = (await res.json()) as { experiments: Experiment[] }
      setItems(j.experiments)
    } catch { setItems([]) }
  }, [])
  useEffect(() => { void load() }, [load])

  const active = useMemo(() => (items ?? []).filter((e) => e.status === 'activo'), [items])
  const done = useMemo(() => (items ?? []).filter((e) => e.status === 'hecho').slice(0, 5), [items])

  const create = useCallback(async (title: string, detail: string | undefined, source: 'espejo' | 'manual') => {
    if (!title.trim() || busy) return
    setBusy(true)
    try {
      await fetch('/api/experiments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), detail, source, week_start: mondayLima() }),
      })
      setCustom('')
      await load()
    } finally { setBusy(false) }
  }, [busy, load])

  const patch = useCallback(async (id: string, body: Record<string, unknown>) => {
    if (busy) return
    setBusy(true)
    try {
      await fetch('/api/experiments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...body }),
      })
      await load()
    } finally { setBusy(false) }
  }, [busy, load])

  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <SectionTitle icon={FlaskConical} label="Experimento de la semana" />

        {/* Sugerencia (solo si no hay uno activo) */}
        {active.length === 0 && suggestion && (
          <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">SIR te propone</p>
            <p className="mt-1 text-[14px] font-medium text-foreground">{suggestion.title}</p>
            <p className="mt-1 text-[13px] text-muted-foreground">{suggestion.detail}</p>
            <Button
              size="sm"
              className="mt-2"
              disabled={busy}
              onClick={() => create(suggestion.title, suggestion.detail, 'espejo')}
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : 'Acepto el reto'}
            </Button>
          </div>
        )}

        {/* Experimentos activos */}
        {active.map((e) => (
          <div key={e.id} className="mt-3 rounded-lg border p-3" style={{ borderColor: '#2dd4a755' }}>
            <p className="text-[11px] uppercase tracking-wide" style={{ color: '#2dd4a7' }}>En curso</p>
            <p className="mt-1 text-[14px] font-medium text-foreground">{e.title}</p>
            {e.detail && <p className="mt-1 text-[13px] text-muted-foreground">{e.detail}</p>}
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <Input
                placeholder="¿Qué pasó? (resultado)"
                value={resultDraft[e.id] ?? ''}
                onChange={(ev) => setResultDraft((d) => ({ ...d, [e.id]: ev.target.value }))}
                className="text-[13px]"
              />
              <div className="flex gap-2">
                <Button size="sm" disabled={busy} onClick={() => patch(e.id, { status: 'hecho', result: resultDraft[e.id] ?? '' })}>
                  <Check size={14} className="mr-1" /> Cerrar
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => patch(e.id, { status: 'descartado' })}>
                  <X size={14} />
                </Button>
              </div>
            </div>
          </div>
        ))}

        {/* Escribir uno propio */}
        {active.length === 0 && (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="…o escribí tu propio experimento de la semana"
              value={custom}
              onChange={(ev) => setCustom(ev.target.value)}
              className="text-[13px]"
            />
            <Button size="sm" variant="secondary" disabled={busy || !custom.trim()} onClick={() => create(custom, undefined, 'manual')}>
              Agregar
            </Button>
          </div>
        )}

        {/* Historial corto */}
        {done.length > 0 && (
          <div className="mt-4 space-y-1.5 border-t border-border pt-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Experimentos cerrados</p>
            {done.map((e) => (
              <div key={e.id} className="text-[12px] text-muted-foreground">
                <span className="text-foreground/70 line-through">{e.title}</span>
                {e.result && <span> — {e.result}</span>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
