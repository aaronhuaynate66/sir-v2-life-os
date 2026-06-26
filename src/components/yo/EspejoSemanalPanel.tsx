'use client'
// SIR V2 — Espejo Semanal (Motor #1). Confronta lo DECLARADO vs lo HECHO en 7
// días. Orden: estado → lectura conectada (IA, cacheada por semana) → lo que no
// cuadra → lo que sí lograste → ↓ el experimento (la acción vive ahí). La lectura
// CONECTA los desajustes; los bullets siguen siendo el golpe corto.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Eye, AlertTriangle, Check, Sparkles, Loader2, RefreshCw, ArrowDown } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { SectionTitle } from '@/components/ui/section-title'
import { useGoalStore } from '@/stores/useGoalStore'
import { useObjectiveStepStore } from '@/stores/useObjectiveStepStore'
import { useSelfStore } from '@/stores/useSelfStore'
import { computeEspejoSemanal, type EspejoState, type EspejoSeverity } from '@/lib/self/espejoSemanal'
import { useEspejoRelacional } from '@/hooks/useEspejoRelacional'
import { mondayLima } from '@/lib/experiments/types'

const STATE_META: Record<EspejoState, { label: string; color: string }> = {
  alineado: { label: 'Alineado', color: '#2dd4a7' },
  a_medias: { label: 'A medias', color: '#e0a93b' },
  a_la_deriva: { label: 'A la deriva', color: '#e5564c' },
  sin_norte: { label: 'Sin norte', color: '#8a8f98' },
  sin_datos: { label: 'Sin datos', color: '#8a8f98' },
}
const SEV_COLOR: Record<EspejoSeverity, string> = { alta: '#e5564c', media: '#e0a93b', leve: '#8a8f98' }

export function EspejoSemanalPanel() {
  const goals = useGoalStore((s) => s.goals)
  const steps = useObjectiveStepStore((s) => s.steps)
  const selfMetrics = useSelfStore((s) => s.selfMetrics)
  const sleepRecords = useSelfStore((s) => s.sleepRecords)
  const rel = useEspejoRelacional()

  const espejo = useMemo(
    () => computeEspejoSemanal(goals, steps, sleepRecords, selfMetrics, new Date(), rel),
    [goals, steps, sleepRecords, selfMetrics, rel],
  )
  const meta = STATE_META[espejo.state]
  const hasMaterial = espejo.gaps.length > 0 || espejo.wins.length > 0

  // Lectura IA, cacheada por semana (lunes Lima) para no regenerar ni gastar IA.
  const cacheKey = `sir_espejo_lectura_${mondayLima()}`
  const [lectura, setLectura] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    try { const c = localStorage.getItem(cacheKey); if (c) setLectura(c) } catch { /* */ }
  }, [cacheKey])

  const leer = useCallback(async () => {
    if (busy) return
    setBusy(true); setErr(null)
    try {
      const res = await fetch('/api/self/espejo-lectura', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: espejo.state, headline: espejo.headline, gaps: espejo.gaps, wins: espejo.wins }),
      })
      const j = (await res.json()) as { lectura?: string; error?: string }
      if (!res.ok || !j.lectura) { setErr(j.error ?? 'No se pudo leer'); return }
      setLectura(j.lectura)
      try { localStorage.setItem(cacheKey, j.lectura) } catch { /* */ }
    } catch { setErr('No se pudo leer') } finally { setBusy(false) }
  }, [busy, espejo, cacheKey])

  return (
    <Card style={{ borderColor: `${meta.color}55` }}>
      <CardContent className="p-4 sm:p-6">
        <SectionTitle icon={Eye} label="Espejo de la semana" />

        <div className="mt-2 flex items-center gap-2">
          <span className="rounded-full px-2.5 py-0.5 text-[12px] font-semibold" style={{ backgroundColor: `${meta.color}22`, color: meta.color }}>
            {meta.label}
          </span>
          <span className="text-[12px] text-muted-foreground">últimos {espejo.windowDays} días</span>
        </div>

        <p className="mt-2 text-[15px] font-medium leading-relaxed text-foreground/90">{espejo.headline}</p>

        {/* Lectura conectada (IA, opcional + cacheada) */}
        {hasMaterial && (
          lectura ? (
            <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1"><Sparkles size={12} /> La lectura</span>
                <button type="button" onClick={leer} disabled={busy} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                  {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                </button>
              </div>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-foreground/90">{lectura}</p>
            </div>
          ) : (
            <Button size="sm" variant="secondary" className="mt-3" disabled={busy} onClick={leer}>
              {busy ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Sparkles size={14} className="mr-1" />}
              {busy ? 'Leyendo…' : 'Leé la semana'}
            </Button>
          )
        )}
        {err && <p className="mt-2 text-[13px] text-red-500">{err}</p>}

        {/* Lo que no cuadra */}
        {espejo.gaps.length > 0 && (
          <div className="mt-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Lo que no cuadra</p>
            <ul className="space-y-2.5">
              {espejo.gaps.map((g) => (
                <li key={g.key} className="flex gap-2">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" style={{ color: SEV_COLOR[g.severity] }} />
                  <div className="text-[13px] leading-snug">
                    <span className="text-foreground/90">{g.label}</span>
                    <span className="text-muted-foreground"> — {g.observed}.</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Lo que sí lograste */}
        {espejo.wins.length > 0 && (
          <div className="mt-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Lo que sí lograste</p>
            <div className="space-y-1.5">
              {espejo.wins.map((w, i) => (
                <div key={i} className="flex gap-2 text-[13px] text-foreground/80">
                  <Check size={15} className="mt-0.5 shrink-0" style={{ color: '#2dd4a7' }} />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Puente al experimento (la acción vive ahí) */}
        {espejo.gaps.length > 0 && (
          <p className="mt-4 flex items-center gap-1.5 border-t border-border pt-3 text-[12px] text-muted-foreground">
            <ArrowDown size={13} /> Tu experimento de la semana sale de esto.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
