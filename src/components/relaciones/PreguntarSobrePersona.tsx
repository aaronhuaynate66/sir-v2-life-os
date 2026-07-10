'use client'

// SIR V2 — Asistente SIR de la persona (Q&A + briefing unificados).
//
// UN solo punto de IA conversacional en la ficha (antes había dos: el Briefing
// "Ponme al día" en el header + el ask-box acá). Ahora conviven en un panel:
//   - "Ponme al día": briefing contextual efímero (reusa generatePersonBriefing).
//   - Ask-box: preguntá lo que quieras, aterrizado en esta persona (/api/sir/ask,
//     solo lectura, grounding estricto). skipInlineGaps para no cortar con "SIR
//     quiere saber" acá; eso vive en el chat global.
// Los GENERADORES de contenido persistido (Lo personal, Perfil, Hipótesis…)
// siguen en su panel — producen cosas distintas que viven ahí, no son "chat".

import { useCallback, useState } from 'react'
import { Sparkles, Send, Loader2 } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApiErrorNotice } from '@/components/ui/api-error-notice'
import { postJson, toApiError, type ApiError } from '@/lib/api/errors'
import { generatePersonBriefing } from './person-briefing/client'
import { BriefingBody } from './person-briefing/BriefingBody'

const SUGGESTIONS = [
  '¿Cómo viene la relación?',
  '¿De qué podríamos hablar?',
  '¿Qué le importa?',
  '¿Algo que debería tener presente?',
]

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'answer'; text: string; question: string; isBriefing?: boolean }
  | { kind: 'error'; error: ApiError }

export function PreguntarSobrePersona({ personId, personName }: { personId: string; personName: string }) {
  const [q, setQ] = useState('')
  const [state, setState] = useState<State>({ kind: 'idle' })
  // Colapsado por default (7a): el asistente no ocupa una card entera arriba del
  // fold; es un botón que se abre cuando lo necesitás.
  const [open, setOpen] = useState(false)
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

  // Briefing efímero "Ponme al día" — mismo panel, on-demand (no gasta al abrir
  // la ficha; solo cuando lo pedís).
  const runBriefing = useCallback(async () => {
    setState({ kind: 'loading' })
    try {
      const text = await generatePersonBriefing(personId)
      setState({ kind: 'answer', text, question: `Ponme al día con ${first}`, isBriefing: true })
    } catch (e) {
      setState({ kind: 'error', error: toApiError(e) })
    }
  }, [personId, first])

  // Colapsado (y sin respuesta aún) → botón discreto que abre el asistente.
  if (!open && state.kind === 'idle') {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-4 inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-sm text-foreground hover:border-border-strong transition-colors"
      >
        <Sparkles size={15} strokeWidth={1.75} className="text-brand" aria-hidden="true" />
        SIR sobre {first}
      </button>
    )
  }

  const busy = state.kind === 'loading'

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles size={13} strokeWidth={1.75} className="text-brand" aria-hidden="true" />
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">SIR sobre {first}</div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void runBriefing()}
            disabled={busy}
            className="ml-auto h-7 border-brand/30 bg-brand/10 text-[12px] hover:bg-brand/20"
          >
            <Sparkles size={13} strokeWidth={1.75} className="mr-1.5 text-brand" aria-hidden="true" />
            Ponme al día
          </Button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); void ask(q) }} className="flex gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Ej: ¿cómo viene la relación con ${first}?`}
            aria-label={`Preguntá sobre ${first}`}
          />
          <Button type="submit" size="sm" disabled={busy || !q.trim()} aria-label="Preguntar">
            {busy
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
              {state.isBriefing
                ? <BriefingBody text={state.text} />
                : <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">{state.text}</p>}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setState({ kind: 'idle' })}
                className="h-7 text-[11px] text-muted-foreground"
              >
                {state.isBriefing ? 'Cerrar' : 'Preguntar otra cosa'}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
