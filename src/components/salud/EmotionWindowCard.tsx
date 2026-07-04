'use client'

// SIR V2 — EmotionWindowCard (13·M1+M2+M4): ventana + estrategia + aprendizaje.
// M1/M2: si te salís de la ventana, sugiere la clase de estrategia (Gross).
// M4: registrás que la probaste y si ayudó → con el tiempo, "para vos X suele
// ayudar más que Y" (patrón observado, no ley). NO lee data clínica (13·M5).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Waves } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useSelfStore } from '@/stores/useSelfStore'
import { assessEmotionWindow, type RegStrategy } from '@/engines/emotion'
import { summarizeRegulation, type RegulationLog } from '@/lib/emotion/learning'

export function EmotionWindowCard() {
  const { selfMetrics, healthMetrics, sleepRecords } = useSelfStore()
  const [logs, setLogs] = useState<RegulationLog[]>([])
  const [busy, setBusy] = useState(false)

  const w = useMemo(() => {
    const stress = selfMetrics.filter((m) => m.category === 'stress').map((m) => ({ value: m.value, at: m.timestamp }))
    const hrv = healthMetrics.filter((m) => m.type === 'hrv_avg').map((m) => ({ value: m.value, at: m.timestamp }))
    const sleepHours = sleepRecords.map((s) => ({ value: s.duration, at: s.date }))
    return assessEmotionWindow({ stress, hrv, sleepHours }, Date.now())
  }, [selfMetrics, healthMetrics, sleepRecords])

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/regulation')
      if (r.ok) { const j = (await r.json()) as { logs: RegulationLog[] }; setLogs(j.logs ?? []) }
    } catch { /* best-effort */ }
  }, [])
  useEffect(() => { void load() }, [load])

  const summary = useMemo(() => summarizeRegulation(logs), [logs])
  const unrated = logs.find((l) => !l.helped)

  const logStrategy = useCallback(async (strategy: RegStrategy) => {
    if (busy) return; setBusy(true)
    try {
      await fetch('/api/regulation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ strategy }) })
      await load()
    } finally { setBusy(false) }
  }, [busy, load])

  const rate = useCallback(async (id: string, helped: 'yes' | 'somewhat' | 'no') => {
    setLogs((p) => p.map((l) => (l.id === id ? { ...l, helped } : l)))
    try { await fetch('/api/regulation', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, helped }) }) } catch { void load() }
  }, [load])

  // Se muestra si hay algo que sugerir, un patrón aprendido, o algo por calificar.
  if (!w.guidance && !summary.insight && !unrated) return null

  const narrow = w.state === 'narrow'
  const canLog = w.strategy === 'response_modulation' || w.strategy === 'reappraisal'
  const signals = [
    w.stressElevated && 'estrés elevado',
    w.hrvDown && 'HRV en caída',
    w.sleepLow && 'sueño bajo',
  ].filter(Boolean) as string[]

  return (
    <Card className={`shadow-none mb-4 ${w.guidance ? (narrow ? 'border-bad/40' : 'border-warn/40') : ''}`}>
      <CardContent className="p-4 sm:p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Waves size={14} strokeWidth={1.75} className={narrow ? 'text-bad' : 'text-warn'} aria-hidden="true" />
          <h2 className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Regulación</h2>
        </div>

        {w.guidance && (
          <div className="space-y-2">
            <p className="text-[13px] text-foreground/90 leading-relaxed">{w.guidance}</p>
            {signals.length > 0 && (
              <div className="text-[10px] text-muted-foreground/70">{signals.join(' · ')} (vs. tu promedio)</div>
            )}
            {canLog && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => logStrategy(w.strategy as RegStrategy)}>
                Lo probé
              </Button>
            )}
          </div>
        )}

        {unrated && (
          <div className="border-t border-border/40 pt-2.5">
            <p className="text-[11px] text-muted-foreground">Eso que probaste, ¿te ayudó?</p>
            <div className="mt-1.5 flex gap-1.5">
              {(['yes', 'somewhat', 'no'] as const).map((h) => (
                <button key={h} type="button" onClick={() => rate(unrated.id, h)}
                  className="rounded-full border border-border px-2.5 py-0.5 text-[11px] text-muted-foreground hover:border-brand hover:text-foreground">
                  {h === 'yes' ? 'Sí' : h === 'somewhat' ? 'Algo' : 'No'}
                </button>
              ))}
            </div>
          </div>
        )}

        {summary.insight && (
          <p className="text-[11px] text-ok leading-relaxed border-t border-border/40 pt-2.5">{summary.insight}</p>
        )}
      </CardContent>
    </Card>
  )
}
