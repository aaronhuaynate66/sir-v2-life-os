'use client'
// SIR V2 — PersonActions (#16 botones top-right del detail page V1).
//
// Dos acciones de cabecera:
//   - Chat WhatsApp: link directo a wa.me/{telefono} (nueva pestaña). Solo
//     habilitado si la persona tiene phoneNumber; si no, queda disabled con
//     hint a vincularlo en "Redes sociales".
//   - Briefing IA: genera (efímero, sin persistir) un resumen contextual
//     accionable sobre la persona usando el LLM sobre sus memorias
//     asociadas. Se muestra en un Sheet lateral. Reusa el scaffolding de
//     #8 (síntesis): mismo patrón de endpoint + client + Anthropic.

import { useState, useCallback } from 'react'
import { MessageCircle, Sparkles, Loader2, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet'
import { ApiErrorNotice } from '@/components/ui/api-error-notice'
import { toApiError, type ApiError } from '@/lib/api/errors'
import { whatsappLink } from '@/lib/social/links'
import { generatePersonBriefing } from './person-briefing/client'

export interface PersonActionsProps {
  personId: string
  personName: string
  phoneNumber?: string | null
}

export function PersonActions({ personId, personName, phoneNumber }: PersonActionsProps) {
  const waUrl = whatsappLink(phoneNumber)

  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [briefing, setBriefing] = useState<string | null>(null)
  const [error, setError] = useState<ApiError | null>(null)

  const runBriefing = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const text = await generatePersonBriefing(personId)
      setBriefing(text)
    } catch (e) {
      setError(toApiError(e))
    } finally {
      setLoading(false)
    }
  }, [personId])

  function openBriefing() {
    setOpen(true)
    // Generar al abrir si no hay nada cargado todavía.
    if (!briefing && !loading) void runBriefing()
  }

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          size="sm"
          variant="outline"
          onClick={openBriefing}
          className="border-accent/30 bg-accent/10 hover:bg-accent/20"
        >
          <Sparkles size={14} strokeWidth={1.75} className="mr-1.5" />
          Briefing IA
        </Button>

        {waUrl ? (
          <Button
            size="sm"
            variant="outline"
            asChild
            className="border-ok/30 bg-ok-soft text-ok hover:bg-ok/20 hover:text-ok"
          >
            <a href={waUrl} target="_blank" rel="noopener noreferrer">
              <MessageCircle size={14} strokeWidth={1.75} className="mr-1.5" />
              Chat WhatsApp
            </a>
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled
            title="Agregá un teléfono en Redes sociales para habilitar el chat."
          >
            <MessageCircle size={14} strokeWidth={1.75} className="mr-1.5" />
            Chat WhatsApp
          </Button>
        )}
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Sparkles size={16} strokeWidth={1.75} className="text-brand" aria-hidden="true" />
              Briefing · {personName}
            </SheetTitle>
            <SheetDescription>
              Resumen contextual generado sobre las memorias asociadas. Efímero — no se guarda.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 size={15} className="animate-spin" />
                Generando briefing…
              </div>
            )}

            {error && !loading && (
              error.status === 422 ? (
                <div className="rounded-md border border-border bg-muted/20 p-3 text-xs flex items-start gap-2">
                  <Sparkles size={13} strokeWidth={1.75} className="text-muted-foreground/70 flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <span className="text-muted-foreground">
                    Todavía no hay nada que resumir de {personName}. Cuando registres una conversación o
                    captures algo sobre esta persona, el briefing aparece solo.
                  </span>
                </div>
              ) : (
                <ApiErrorNotice error={error} />
              )
            )}

            {briefing && !loading && <BriefingBody text={briefing} />}

            {(briefing || error) && !loading && (
              <Button size="sm" variant="ghost" onClick={runBriefing} className="mt-2">
                <RefreshCw size={13} strokeWidth={1.75} className="mr-1.5" />
                Regenerar
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

const SECTION_LABELS = ['TL;DR', 'Contexto', 'Dinámica', 'Sugerencia']

/** Parsea el briefing estructurado ("TL;DR:", "Contexto:", …) en secciones.
 *  Si no matchea el formato, cae a párrafos planos. */
function BriefingBody({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean)

  return (
    <div className="space-y-3">
      {blocks.map((block, i) => {
        const labelMatch = SECTION_LABELS.find((l) =>
          block.toLowerCase().startsWith(l.toLowerCase() + ':'),
        )
        if (labelMatch) {
          const value = block.slice(labelMatch.length + 1).trim()
          const isTldr = labelMatch === 'TL;DR'
          return (
            <div key={i} className={isTldr ? 'rounded-md border border-accent/30 bg-accent/5 p-3' : ''}>
              <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary mb-1">
                {labelMatch}
              </div>
              <p className="text-sm text-foreground leading-relaxed">{value}</p>
            </div>
          )
        }
        return (
          <p key={i} className="text-sm text-foreground leading-relaxed">
            {block}
          </p>
        )
      })}
    </div>
  )
}
