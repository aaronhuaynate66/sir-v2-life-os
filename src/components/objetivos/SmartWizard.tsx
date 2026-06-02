'use client'
// SIR V2 — SmartWizard: definición GUIADA de un objetivo SMART (no chat libre).
//
// Antes de generar el plan OKR, el objetivo tiene que quedar BIEN DEFINIDO. Este
// wizard lleva al usuario campo por campo por las dimensiones SMART:
//   1. Specific   — el QUÉ, afinado (→ title)
//   2. Measurable — la meta medible (→ target)
//   3. Baseline   — el punto de partida (→ baseline)  ← AUTO-PROPUESTO de la data
//   4. Time-bound — la fecha límite (→ targetDate)
//   5. Relevant   — por qué importa ahora (→ why)
//
// LATENCIA: una SOLA llamada al modelo al abrir (batch) pre-llena las sugerencias
// de TODOS los campos; no hay una llamada por tecla ni por paso. El baseline es
// el diferenciador: se infiere del grounding REAL del usuario (finanzas/peso/
// bienestar/señales) para no preguntarle lo que SIR ya sabe. El usuario sólo
// confirma o edita. Además, "dictarlo todo de una" extrae los campos de un
// párrafo libre y re-llena el wizard para revisión.
//
// Persiste en la tabla goals (target/baseline/why/target_date + title) sólo al
// confirmar (review-before-save).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Sparkles,
  Loader2,
  Target,
  Gauge,
  CalendarClock,
  Heart,
  Pencil,
  ChevronLeft,
  ChevronRight,
  Check,
  Wand2,
} from 'lucide-react'

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ApiErrorNotice } from '@/components/ui/api-error-notice'
import { parseErrorResponse, withTimeoutHint, type ApiError } from '@/lib/api/errors'
import type { ProposedSmart } from '@/lib/objectives/smartPrompt'
import { missingSmartFields } from '@/lib/objectives/smart'
import { buildGroundingContext, renderGroundingForPrompt } from '@/lib/objectives/grounding'
import { useGoalStore } from '@/stores/useGoalStore'
import { useFinanceStore } from '@/stores/useFinanceStore'
import { useSelfStore } from '@/stores/useSelfStore'
import { useSignalStore } from '@/stores/useSignalStore'
import { useRelationshipStore } from '@/stores/useRelationshipStore'
import { cn } from '@/lib/utils'
import type { Goal } from '@/types'

type StepKey = 'specific' | 'measurable' | 'baseline' | 'timeBound' | 'relevant'

interface StepMeta {
  key: StepKey
  letter: string
  title: string
  hint: string
  icon: typeof Target
}

const STEPS: StepMeta[] = [
  { key: 'specific', letter: 'S', title: '¿Qué querés lograr, exactamente?', hint: 'Afiná el objetivo a una frase nítida. Sin ambigüedad.', icon: Pencil },
  { key: 'measurable', letter: 'M', title: '¿Cómo vas a medir que lo lograste?', hint: 'Un número, umbral o estado verificable. Algo que se pueda tachar como hecho.', icon: Gauge },
  { key: 'baseline', letter: 'B', title: '¿Dónde estás hoy?', hint: 'El punto de partida. SIR lo propone desde tu data real — confirmá o ajustá.', icon: Target },
  { key: 'timeBound', letter: 'T', title: '¿Para cuándo?', hint: 'La fecha límite. Realista para la ambición de la meta.', icon: CalendarClock },
  { key: 'relevant', letter: 'R', title: '¿Por qué importa ahora?', hint: 'La relevancia honesta para vos. Es lo que te va a sostener.', icon: Heart },
]

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function SmartWizard({ goal, onClose }: { goal: Goal; onClose: () => void }) {
  const updateGoal = useGoalStore((s) => s.updateGoal)

  // Grounding: data real para auto-proponer el baseline (y aterrizar el resto).
  const financialMovements = useFinanceStore((s) => s.financialMovements)
  const healthMetrics = useSelfStore((s) => s.healthMetrics)
  const selfMetrics = useSelfStore((s) => s.selfMetrics)
  const signals = useSignalStore((s) => s.signals)
  const people = useRelationshipStore((s) => s.people)

  const groundingText = useMemo(() => {
    const linkedPeople = (goal.relatedPersons ?? [])
      .map((id) => people.find((p) => p.id === id)?.name)
      .filter((n): n is string => !!n)
    const ctx = buildGroundingContext({ financialMovements, healthMetrics, selfMetrics, signals, linkedPeople })
    return renderGroundingForPrompt(ctx)
  }, [goal.relatedPersons, people, financialMovements, healthMetrics, selfMetrics, signals])

  const [step, setStep] = useState(0)
  const [specific, setSpecific] = useState(goal.title ?? '')
  const [target, setTarget] = useState(goal.target ?? '')
  const [baseline, setBaseline] = useState(goal.baseline ?? '')
  const [targetDate, setTargetDate] = useState(goal.targetDate ?? '')
  const [why, setWhy] = useState(goal.why ?? '')

  const [suggested, setSuggested] = useState<ProposedSmart | null>(null)
  const [suggesting, setSuggesting] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  /** true si el baseline pre-llenado salió del grounding (no de lo que el usuario ya tenía). */
  const [baselineFromData, setBaselineFromData] = useState(false)

  const [dictation, setDictation] = useState('')
  const [dictating, setDictating] = useState(false)
  const [showDictation, setShowDictation] = useState(false)

  const fieldValues = useMemo(
    () => ({ target, baseline, targetDate, why }),
    [target, baseline, targetDate, why],
  )
  const missing = missingSmartFields(fieldValues)
  const isComplete = missing.length === 0 && specific.trim().length > 0

  // ─── Una sola llamada batch al abrir: pre-llena sugerencias de TODOS los campos ──
  const fetchSuggestions = useCallback(
    async (opts?: { dictation?: string }) => {
      const dict = opts?.dictation?.trim()
      if (dict) setDictating(true)
      else setSuggesting(true)
      setError(null)
      try {
        const res = await fetch('/api/objectives/smart', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: goal.title,
            description: goal.description || undefined,
            category: goal.category,
            targetDate: targetDate || undefined,
            context: groundingText || undefined,
            dictation: dict || undefined,
          }),
        })
        if (!res.ok) {
          setError(withTimeoutHint(await parseErrorResponse(res)))
          return
        }
        const json = (await res.json()) as { smart: ProposedSmart }
        const s = json.smart
        setSuggested(s)

        // Dictado: re-llena TODOS los campos para revisión. Batch normal: sólo
        // completa los VACÍOS (no piso lo que el usuario ya escribió).
        const force = !!dict
        if (s.specific && (force || !specific.trim())) setSpecific(s.specific)
        if (s.target && (force || !target.trim())) setTarget(s.target)
        if (s.baseline && (force || !baseline.trim())) {
          setBaseline(s.baseline)
          setBaselineFromData(!!groundingText)
        }
        if (s.why && (force || !why.trim())) setWhy(s.why)
        if (s.suggestedTargetDate && (force || !targetDate)) setTargetDate(s.suggestedTargetDate)
        if (dict) {
          setShowDictation(false)
          setStep(0)
          toast.success('Borrador extraído', { description: 'Revisá cada paso y ajustá lo que haga falta.' })
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setError({ status: 0, message: 'Red caída o request abortado', detail: msg })
      } finally {
        setSuggesting(false)
        setDictating(false)
      }
    },
    // Intencionalmente sin las deps de los campos: la llamada batch corre 1 vez
    // al montar; el dictado pasa su texto por argumento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [goal.id, groundingText],
  )

  // Auto-sugerir al abrir SÓLO si falta algo (objetivo ya SMART → no gastamos llamada).
  useEffect(() => {
    if (!isComplete) void fetchSuggestions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleSave() {
    if (!isComplete) {
      toast.error('Faltan campos', { description: 'Completá las 5 dimensiones SMART para guardar.' })
      return
    }
    updateGoal(goal.id, {
      title: specific.trim() || goal.title,
      target: target.trim(),
      baseline: baseline.trim(),
      targetDate: targetDate || undefined,
      why: why.trim(),
    })
    toast.success('Objetivo definido', { description: 'Ahora podés generar un plan aterrizado.' })
    onClose()
  }

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1

  // Sugerencia IA del paso actual (para el botón "usar sugerencia" si difiere).
  function currentSuggestion(): string | undefined {
    if (!suggested) return undefined
    switch (current.key) {
      case 'specific': return suggested.specific
      case 'measurable': return suggested.target
      case 'baseline': return suggested.baseline
      case 'timeBound': return suggested.suggestedTargetDate
      case 'relevant': return suggested.why
    }
  }
  function currentValue(): string {
    switch (current.key) {
      case 'specific': return specific
      case 'measurable': return target
      case 'baseline': return baseline
      case 'timeBound': return targetDate
      case 'relevant': return why
    }
  }
  function applySuggestion(v: string) {
    switch (current.key) {
      case 'specific': setSpecific(v); break
      case 'measurable': setTarget(v); break
      case 'baseline': setBaseline(v); setBaselineFromData(false); break
      case 'timeBound': setTargetDate(v); break
      case 'relevant': setWhy(v); break
    }
  }

  const stepFilled = currentValue().trim().length > 0
  const suggestion = currentSuggestion()
  const suggestionDiffers = !!suggestion && suggestion.trim() !== currentValue().trim()

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto flex flex-col gap-0">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles size={18} className="text-brand-soft-foreground" />
            Definir objetivo (SMART)
          </SheetTitle>
          <SheetDescription className="truncate">{goal.title}</SheetDescription>
        </SheetHeader>

        {/* Progreso de pasos */}
        <div className="mt-4 flex items-center gap-1.5">
          {STEPS.map((s, i) => {
            const done = i < step
            const here = i === step
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setStep(i)}
                className={cn(
                  'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border text-[11px] font-mono font-semibold transition-colors',
                  here
                    ? 'border-brand bg-brand-soft text-brand-soft-foreground'
                    : done
                      ? 'border-ok/40 bg-ok-soft text-ok-foreground'
                      : 'border-border text-text-tertiary hover:border-border-strong',
                )}
                aria-label={`Paso ${i + 1}: ${s.title}`}
                aria-current={here}
              >
                {done ? <Check size={13} /> : s.letter}
              </button>
            )
          })}
        </div>

        {/* Dictarlo todo de una */}
        <div className="mt-4">
          {showDictation ? (
            <div className="rounded-md border border-brand/30 bg-brand-soft p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs text-brand-soft-foreground">
                <Wand2 size={13} />
                Dictalo todo de una · la IA extrae los campos SMART
              </div>
              <Textarea
                value={dictation}
                onChange={(e) => setDictation(e.target.value)}
                placeholder="Ej. Quiero bajar a 75 kg para fin de año porque quiero competir en mi categoría; hoy peso 82."
                className="min-h-[88px] text-sm"
                disabled={dictating}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={dictating || !dictation.trim()}
                  onClick={() => void fetchSuggestions({ dictation })}
                  className="border-brand/30 text-brand-soft-foreground hover:bg-brand-soft"
                >
                  {dictating ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Wand2 size={13} className="mr-1.5" />}
                  Extraer campos
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowDictation(false)} disabled={dictating}>Cerrar</Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowDictation(true)}
              className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <Wand2 size={12} />
              ¿Preferís dictarlo todo de una? Pegá un párrafo y la IA lo ordena.
            </button>
          )}
        </div>

        {error && <ApiErrorNotice error={error} className="mt-4" />}

        {/* Paso actual */}
        <div className="mt-5 flex-1">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.07em] text-text-tertiary">
            <current.icon size={13} className="text-brand-soft-foreground" />
            Paso {step + 1} de {STEPS.length}
          </div>
          <h3 className="mt-1.5 text-base font-semibold text-foreground">{current.title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{current.hint}</p>

          <div className="mt-3">
            {current.key === 'timeBound' ? (
              <Input
                type="date"
                min={todayIso()}
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="font-mono w-48"
              />
            ) : current.key === 'relevant' || current.key === 'measurable' ? (
              <Textarea
                value={current.key === 'measurable' ? target : why}
                onChange={(e) => (current.key === 'measurable' ? setTarget(e.target.value) : setWhy(e.target.value))}
                placeholder={current.key === 'measurable' ? 'Ej. Pesar 75 kg' : 'Ej. Quiero competir en mi categoría sin lesionarme'}
                className="min-h-[72px] text-sm"
              />
            ) : (
              <Input
                value={current.key === 'specific' ? specific : baseline}
                onChange={(e) => {
                  if (current.key === 'specific') setSpecific(e.target.value)
                  else { setBaseline(e.target.value); setBaselineFromData(false) }
                }}
                placeholder={current.key === 'specific' ? 'Ej. Bajar a 75 kg de forma sostenible' : 'Ej. 82 kg'}
                className="text-sm"
              />
            )}

            {/* Baseline auto-propuesto: hint del diferenciador */}
            {current.key === 'baseline' && baselineFromData && stepFilled && (
              <p className="mt-1.5 text-[11px] text-ok-foreground flex items-center gap-1.5">
                <Sparkles size={11} /> Propuesto desde tu data real. Confirmá o ajustá.
              </p>
            )}
            {current.key === 'baseline' && !groundingText && (
              <p className="mt-1.5 text-[11px] text-muted-foreground/70">
                Todavía no hay data en SIR para proponer tu punto de partida. Indicalo a mano.
              </p>
            )}

            {/* Estado de la sugerencia batch */}
            {suggesting && (
              <p className="mt-2 text-[11px] text-muted-foreground/70 flex items-center gap-1.5">
                <Loader2 size={11} className="animate-spin" /> Pensando una sugerencia desde tu objetivo y tu data…
              </p>
            )}
            {suggestionDiffers && !suggesting && (
              <button
                type="button"
                onClick={() => applySuggestion(suggestion!)}
                className="mt-2 flex w-full items-start gap-1.5 rounded-md border border-brand/25 bg-brand-soft px-2.5 py-1.5 text-left text-[12px] text-brand-soft-foreground hover:bg-brand/15 transition-colors"
              >
                <Sparkles size={12} className="mt-0.5 flex-shrink-0" />
                <span><span className="opacity-70">Sugerencia IA:</span> {suggestion}</span>
              </button>
            )}
          </div>
        </div>

        {/* Navegación */}
        <div className="mt-6 border-t border-border/40 pt-4">
          {missing.length > 0 && (
            <p className="mb-3 text-[11px] text-muted-foreground/70">
              Para guardar faltan: {missing.length} de 5 dimensiones.
            </p>
          )}
          <div className="flex items-center justify-between gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
            >
              <ChevronLeft size={14} className="mr-1" /> Atrás
            </Button>
            {isLast ? (
              <Button
                size="sm"
                variant="outline"
                onClick={handleSave}
                disabled={!isComplete}
                className="border-ok/30 bg-ok-soft text-ok-foreground hover:bg-ok/20 hover:text-ok-foreground"
              >
                <Check size={14} className="mr-1.5" /> Guardar definición
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
                disabled={!stepFilled}
                className="border-brand/30 text-brand-soft-foreground hover:bg-brand-soft"
              >
                Siguiente <ChevronRight size={14} className="ml-1" />
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
