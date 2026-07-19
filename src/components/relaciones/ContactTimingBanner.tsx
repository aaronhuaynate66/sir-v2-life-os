'use client'
// SIR V2 — Aviso de TIMING en las herramientas de influencia (Parte B, follow-up).
//
// Banner compacto que aparece al elegir una persona en /negociar, /tacticas y el
// Ensayo: si SIR sabe que NO es buen momento (de viaje, a full…), te lo dice
// JUSTO donde estás por armar el pedido — para no estamparte (caso Dayana).
// Reusa el mismo veredicto de la ficha (GET /api/relaciones/contact-timing).
// Silencioso si es neutral (SIR no sabe nada) — no mete ruido.

import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { TimingVerdict, TimingLevel } from '@/lib/contact-timing/assess'
import type { RhythmVerdict } from '@/lib/contact-timing/bestTime'

const CHIP: Record<TimingLevel, string> = {
  bad: 'border-bad/30 bg-bad-soft text-bad',
  caution: 'border-warn/30 bg-warn-soft text-warn',
  good: 'border-ok/30 bg-ok-soft text-ok',
  neutral: '',
}

export function ContactTimingBanner({ personId, className }: { personId: string; className?: string }) {
  const [line, setLine] = useState<{ chip: string; text: string } | null>(null)

  useEffect(() => {
    if (!personId) { setLine(null); return }
    let alive = true
    void (async () => {
      try {
        const r = await fetch(`/api/relaciones/contact-timing?person_id=${encodeURIComponent(personId)}`)
        const j = (await r.json()) as { verdict?: TimingVerdict; rhythm?: RhythmVerdict }
        if (!alive) return
        const v = j.verdict
        const rh = j.rhythm
        // La señal social (de viaje, a full…) MANDA; si no hay, cae al ritmo (proactivo).
        if (v && v.level !== 'neutral' && v.reason) {
          setLine({ chip: CHIP[v.level], text: v.reason })
        } else if (rh && rh.level !== 'unknown' && rh.reason) {
          const chip = rh.level === 'now' || rh.level === 'good' ? CHIP.good
            : rh.level === 'low' ? CHIP.caution : 'border-border bg-muted/10 text-muted-foreground'
          setLine({ chip, text: rh.reason })
        } else setLine(null)
      } catch { if (alive) setLine(null) }
    })()
    return () => { alive = false }
  }, [personId])

  if (!line) return null

  return (
    <div className={cn('flex items-start gap-2 rounded-md border px-3 py-2 text-[13px] leading-snug', line.chip, className)}>
      <Clock size={14} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span><span className="text-[10px] uppercase tracking-[0.07em] opacity-70 mr-1.5">timing</span>{line.text}</span>
    </div>
  )
}
