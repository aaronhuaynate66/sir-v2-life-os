'use client'

// SIR V2 — Preguntas para reflexionar (rescate de dato huérfano).
//
// El pipeline de captura de WhatsApp (Nivel C) genera hasta 3 preguntas
// reflexivas por captura y las guarda en observation.data.reflectionQuestions —
// pero hasta ahora NINGÚN componente las mostraba. Acá las surfaceamos: son
// preguntas PARA VOS, para pensar el vínculo, no acciones ni tareas.

import { useMemo } from 'react'
import { HelpCircle } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import type { Observation } from '@/lib/capture/observations/types'

export function ReflexionesPanel({ observations }: { observations: Observation[] }) {
  const questions = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const o of observations) {
      const rq = (o.data as { reflectionQuestions?: unknown })?.reflectionQuestions
      if (!Array.isArray(rq)) continue
      for (const q of rq) {
        const s = typeof q === 'string' ? q.trim() : ''
        if (s && !seen.has(s.toLowerCase())) { seen.add(s.toLowerCase()); out.push(s) }
      }
    }
    return out.slice(0, 6)
  }, [observations])

  if (questions.length === 0) return null

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-5 space-y-3">
        <div className="flex items-center gap-2">
          <HelpCircle size={13} strokeWidth={1.75} className="text-text-tertiary" aria-hidden="true" />
          <h2 className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Preguntas para reflexionar</h2>
        </div>
        <p className="text-[11px] text-muted-foreground/70 -mt-1">Salieron de tus conversaciones. Para pensar el vínculo — no son tareas.</p>
        <ul className="space-y-2">
          {questions.map((q, i) => (
            <li key={i} className="flex gap-2.5 rounded-md border border-border bg-secondary/40 p-3">
              <span className="font-mono text-[11px] text-text-tertiary mt-0.5">{i + 1}</span>
              <span className="text-[13px] leading-relaxed text-foreground/90">{q}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
