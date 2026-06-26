'use client'
// SIR V2 — Significado del objetivo (metodología, Fase 1). Reconecta con el POR
// QUÉ (compromiso/identidad — Locke & Latham + autoconcordancia). La antigua
// "Tu historia con esto" se eliminó: eran memorias crudas del WhatsApp
// importado, truncadas en el origen ("...coach depor") → ruido, no método.
// El contexto profundo vive curado en /objetivos/[id], no en fragmentos a medias.
import { Flame } from 'lucide-react'

export function GoalMeaning({ why, milestones }: { why?: string; milestones: string[] }) {
  // milestones se mantiene en la firma (compat con el call site) pero ya no se
  // renderiza; el guard lo referencia para no romper nada aguas arriba.
  if (!why && milestones.length === 0) return null
  if (!why) return null
  return (
    <div className="mb-3 rounded-lg border border-brand/30 bg-brand-soft/30 p-3">
      <div className="flex items-start gap-2">
        <Flame size={14} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />
        <div className="text-[13px] leading-relaxed text-foreground">
          <span className="font-semibold">Por qué es tuyo: </span>{why}
        </div>
      </div>
    </div>
  )
}
