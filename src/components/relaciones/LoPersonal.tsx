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
import { Sparkles, Loader2, RefreshCw } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ApiErrorNotice } from '@/components/ui/api-error-notice'
import { toApiError, type ApiError } from '@/lib/api/errors'
import { useMounted } from '@/hooks/useMounted'
import { generatePersonSynthesis } from './person-synthesis/client'
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
  const mounted = useMounted()
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  async function handleGenerate() {
    setGenerating(true)
    setError(null)
    try {
      await generatePersonSynthesis(personId)
      router.refresh()
    } catch (e) {
      setError(toApiError(e))
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

        {error && <ApiErrorNotice error={error} className="p-2 mb-3" />}

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
              Generado {mounted ? GEN_DATE_FMT.format(new Date(synthesis.generatedAt)) : '…'} ·{' '}
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
      del vínculo. Empezá registrando una con{' '}
      <span className="not-italic font-medium text-foreground">Agregar captura</span> (arriba).
    </p>
  )
}
