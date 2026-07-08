'use client'
// SIR V2 — AccionDeHoy: el bloque ACCIONABLE al tope de la ficha.
//
// La auditoría encontró que la ficha "sabe mucho pero no prioriza qué hacer
// ahora": la próxima acción vivía como texto pasivo dentro del vistazo. Este
// bloque la asciende a lo que era en v1: UNA acción con BOTÓN REAL.
//
//   - Chip de origen (por qué esto hoy): Cumpleaños / Aniversario / Vínculo
//     frío / Sin registro.
//   - El sustento visible (la línea de próxima acción ya calculada, pura, por
//     buildPersonSummary — misma fuente que el vistazo, sin re-implementar).
//   - "Escribile ahora" → wa.me directo (si hay teléfono).
//   - "Preparar mensaje" → borrador EDITABLE por IA (reusa
//     /api/daily-actions/message, Haiku barato). Copiable o enviable por
//     WhatsApp con el texto ya cargado.
//
// MOUNT-SAFE (fix #418): depende de "ahora" (misma razón que ResumenPersona).
// Render nulo en server + primer paint, contenido real tras montar.

import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { MessageCircle, Sparkles, Loader2, Copy, Cake, CalendarHeart, Snowflake, UserPlus, ArrowRight } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { OriginBadge } from './OriginBadge'
import { ApiErrorNotice } from '@/components/ui/api-error-notice'
import { useMounted } from '@/hooks/useMounted'
import { toApiError, parseErrorResponse, type ApiError } from '@/lib/api/errors'
import { whatsappLink } from '@/lib/social/links'
import { buildPersonSummary, type PersonSummary, type NextActionUrgency } from '@/lib/people/personSummary'
import type { MessageSuggestion } from '@/lib/daily-actions/messagePrompt'
import type { Person } from '@/types'

export interface AccionDeHoyProps {
  person: Person
  phoneNumber?: string | null
  lastChatObservedAt: string | null
  lastManualInteractionAt: string | null
  lastContactAt?: string | null
}

export function AccionDeHoy(props: AccionDeHoyProps) {
  const mounted = useMounted()
  if (!mounted) return null
  return <AccionBody {...props} />
}

/** Chip de origen: por qué SIR propone esto HOY. */
interface Origin {
  label: string
  Icon: typeof Cake
  cls: string
}

/** Params para /api/daily-actions/message derivados de la síntesis. */
interface MsgParams {
  kind: string
  reason: string
  daysSinceContact: number | null
  daysUntil: number | null
}

function deriveOrigin(s: PersonSummary): Origin {
  if (s.nextDate && s.nextDate.daysUntil <= 30) {
    return s.nextDate.kind === 'birthday'
      ? { label: 'Cumpleaños', Icon: Cake, cls: 'text-brand-soft-foreground border-brand/30 bg-brand-soft' }
      : { label: s.nextDate.label, Icon: CalendarHeart, cls: 'text-brand-soft-foreground border-brand/30 bg-brand-soft' }
  }
  if (s.lastInteraction) {
    return { label: 'Vínculo frío', Icon: Snowflake, cls: 'text-warn border-warn/30 bg-warn-soft' }
  }
  return { label: 'Sin registro', Icon: UserPlus, cls: 'text-muted-foreground border-border bg-muted/30' }
}

function deriveMsgParams(s: PersonSummary): MsgParams {
  const reason = s.nextAction?.text ?? 'Mantener el vínculo'
  if (s.nextDate && s.nextDate.daysUntil <= 30) {
    return {
      kind: s.nextDate.kind === 'birthday' ? 'birthday' : 'special_date',
      reason,
      daysSinceContact: null,
      daysUntil: s.nextDate.daysUntil,
    }
  }
  if (s.lastInteraction) {
    return { kind: 'cooling', reason, daysSinceContact: s.lastInteraction.days, daysUntil: null }
  }
  return { kind: 'contact', reason, daysSinceContact: null, daysUntil: null }
}

const URGENCY_ACCENT: Record<NextActionUrgency, string> = {
  info: 'border-l-brand/50',
  soon: 'border-l-warn/60',
  now: 'border-l-bad/60',
}

function AccionBody({ person, phoneNumber, lastChatObservedAt, lastManualInteractionAt, lastContactAt }: AccionDeHoyProps) {
  const summary = useMemo(
    () => buildPersonSummary({ person, lastChatObservedAt, lastManualInteractionAt, lastContactAt }, new Date()),
    [person, lastChatObservedAt, lastManualInteractionAt, lastContactAt],
  )

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [draft, setDraft] = useState<string | null>(null)
  const [suggestion, setSuggestion] = useState<MessageSuggestion | null>(null)

  const waBase = whatsappLink(phoneNumber)
  const firstName = (person.name || '').trim().split(/\s+/)[0] || person.name

  const prepareMessage = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { kind, reason, daysSinceContact, daysUntil } = deriveMsgParams(summary)
    try {
      const res = await fetch('/api/daily-actions/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personId: person.id, kind, reason, daysSinceContact, daysUntil }),
      })
      if (!res.ok) {
        setError(await parseErrorResponse(res))
        return
      }
      const data = (await res.json()) as { suggestion?: MessageSuggestion }
      const text = data.suggestion?.message_suggestion?.trim()
      if (!text) {
        setError(toApiError(new Error('La IA no devolvió un mensaje. Probá de nuevo en un momento.')))
        return
      }
      setSuggestion(data.suggestion ?? null)
      setDraft(text)
    } catch (e) {
      setError(toApiError(e))
    } finally {
      setLoading(false)
    }
  }, [person.id, summary])

  const copyDraft = useCallback(async () => {
    if (!draft) return
    try {
      await navigator.clipboard.writeText(draft)
      toast.success('Mensaje copiado')
    } catch {
      toast.error('No se pudo copiar')
    }
  }, [draft])

  // Sin acción sugerida → el vínculo está al día; no montamos el bloque.
  if (!summary.nextAction) return null

  const origin = deriveOrigin(summary)
  const OriginIcon = origin.Icon
  const waWithText = waBase && draft ? `${waBase}?text=${encodeURIComponent(draft)}` : null

  return (
    <Card className={cnLeft(summary.nextAction.urgency)}>
      <CardContent className="p-4 sm:p-5 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-widest text-text-tertiary font-sans">Acción de hoy</span>
          <Badge variant="outline" className={`text-[10px] font-mono gap-1 ${origin.cls}`}>
            <OriginIcon size={11} strokeWidth={2} aria-hidden="true" />
            {origin.label}
          </Badge>
          {/* La acción sale de un cálculo determinístico (no IA); el mensaje sí. */}
          <OriginBadge origin="computed" className="ml-auto" />
        </div>

        {/* Sustento: la próxima acción calculada (misma fuente que el vistazo). */}
        <div className="flex items-start gap-2 text-sm text-foreground">
          <ArrowRight size={15} strokeWidth={2} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="font-medium leading-relaxed">{summary.nextAction.text}</span>
        </div>

        {/* Botones reales. */}
        <div className="flex flex-wrap items-center gap-2">
          {waBase ? (
            <Button
              size="sm"
              variant="outline"
              asChild
              className="border-ok/30 bg-ok-soft text-ok hover:bg-ok/20 hover:text-ok"
            >
              <a href={waWithText ?? waBase} target="_blank" rel="noopener noreferrer">
                <MessageCircle size={14} strokeWidth={1.75} className="mr-1.5" />
                {draft ? 'Enviar por WhatsApp' : `Escribile a ${firstName}`}
              </a>
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled title="Agregá un teléfono en Redes sociales para habilitar el chat.">
              <MessageCircle size={14} strokeWidth={1.75} className="mr-1.5" />
              Escribile ahora
            </Button>
          )}

          <Button
            size="sm"
            variant="outline"
            onClick={prepareMessage}
            disabled={loading}
            className="border-brand/30 bg-brand/10 hover:bg-brand/20"
          >
            {loading ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Sparkles size={14} strokeWidth={1.75} className="mr-1.5" />}
            {loading ? 'Redactando…' : draft ? 'Regenerar mensaje' : 'Preparar mensaje'}
          </Button>
        </div>

        {error && <ApiErrorNotice error={error} />}

        {/* Borrador editable. */}
        {draft !== null && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-widest text-text-tertiary font-sans">Borrador de mensaje</span>
              <OriginBadge origin="ai" />
            </div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={4}
              className="w-full rounded-md border border-border bg-background p-2.5 text-sm leading-relaxed outline-none focus:border-foreground/40 resize-y"
              aria-label={`Mensaje sugerido para ${firstName}`}
            />
            {suggestion?.impact_prediction && (
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                <span className="text-text-tertiary">Impacto:</span> {suggestion.impact_prediction}
              </p>
            )}
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={copyDraft}>
                <Copy size={13} strokeWidth={1.75} className="mr-1.5" />
                Copiar
              </Button>
              <span className="text-[10px] text-muted-foreground/70">Editalo antes de enviar — es un borrador.</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** Card con acento izquierdo por urgencia. */
function cnLeft(urgency: NextActionUrgency): string {
  return `shadow-none mb-4 border-l-2 ${URGENCY_ACCENT[urgency]}`
}
