'use client'

// SIR V2 — Asistente SIR de la persona (Q&A multi-turno + briefing).
//
// UN solo punto de IA conversacional en la ficha:
//   - "Ponme al día": briefing contextual efímero (on-demand, no gasta al abrir).
//   - Ask-box MULTI-TURNO: preguntá, y seguí preguntando — el hilo se mantiene y
//     se manda como `history` a /api/sir/ask, así SIR entiende el "¿y eso por qué?"
//     sin repetir contexto. Aterrizado en la persona (personId pre-scopea).
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

/** Un turno del hilo. role sigue el formato que espera /api/sir/ask (user|sir). */
type Turn = { role: 'user' | 'sir'; text: string; isBriefing?: boolean }

export function PreguntarSobrePersona({ personId, personName }: { personId: string; personName: string }) {
  const [q, setQ] = useState('')
  const [thread, setThread] = useState<Turn[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  // Colapsado por default (7a): el asistente es un botón que se abre cuando lo
  // necesitás, no una card entera arriba del fold.
  const [open, setOpen] = useState(false)
  const first = personName.split(' ')[0] || 'esta persona'

  const ask = useCallback(async (question: string) => {
    const text = question.trim()
    if (!text || loading) return
    setQ('')
    setError(null)
    // Historial ANTES de sumar el turno nuevo (lo que SIR ya "sabe" del hilo).
    const history = thread.map((t) => ({ role: t.role, text: t.text }))
    setThread((prev) => [...prev, { role: 'user', text }])
    setLoading(true)
    try {
      const { answer } = await postJson<{ answer: string }>('/api/sir/ask', {
        question: text,
        personId,
        skipInlineGaps: true,
        history,
      })
      setThread((prev) => [...prev, { role: 'sir', text: answer }])
    } catch (e) {
      setError(toApiError(e))
    } finally {
      setLoading(false)
    }
  }, [personId, thread, loading])

  // Briefing efímero "Ponme al día" — on-demand, se suma al hilo como turno de
  // SIR (así una pregunta de seguimiento tiene el briefing de contexto).
  const runBriefing = useCallback(async () => {
    if (loading) return
    setError(null)
    setThread((prev) => [...prev, { role: 'user', text: `Ponme al día con ${first}` }])
    setLoading(true)
    try {
      const text = await generatePersonBriefing(personId)
      setThread((prev) => [...prev, { role: 'sir', text, isBriefing: true }])
    } catch (e) {
      setError(toApiError(e))
    } finally {
      setLoading(false)
    }
  }, [personId, first, loading])

  // Colapsado (y sin hilo aún) → botón discreto que abre el asistente.
  if (!open && thread.length === 0) {
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

  const empty = thread.length === 0

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
            disabled={loading}
            className="ml-auto h-7 border-brand/30 bg-brand/10 text-[12px] hover:bg-brand/20"
          >
            <Sparkles size={13} strokeWidth={1.75} className="mr-1.5 text-brand" aria-hidden="true" />
            Ponme al día
          </Button>
        </div>

        {/* Hilo de la conversación. aria-live para que el lector anuncie lo nuevo. */}
        {!empty && (
          <div className="space-y-3" aria-live="polite" aria-atomic="false">
            {thread.map((t, i) =>
              t.role === 'user' ? (
                <p key={i} className="text-[13px] text-foreground/70 border-l-2 border-brand/40 pl-2.5">
                  {t.text}
                </p>
              ) : t.isBriefing ? (
                <BriefingBody key={i} text={t.text} />
              ) : (
                <p key={i} className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                  {t.text}
                </p>
              ),
            )}
            {loading && (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Loader2 size={12} className="animate-spin" aria-hidden="true" /> Pensando sobre {first}…
              </div>
            )}
            {error && <ApiErrorNotice error={error} className="p-2" />}
          </div>
        )}

        <form onSubmit={(e) => { e.preventDefault(); void ask(q) }} className="flex gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={empty ? `Ej: ¿cómo viene la relación con ${first}?` : 'Seguí preguntando…'}
            aria-label={`Preguntá sobre ${first}`}
          />
          <Button type="submit" size="sm" disabled={loading || !q.trim()} aria-label="Preguntar">
            {loading
              ? <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              : <Send size={14} strokeWidth={1.75} aria-hidden="true" />}
          </Button>
        </form>

        {empty && !loading && (
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void ask(s)}
                className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:border-border-strong transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {!empty && !loading && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setThread([]); setError(null) }}
            className="h-7 text-[11px] text-muted-foreground"
          >
            Empezar de nuevo
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
