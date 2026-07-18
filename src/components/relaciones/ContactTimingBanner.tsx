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

const CHIP: Record<TimingLevel, string> = {
  bad: 'border-bad/30 bg-bad-soft text-bad',
  caution: 'border-warn/30 bg-warn-soft text-warn',
  good: 'border-ok/30 bg-ok-soft text-ok',
  neutral: '',
}

export function ContactTimingBanner({ personId, className }: { personId: string; className?: string }) {
  const [verdict, setVerdict] = useState<TimingVerdict | null>(null)

  useEffect(() => {
    if (!personId) { setVerdict(null); return }
    let alive = true
    void (async () => {
      try {
        const r = await fetch(`/api/relaciones/contact-timing?person_id=${encodeURIComponent(personId)}`)
        const j = (await r.json()) as { verdict?: TimingVerdict }
        if (alive) setVerdict(j.verdict ?? null)
      } catch {
        if (alive) setVerdict(null)
      }
    })()
    return () => { alive = false }
  }, [personId])

  // Solo hablamos cuando SIR sabe algo (bad/caution/good con razón). Neutral = calla.
  if (!verdict || verdict.level === 'neutral' || !verdict.reason) return null

  return (
    <div className={cn('flex items-start gap-2 rounded-md border px-3 py-2 text-[13px] leading-snug', CHIP[verdict.level], className)}>
      <Clock size={14} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span><span className="text-[10px] uppercase tracking-[0.07em] opacity-70 mr-1.5">timing</span>{verdict.reason}</span>
    </div>
  )
}
