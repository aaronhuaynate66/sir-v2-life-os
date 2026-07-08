'use client'

// SIR V2 — "Preguntá sobre esta persona" (Q&A por persona, Clay #7).
//
// Ask-box en la ficha: preguntá a SIR y responde ATERRIZADO en esta persona
// (score, memorias, conversación, objetivos), aunque no la nombres en la
// pregunta — se pasa personId para pre-scopear el contexto. Reusa /api/sir/ask
// (solo lectura, grounding estricto). skipInlineGaps para no cortar con el flujo
// de "SIR quiere saber" acá; eso vive en el chat global.

import { useCallback, useState } from 'react'
import { MessageCircle, Send, Loader2 } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApiErrorNotice } from '@/components/ui/api-error-notice'
import { postJson, toApiError, type ApiError } from '@/lib/api/errors'

const SUGGESTIONS = [
  '¿Cómo viene la relación?',
  '¿De qué podríamos hablar?',
  '¿Qué le importa?',
  '¿Algo que debería tener presente?',
]

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'answer'; text: string; question: string }
  | { kind: 'error'; error: ApiError }

export function PreguntarSobrePersona({ personId, personName }: { personId: string; personName: string }) {
  const [q, setQ] = useState('')
  const [state, setState] = useState<State>({ kind: 'idle' })
  const first = personName.split(' ')[0] || 'esta persona'

  const ask = useCallback(async (question: string) => {
    const text = question.trim()
    if (!text) return
    setState({ kind: 'loading' })
    try {
      const { answer } = await postJson<{ answer: string }>('/api/sir/ask', {
        question: text,
        personId,
        skipInlineGaps: true,
      })
      setState({ kind: 'answer', text: answer, question: text })
    } catch (e) {
      setState({ kind: 'error', error: toApiError(e) })
    }
  }, [personId])

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-5 space-y-3">
        <div className="flex items-center gap-2">
          <MessageCircle size={13} strokeWidth={1.75} className="text-text-tertiary" aria-hidden="true" />
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Preguntá sobre {first}</div>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); void ask(q) }} className="flex gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Ej: ¿cómo viene la relación con ${first}?`}
            aria-label={`Preguntá sobre ${first}`}
          />
          <Button type="submit" size="sm" disabled={state.kind === 'loading' || !q.trim()} aria-label="Preguntar">
            {state.kind === 'loading'
              ? <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              : <Send size={14} strokeWidth={1.75} aria-hidden="true" />}
          </Button>
        </form>

        {state.kind === 'idle' && (
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => { setQ(s); void ask(s) }}
                className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:border-border-strong transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Región viva: el lector de pantalla anuncia el estado (pensando →
            respuesta / error) cuando cambia, sin que el foco esté acá. */}
        <div aria-live="polite" aria-atomic="false">
          {state.kind === 'loading' && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Loader2 size={12} className="animate-spin" aria-hidden="true" /> Pensando sobre {first}…
            </div>
          )}

          {state.kind === 'error' && <ApiErrorNotice error={state.error} className="p-2" />}

          {state.kind === 'answer' && (
            <div className="space-y-2">
              <p className="text-[11px] text-text-tertiary">{state.question}</p>
              <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">{state.text}</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setState({ kind: 'idle' })}
                className="h-7 text-[11px] text-muted-foreground"
              >
                Preguntar otra cosa
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
