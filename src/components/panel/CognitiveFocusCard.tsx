'use client'
// SIR V2 — "Foco ahora": consume el orquestador cognitivo (A2) y, on-demand, el
// Multi-Persona Reasoner (A1). En vez de mostrar paz + amenazas + recomendaciones
// por separado, SIR unifica todo en UN foco ordenado por severidad y jerarquía de
// dominio, y puede "pensarlo" a través de sus 12 lentes con un toque.

import { useState } from 'react'
import { Compass, Sparkles, Loader2 } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { CognitiveAssessment } from '@/engines/orchestrator'

interface LensTake { persona: string; label: string; take: string }
interface ReasonResponse { result: { perLens: LensTake[]; synthesis: string }; personas: string[] }

export function CognitiveFocusCard({ assessment }: { assessment: CognitiveAssessment }) {
  const [thinking, setThinking] = useState(false)
  const [reading, setReading] = useState<ReasonResponse['result'] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function think() {
    if (thinking) return
    setThinking(true); setErr(null)
    try {
      const res = await fetch('/api/reason', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assessment }),
      })
      const j = await res.json()
      if (!res.ok) { setErr(j.error ?? 'No pude pensar esto'); return }
      setReading((j as ReasonResponse).result)
    } catch { setErr('No pude pensar esto') } finally { setThinking(false) }
  }

  if (assessment.focus.length === 0) return null
  const top = assessment.focus.slice(0, 4)

  return (
    <Card className="mb-4 border-brand/30">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <Compass size={14} strokeWidth={1.75} className="text-brand-soft-foreground" aria-hidden="true" />
          <h2 className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Foco ahora</h2>
          <span className="text-[10px] text-muted-foreground ml-auto">lo que más pesa hoy</span>
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

        {/* A1 — reasoner multi-lente on-demand */}
        {!reading && (
          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={() => void think()} disabled={thinking}>
              {thinking ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Sparkles size={13} className="mr-1.5" />}
              {thinking ? 'Pensando…' : 'Verlo por las 12 lentes'}
            </Button>
            {!thinking && <p className="text-[10px] text-muted-foreground mt-1">SIR lee este momento con sus 12 lentes (psicólogo, estratega, coach…) y sintetiza.</p>}
          </div>
        )}
        {err && <p className="text-[11px] text-bad mt-2">{err}</p>}

        {reading && (
          <div className="mt-3 border-t border-border/50 pt-3 space-y-2.5">
            <p className="text-sm text-foreground leading-relaxed">{reading.synthesis}</p>
            {reading.perLens.length > 0 && (
              <ul className="space-y-1.5">
                {reading.perLens.map((l, i) => (
                  <li key={i} className="text-[12px] leading-snug">
                    <span className="text-brand-soft-foreground font-medium">{l.label}:</span>{' '}
                    <span className="text-muted-foreground">{l.take}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
