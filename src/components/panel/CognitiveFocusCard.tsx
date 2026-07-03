// SIR V2 — "Foco ahora": consume el orquestador cognitivo (A2). En vez de mostrar
// paz + amenazas + recomendaciones por separado, SIR unifica todo en UN foco
// ordenado por severidad y jerarquía de dominio (Paz>Salud>…>Optimización).

import { Compass } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { CognitiveAssessment } from '@/engines/orchestrator'

export function CognitiveFocusCard({ assessment }: { assessment: CognitiveAssessment }) {
  if (assessment.focus.length === 0) return null
  const top = assessment.focus.slice(0, 4)
  return (
    <Card className="mb-4 border-brand/30">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <Compass size={14} strokeWidth={1.75} className="text-brand-soft-foreground" aria-hidden="true" />
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Foco ahora</div>
          <span className="text-[10px] text-muted-foreground ml-auto">unificado · por prioridad</span>
        </div>
        <ul className="space-y-2">
          {top.map((f, i) => (
            <li key={i} className="flex items-start gap-2">
              <Badge variant="outline" className="text-[9px] mt-0.5 shrink-0">{f.domainLabel}</Badge>
              <div className="min-w-0">
                <div className="text-sm text-foreground/90 leading-snug">{f.title}</div>
                {f.detail && <div className="text-[11px] text-muted-foreground leading-snug">{f.detail}</div>}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
