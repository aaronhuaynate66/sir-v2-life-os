'use client'

// SIR V2 — 12·M5: card del WOOP vivo en /horario. Cuando el "if" de un plan
// si-entonces se cumple ahora (franja/hora/estrés), muestra el "then" como prompt.
// Invisible si ningún disparador está activo. Se re-evalúa al montar (y el server
// decide con la hora real).
import { useEffect, useState } from 'react'
import { Target } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'

interface Trigger {
  goalId: string
  goalTitle: string
  planThen: string
  reason: string
}

export function WoopPromptCard() {
  const [triggers, setTriggers] = useState<Trigger[]>([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/habits/woop')
        if (!res.ok) return
        const data = (await res.json()) as { triggers?: Trigger[] }
        if (!cancelled && Array.isArray(data.triggers)) setTriggers(data.triggers)
      } catch {
        /* best-effort */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (triggers.length === 0) return null

  return (
    <div className="mt-8 space-y-3">
      <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Tu plan, ahora</div>
      {triggers.map((t) => (
        <Card key={t.goalId} className="shadow-none border-primary/30">
          <CardContent className="p-4 sm:p-5 flex items-start gap-3">
            <Target size={16} strokeWidth={1.75} className="text-primary mt-0.5 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm text-foreground">
                Dijiste que cuando <span className="text-muted-foreground">{t.reason}</span>, entonces: <span className="font-medium">{t.planThen}</span>.
              </p>
              <p className="text-[12px] text-muted-foreground mt-0.5">Para &ldquo;{t.goalTitle}&rdquo;. Es el momento.</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
