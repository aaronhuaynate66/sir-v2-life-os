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
import { MessageCircle, Sparkles, Loader2, AlertCircle, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet'
import { whatsappLink } from '@/lib/social/links'
import { generatePersonBriefing, type GenerateBriefingError } from './person-briefing/client'

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
  const [error, setError] = useState<GenerateBriefingError | null>(null)

  const runBriefing = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const text = await generatePersonBriefing(personId)
      setBriefing(text)
    } catch (e) {
      const err = e as GenerateBriefingError
      if (err && typeof err.status === 'number') setError(err)
      else setError({ status: 0, message: e instanceof Error ? e.message : String(e) })
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
            className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-400"
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
              <Sparkles size={16} strokeWidth={1.75} className="text-accent" aria-hidden="true" />
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
              <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-medium text-red-400">
                  <AlertCircle size={12} strokeWidth={2} aria-hidden="true" />
                  Error HTTP {error.status}: {error.message}
                </div>
                {error.detail && <div className="text-muted-foreground">{error.detail}</div>}
              </div>
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
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-1">
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
