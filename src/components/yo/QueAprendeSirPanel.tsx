'use client'

// SIR V2 — "Qué está aprendiendo SIR": hace VISIBLE el loop de retroalimentación
// (ledger de sugerencias P1-P3). Ver el aprendizaje motiva a dar más feedback.
// Se auto-oculta si el ledger está vacío (todavía no aprendió nada). Honesto: si
// aún no hay outcomes medidos, lo dice.

import { useEffect, useState } from 'react'
import { Brain, ThumbsUp, ThumbsDown } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { SectionTitle } from '@/components/ui/section-title'
import { summarizeLedger, type LedgerSummary } from '@/lib/suggestions/summary'
import type { Suggestion } from '@/lib/suggestions/types'

const KIND_LABEL: Record<string, string> = {
  contact: 'escribirle a alguien',
  answer: 'respuestas del chat',
  crear_objetivo: 'crear objetivo',
  crear_plan: 'agendar plan',
  crear_recordatorio: 'recordatorios',
  registrar_interaccion: 'registrar interacción',
  marcar_habito: 'marcar hábito',
  marcar_tarea: 'marcar tarea',
}

export function QueAprendeSirPanel() {
  const [sum, setSum] = useState<LedgerSummary | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/suggestions')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d || !Array.isArray(d.items)) return
        setSum(summarizeLedger(d.items as Suggestion[]))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  if (!sum || sum.total === 0) return null

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-6">
        <SectionTitle icon={Brain} label="Qué está aprendiendo SIR" />
        <p className="mt-1 mb-3 text-xs text-muted-foreground leading-relaxed">
          SIR registra lo que te sugiere y aprende de lo que te sirve. Mientras más le des feedback (👍/👎, confirmar/descartar), mejor afina lo que te propone.
        </p>

        {/* La tercera cifra es `followRate`, NO `workRate`. Al 3-ago el ledger tenía 15
            sugerencias con 11 ignoradas hasta 12 días: `workRate` habría cantado
            "100 % funcionaron" con un solo acierto, porque solo divide entre las que
            tuvieron resultado medido. `followRate` mete en el divisor las que Aaron
            nunca hizo, que es la verdad de si SIR está sugiriendo bien. */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <Stat value={sum.total} label="sugerencias" />
          <Stat value={sum.resolved} label="atendidas" />
          <Stat value={sum.followRate !== null ? `${sum.followRate}%` : '—'} label="las hiciste" />
        </div>

        {sum.ignored > 0 && (
          <p className="mb-3 text-[11px] text-muted-foreground/70 leading-snug">
            {sum.ignored === 1
              ? '1 sugerencia pasó de largo sin que actúes.'
              : `${sum.ignored} sugerencias pasaron de largo sin que actúes.`}{' '}
            Eso también le enseña: SIR baja lo que no te sirve.
          </p>
        )}

        {(sum.up > 0 || sum.down > 0) && (
          <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
            <span className="inline-flex items-center gap-1"><ThumbsUp size={12} className="text-ok" /> {sum.up}</span>
            <span className="inline-flex items-center gap-1"><ThumbsDown size={12} className="text-bad" /> {sum.down}</span>
            <span className="text-muted-foreground/60">tu feedback en el chat</span>
          </div>
        )}

        {sum.byKind.length > 0 && (
          <div className="border-t border-border/40 pt-2.5">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground/70 mb-1.5">Sobre qué te sugiere</div>
            <div className="flex flex-wrap gap-1.5">
              {sum.byKind.slice(0, 6).map((k) => (
                <span key={k.kind} className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                  {KIND_LABEL[k.kind] ?? k.kind} · {k.count}
                </span>
              ))}
            </div>
          </div>
        )}

        {sum.followRate === null && (
          <p className="mt-3 text-[11px] text-muted-foreground/60 leading-snug">
            Todavía no hay resultados medidos — SIR recién empieza a cerrar el loop (se marca «funcionó» cuando actúas sobre una sugerencia, y «pasó de largo» cuando se le vence el plazo).
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-2.5 text-center">
      <div className="text-xl font-semibold tabular-nums text-foreground">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mt-0.5">{label}</div>
    </div>
  )
}
