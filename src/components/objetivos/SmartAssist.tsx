'use client'
// SIR V2 — SmartAssist (Hito A): helper IA "Hacer SMART".
//
// Toma el objetivo en bruto que se está redactando (título/descripción/dominio/
// fecha) y pide a /api/objectives/smart una definición SMART: target medible +
// baseline + por qué + fecha sugerida. NO autoguarda: muestra la propuesta
// editable y, al aceptar, la vuelca en el formulario (review-before-save).

import { useCallback, useState } from 'react'
import { Sparkles, Loader2, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApiErrorNotice } from '@/components/ui/api-error-notice'
import { parseErrorResponse, type ApiError } from '@/lib/api/errors'
import type { ProposedSmart } from '@/lib/objectives/smartPrompt'

export interface SmartDraft {
  title: string
  description?: string
  category?: string
  targetDate?: string
}

interface State {
  loading: boolean
  proposed: ProposedSmart | null
  error: ApiError | null
}

export function SmartAssist({
  draft,
  onApply,
}: {
  draft: SmartDraft
  /** Vuelca la propuesta aceptada al formulario. `suggestedTargetDate` solo si
   *  el objetivo no tenía fecha. */
  onApply: (fields: { target: string; baseline?: string; why?: string; suggestedTargetDate?: string }) => void
}) {
  const [state, setState] = useState<State>({ loading: false, proposed: null, error: null })

  const generate = useCallback(async () => {
    if (!draft.title.trim()) return
    setState({ loading: true, proposed: null, error: null })
    try {
      const res = await fetch('/api/objectives/smart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: draft.title,
          description: draft.description || undefined,
          category: draft.category,
          targetDate: draft.targetDate || undefined,
        }),
      })
      if (!res.ok) {
        setState({ loading: false, proposed: null, error: await parseErrorResponse(res) })
        return
      }
      const json = (await res.json()) as { smart: ProposedSmart }
      setState({ loading: false, proposed: json.smart, error: null })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setState({
        loading: false,
        proposed: null,
        error: { status: 0, message: 'Red caída o request abortado', detail: msg },
      })
    }
  }, [draft.title, draft.description, draft.category, draft.targetDate])

  function patch(p: Partial<ProposedSmart>) {
    setState((s) => (s.proposed ? { ...s, proposed: { ...s.proposed, ...p } } : s))
  }
  function discard() {
    setState({ loading: false, proposed: null, error: null })
  }
  function accept() {
    if (!state.proposed) return
    const { target, baseline, why, suggestedTargetDate } = state.proposed
    if (!target.trim()) return
    onApply({
      target: target.trim(),
      baseline: baseline?.trim() || undefined,
      why: why?.trim() || undefined,
      suggestedTargetDate: suggestedTargetDate || undefined,
    })
    discard()
  }

  return (
    <div className="col-span-2">
      {state.error && <ApiErrorNotice error={state.error} className="mb-2" />}
      {state.loading ? (
        <div className="rounded-md border border-brand/20 bg-brand-soft p-3">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70">
            <Loader2 size={12} className="animate-spin" aria-hidden="true" />
            Definiendo SMART…
          </div>
        </div>
      ) : state.proposed ? (
        <div className="rounded-md border border-brand/30 bg-brand-soft p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-brand-soft-foreground">
              <Sparkles size={13} />
              Definición SMART propuesta · revisá, editá y aceptá
            </div>
            <button type="button" onClick={discard} className="text-muted-foreground/60 hover:text-foreground" aria-label="Descartar">
              <X size={14} />
            </button>
          </div>
          <div className="space-y-1.5">
            <Field label="Meta medible (target)">
              <Input value={state.proposed.target} onChange={(e) => patch({ target: e.target.value })} className="h-8 text-sm" placeholder="Ej. Pesar 75 kg" />
            </Field>
            <Field label="Hoy estás (baseline)">
              <Input value={state.proposed.baseline ?? ''} onChange={(e) => patch({ baseline: e.target.value })} className="h-8 text-sm" placeholder="Ej. 82 kg (opcional)" />
            </Field>
            <Field label="Por qué importa (why)">
              <Input value={state.proposed.why ?? ''} onChange={(e) => patch({ why: e.target.value })} className="h-8 text-sm" placeholder="Por qué importa" />
            </Field>
            {state.proposed.suggestedTargetDate && (
              <Field label="Fecha sugerida">
                <Input type="date" value={state.proposed.suggestedTargetDate} onChange={(e) => patch({ suggestedTargetDate: e.target.value })} className="h-8 w-44 font-mono text-xs" />
              </Field>
            )}
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              onClick={accept}
              className="border-ok/30 bg-ok-soft text-ok-foreground hover:bg-ok/20 hover:text-ok-foreground"
            >
              Aplicar al objetivo
            </Button>
            <Button size="sm" variant="ghost" onClick={discard}>Descartar</Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={generate}
          disabled={!draft.title.trim()}
          className="border-brand/30 text-brand-soft-foreground hover:bg-brand-soft"
        >
          <Sparkles size={12} className="mr-2" />Hacer SMART con IA
        </Button>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
      <span className="text-[10px] uppercase tracking-[0.07em] text-text-tertiary w-full sm:w-40 flex-shrink-0">{label}</span>
      <div className="flex-1 w-full">{children}</div>
    </div>
  )
}
