'use client'
// SIR V2 — LoPersonal (#8 del detail page V1).
//
// Síntesis narrativa de 3 párrafos sobre el vínculo, generada bajo demanda
// con el LLM y cacheada en person_synthesis (is_current=true). Reemplaza al
// PersonalSynthesisPlaceholder anterior.
//
// Estados:
//   - Sin conversaciones whatsapp_chat -> empty state honesto (CTA captura).
//   - Con conversaciones, sin síntesis  -> botón "Generar síntesis".
//   - Con síntesis                      -> 3 párrafos + metadata + "Regenerar".
//
// La generación POSTea a /api/person-synthesis y luego router.refresh()
// para re-fetchear la síntesis vigente server-side (single source of truth:
// la DB, no estado local).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Sparkles, Loader2, AlertCircle, RefreshCw, ExternalLink } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { generatePersonSynthesis, type GenerateSynthesisError } from './person-synthesis/client'
import type { PersonSynthesis } from '@/lib/person-synthesis/types'

export interface LoPersonalProps {
  personId: string
  /** Síntesis vigente (server-fetched). null si nunca se generó. */
  synthesis: PersonSynthesis | null
  /** Cuántas conversaciones whatsapp_chat curadas tiene la persona. Habilita
   *  o no la generación. */
  conversationCount: number
}

const GEN_DATE_FMT = new Intl.DateTimeFormat('es', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function LoPersonal({ personId, synthesis, conversationCount }: LoPersonalProps) {
  const router = useRouter()
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<GenerateSynthesisError | null>(null)

  async function handleGenerate() {
    setGenerating(true)
    setError(null)
    try {
      await generatePersonSynthesis(personId)
      router.refresh()
    } catch (e) {
      const err = e as GenerateSynthesisError
      if (err && typeof err.status === 'number') setError(err)
      else setError({ status: 0, message: e instanceof Error ? e.message : String(e) })
    } finally {
      setGenerating(false)
    }
  }

  const paragraphs = synthesis
    ? synthesis.synthesisText.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    : []

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Sparkles
              size={14}
              strokeWidth={1.75}
              className="text-muted-foreground/70"
              aria-hidden="true"
            />
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
              Lo personal
            </div>
          </div>
          {synthesis && conversationCount > 0 && (
            <Button size="sm" variant="ghost" onClick={handleGenerate} disabled={generating}>
              {generating ? (
                <Loader2 size={13} className="animate-spin mr-1" />
              ) : (
                <RefreshCw size={13} strokeWidth={1.75} className="mr-1" />
              )}
              Regenerar
            </Button>
          )}
        </div>

        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/5 p-2 text-xs mb-3 space-y-1">
            <div className="flex items-center gap-1.5 font-medium text-red-400">
              <AlertCircle size={12} strokeWidth={2} aria-hidden="true" />
              Error HTTP {error.status}: {error.message}
            </div>
            {error.detail && <div className="text-muted-foreground">{error.detail}</div>}
          </div>
        )}

        {synthesis ? (
          <div className="space-y-3">
            <div className="space-y-2.5">
              {paragraphs.map((p, i) => (
                <p key={i} className="text-sm text-foreground leading-relaxed">
                  {p}
                </p>
              ))}
            </div>
            <div className="text-[10px] text-muted-foreground/60 font-mono border-t border-border/40 pt-2">
              Generado {GEN_DATE_FMT.format(new Date(synthesis.generatedAt))} ·{' '}
              {synthesis.sourceObservationCount} conversación
              {synthesis.sourceObservationCount === 1 ? '' : 'es'} · {synthesis.modelUsed}
            </div>
          </div>
        ) : conversationCount === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Hay {conversationCount} conversación{conversationCount === 1 ? '' : 'es'} registrada
              {conversationCount === 1 ? '' : 's'}. Generá un retrato narrativo del vínculo a partir
              de ellas.
            </p>
            <Button size="sm" onClick={handleGenerate} disabled={generating}>
              {generating ? (
                <>
                  <Loader2 size={13} className="animate-spin mr-1.5" />
                  Generando…
                </>
              ) : (
                <>
                  <Sparkles size={13} strokeWidth={1.75} className="mr-1.5" />
                  Generar síntesis
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function EmptyState() {
  return (
    <p className="text-sm text-muted-foreground italic leading-relaxed">
      Sin síntesis generada. Cuando haya al menos una conversación de WhatsApp
      registrada con esta persona, vas a poder generar acá un retrato narrativo
      del vínculo. Empezá registrando una desde{' '}
      <Link
        href="/captura"
        className="not-italic underline underline-offset-2 hover:text-foreground inline-flex items-center gap-0.5"
      >
        Captura <ExternalLink size={11} strokeWidth={1.75} aria-hidden="true" />
      </Link>
      .
    </p>
  )
}
