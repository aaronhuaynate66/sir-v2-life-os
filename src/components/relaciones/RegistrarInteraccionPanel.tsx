'use client'
// SIR V2 — RegistrarInteraccionPanel (#14 backlog detail page V1).
//
// 5 estados emocionales para registrar el tono de la última interacción
// con esta persona: corazón roto (1) → pleno (5). Nota opcional. POSTea
// con kind='interaction' a /api/person-logs (tabla person_logs, Sesion 6).
//
// Storage Supabase-native compartido con #5: alimenta correlaciones
// futuras (Fase 3c: tono de interacción vs fase lunar / ciclo / score
// relacional).

import { useCallback, useState } from 'react'
import { track, EVENTS } from '@/lib/analytics/track'
import { useRouter } from 'next/navigation'
import { HeartCrack, Frown, Meh, Smile, Heart, Loader2, Check } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ApiErrorNotice } from '@/components/ui/api-error-notice'
import { toApiError, type ApiError } from '@/lib/api/errors'
import { cn } from '@/lib/utils'
import { createPersonLog } from './person-logs/client'
import { PersonLogsList } from './person-logs/PersonLogsList'
import type { PersonLog } from '@/lib/person-logs/types'

export interface RegistrarInteraccionPanelProps {
  personId: string
  recentLogs: PersonLog[]
}

interface EmoState {
  value: 1 | 2 | 3 | 4 | 5
  label: string
  Icon: LucideIcon
  accentClass: string
}

const EMO_STATES: ReadonlyArray<EmoState> = [
  { value: 1, label: 'Corazón roto', Icon: HeartCrack, accentClass: 'text-bad' },
  { value: 2, label: 'Tenso', Icon: Frown, accentClass: 'text-warn' },
  { value: 3, label: 'Neutral', Icon: Meh, accentClass: 'text-muted-foreground' },
  { value: 4, label: 'Cálido', Icon: Smile, accentClass: 'text-brand-soft-foreground' },
  { value: 5, label: 'Corazón pleno', Icon: Heart, accentClass: 'text-ok' },
]

export function RegistrarInteraccionPanel({
  personId,
  recentLogs,
}: RegistrarInteraccionPanelProps) {
  const router = useRouter()
  const [selected, setSelected] = useState<EmoState['value'] | null>(null)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [success, setSuccess] = useState<{ value: number } | null>(null)

  const onSubmit = useCallback(async () => {
    if (selected == null) return
    setSubmitting(true)
    setError(null)
    setSuccess(null)
    try {
      await createPersonLog({
        personId,
        kind: 'interaction',
        value: selected,
        note: note.trim() || undefined,
      })
      track(EVENTS.interactionLogged, { value: selected })
      setSuccess({ value: selected })
      setSelected(null)
      setNote('')
      router.refresh()
    } catch (e) {
      setError(toApiError(e))
    } finally {
      setSubmitting(false)
    }
  }, [selected, note, personId, router])

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-3">
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">
            Registrar interacción
          </div>
          <span className="text-[11px] text-text-tertiary">
            tono de la última conversación
          </span>
        </div>

        <div className="grid grid-cols-5 gap-2 mb-3">
          {EMO_STATES.map((s) => {
            const isSelected = selected === s.value
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => setSelected(s.value)}
                disabled={submitting}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-md border py-2 transition-colors disabled:opacity-50',
                  isSelected
                    ? 'border-brand/50 bg-brand-soft'
                    : 'border-border hover:border-border-strong hover:bg-secondary',
                )}
                title={s.label}
                aria-pressed={isSelected}
                aria-label={`${s.label} (${s.value} de 5)`}
              >
                <s.Icon
                  size={18}
                  strokeWidth={1.75}
                  className={cn(isSelected ? s.accentClass : 'text-muted-foreground')}
                  aria-hidden="true"
                />
                <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
                  {s.value}
                </span>
              </button>
            )
          })}
        </div>

        {selected && (
          <div className="text-xs text-center text-muted-foreground mb-3">
            <span className="font-medium text-foreground">
              {EMO_STATES.find((s) => s.value === selected)?.label}
            </span>
          </div>
        )}

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Nota opcional (qué pasó, contexto, sensación…)"
          rows={2}
          maxLength={500}
          disabled={submitting}
          className="w-full text-sm rounded-md border border-input bg-secondary px-3 py-2 resize-none mb-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
        />

        {note.length > 0 && (
          <div className="text-right text-[10px] font-mono text-muted-foreground/70 mb-2">
            {note.length}/500
          </div>
        )}

        <Button
          size="sm"
          onClick={onSubmit}
          disabled={selected == null || submitting}
          className="w-full"
        >
          {submitting ? (
            <>
              <Loader2 size={12} className="mr-2 animate-spin" />
              Registrando…
            </>
          ) : (
            'Registrar interacción'
          )}
        </Button>

        {success && (
          <div className="rounded-md border border-ok/30 bg-ok-soft p-2 text-xs mt-3 flex items-center gap-1.5">
            <Check size={12} strokeWidth={2} className="text-ok" aria-hidden="true" />
            <span className="text-ok-foreground">
              Interacción registrada con tono <span className="font-mono">{success.value}/5</span>.
            </span>
          </div>
        )}

        {error && <ApiErrorNotice error={error} className="p-2 mt-3" />}

        <div className="mt-4">
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary mb-2">
            Interacciones registradas
          </div>
          <PersonLogsList
            logs={recentLogs}
            kinds={['interaction']}
            max={5}
            emptyMessage="Aún no registraste ninguna interacción."
          />
        </div>
      </CardContent>
    </Card>
  )
}
