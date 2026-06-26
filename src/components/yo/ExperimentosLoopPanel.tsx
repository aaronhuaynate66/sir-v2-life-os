'use client'
// SIR V2 — Loop de Experimentos (Motor #2). La mitad del ciclo que faltaba:
// SIR propone UN experimento conductual por semana (derivado del Espejo), vos lo
// corrés, registrás el resultado Y SI TE FUNCIONÓ, y con el tiempo ves tu
// historial de prueba y error. Activación conductual + aprendizaje, no archivo.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { FlaskConical, Loader2, X, History } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SectionTitle } from '@/components/ui/section-title'
import { useGoalStore } from '@/stores/useGoalStore'
import { useObjectiveStepStore } from '@/stores/useObjectiveStepStore'
import { useSelfStore } from '@/stores/useSelfStore'
import { computeEspejoSemanal } from '@/lib/self/espejoSemanal'
import { suggestExperiment } from '@/lib/experiments/suggest'
import { mondayLima, tallyWorked, type Experiment, type ExperimentWorked } from '@/lib/experiments/types'
import { useEspejoRelacional } from '@/hooks/useEspejoRelacional'

const WORKED_META: Record<ExperimentWorked, { label: string; color: string }> = {
  si: { label: 'Funcionó', color: '#2dd4a7' },
  parcial: { label: 'Más o menos', color: '#e0a93b' },
  no: { label: 'No funcionó', color: '#e5564c' },
}

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
  const [showHistory, setShowHistory] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/experiments')
      if (!res.ok) throw new Error('load')
      const j = (await res.json()) as { experiments: Experiment[] }
      setItems(j.experiments)
    } catch { setItems([]) }
  }, [])
  useEffect(() => { void load() }, [load])

  // El Espejo puede crear un experimento (accionable 1-clic) → recargamos.
  useEffect(() => {
    const h = () => void load()
    window.addEventListener('sir:experiments-changed', h)
    return () => window.removeEventListener('sir:experiments-changed', h)
  }, [load])

  const active = useMemo(() => (items ?? []).filter((e) => e.status === 'activo'), [items])
  const closed = useMemo(
    () => (items ?? []).filter((e) => e.status === 'hecho' || e.status === 'descartado'),
    [items],
  )
  const tally = useMemo(() => tallyWorked(closed), [closed])

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

  const close = useCallback((id: string, worked: ExperimentWorked) => {
    void patch(id, { status: 'hecho', worked, result: resultDraft[id] ?? '' })
  }, [patch, resultDraft])

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
            <Input
              placeholder="¿Qué pasó? (resultado)"
              value={resultDraft[e.id] ?? ''}
              onChange={(ev) => setResultDraft((d) => ({ ...d, [e.id]: ev.target.value }))}
              className="mt-2 text-[13px]"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-[12px] text-muted-foreground">Cerrar — ¿te funcionó?</span>
              {(['si', 'parcial', 'no'] as ExperimentWorked[]).map((w) => (
                <Button
                  key={w}
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => close(e.id, w)}
                  style={{ borderColor: `${WORKED_META[w].color}66`, color: WORKED_META[w].color }}
                >
                  {WORKED_META[w].label}
                </Button>
              ))}
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => patch(e.id, { status: 'descartado' })} title="Descartar">
                <X size={14} />
              </Button>
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

        {/* Historial — prueba y error (colapsado por defecto) */}
        {closed.length > 0 && (
          <div className="mt-4 border-t border-border pt-3">
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="flex w-full items-center justify-between text-[11px] uppercase tracking-wide text-muted-foreground hover:text-foreground"
            >
              <span className="flex items-center gap-1.5"><History size={13} /> Historial — prueba y error ({closed.length})</span>
              <span className="flex items-center gap-2 normal-case tracking-normal">
                {tally.si > 0 && <span style={{ color: WORKED_META.si.color }}>✓ {tally.si}</span>}
                {tally.parcial > 0 && <span style={{ color: WORKED_META.parcial.color }}>~ {tally.parcial}</span>}
                {tally.no > 0 && <span style={{ color: WORKED_META.no.color }}>✗ {tally.no}</span>}
              </span>
            </button>

            {showHistory && (
              <div className="mt-3 space-y-2.5">
                {closed.map((e) => {
                  const wm = e.worked ? WORKED_META[e.worked] : null
                  return (
                    <div key={e.id} className="text-[12.5px]">
                      <div className="flex items-start gap-2">
                        {wm ? (
                          <span className="mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: `${wm.color}22`, color: wm.color }}>
                            {wm.label}
                          </span>
                        ) : (
                          <span className="mt-0.5 shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {e.status === 'descartado' ? 'Descartado' : 'Sin marcar'}
                          </span>
                        )}
                        <div>
                          <span className="text-foreground/90">{e.title}</span>
                          {e.result && <span className="text-muted-foreground"> — {e.result}</span>}
                          {e.weekStart && <span className="text-muted-foreground/60"> · {e.weekStart}</span>}
                        </div>
                      </div>
                    </div>
                  )
                })}
                <p className="pt-1 text-[11px] text-muted-foreground/70">
                  Lo que te funcionó, repetilo. Lo que no, no lo vuelvas a intentar igual.
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
