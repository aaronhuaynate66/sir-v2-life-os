'use client'
// SIR V2 — Significado del objetivo. Reconecta con el POR QUÉ (no el costo):
// muestra el "por qué es tuyo" + tus HITOS reales del tema (ej. bronce 2024).
// La "historia" se acota a 3 hitos por defecto (divulgación progresiva: era el
// bloque que más crecía sin tope y volvía pesada la tarjeta).
import { useState } from 'react'
import { Flame, Trophy } from 'lucide-react'

const MAX_VISIBLE = 3

export function GoalMeaning({ why, milestones }: { why?: string; milestones: string[] }) {
  const [showAll, setShowAll] = useState(false)
  if (!why && milestones.length === 0) return null
  const extra = milestones.length - MAX_VISIBLE
  const visible = showAll ? milestones : milestones.slice(0, MAX_VISIBLE)
  return (
    <div className="mb-3 rounded-lg border border-brand/30 bg-brand-soft/30 p-3">
      {why && (
        <div className="flex items-start gap-2">
          <Flame size={14} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />
          <div className="text-[13px] leading-relaxed text-foreground">
            <span className="font-semibold">Por qué es tuyo: </span>{why}
          </div>
        </div>
      )}
      {milestones.length > 0 && (
        <div className="mt-2">
          <div className="text-[10px] uppercase tracking-[0.07em] text-brand-soft-foreground mb-1 flex items-center gap-1">
            <Trophy size={11} /> Tu historia con esto
          </div>
          <ul className="space-y-1">
            {visible.map((m, i) => (
              <li key={i} className="text-[12px] text-foreground/85 leading-snug">• {m}</li>
            ))}
          </ul>
          {extra > 0 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-1.5 text-[11px] text-brand-soft-foreground hover:underline"
            >
              {showAll ? 'ver menos' : `ver ${extra} más`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
