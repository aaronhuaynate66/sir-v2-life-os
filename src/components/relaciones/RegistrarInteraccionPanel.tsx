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
import { toast } from 'sonner'
import { HeartCrack, Frown, Meh, Smile, Heart, Loader2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { ApiErrorNotice } from '@/components/ui/api-error-notice'
import { toApiError, type ApiError } from '@/lib/api/errors'
import { cn } from '@/lib/utils'
import { createPersonLog, deletePersonLog } from './person-logs/client'
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
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  // 1 TOQUE: tocar el rostro registra directo (con la nota si la escribiste),
  // con toast + "Deshacer" (patrón hábitos). Antes eran 2-3 toques (rostro →
  // botón). UX audit hallazgo #6.
  const logTone = useCallback(async (value: EmoState['value'], label: string) => {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    const noteText = note.trim() || undefined
    try {
      const log = await createPersonLog({ personId, kind: 'interaction', value, note: noteText })
      track(EVENTS.interactionLogged, { value })
      setNote('')
      router.refresh()
      toast.success(`Interacción registrada · ${label} (${value}/5)`, {
        action: {
          label: 'Deshacer',
          onClick: () => {
            void deletePersonLog(log.id).then(() => router.refresh()).catch(() => toast.error('No se pudo deshacer'))
          },
        },
      })
    } catch (e) {
      setError(toApiError(e))
    } finally {
      setSubmitting(false)
    }
  }, [submitting, note, personId, router])

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-1">
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">
            Registrar interacción
          </div>
          <span className="text-[11px] text-text-tertiary">
            toca el tono — queda al toque
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground/70 mb-3">
          ¿Quieres sumar contexto? Escribe la nota primero y luego toca el tono.
        </p>

        {/* Nota opcional ARRIBA: si la escribes, el tap del rostro la incluye. */}
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Nota opcional (qué pasó, contexto, sensación…)"
          rows={2}
          maxLength={500}
          disabled={submitting}
          className="w-full text-sm rounded-md border border-input bg-secondary px-3 py-2 resize-none mb-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
        />
        {note.length > 0 && (
          <div className="text-right text-[10px] font-mono text-muted-foreground/70 mb-1">
            {note.length}/500
          </div>
        )}

        <div className="grid grid-cols-5 gap-2 mt-2">
          {EMO_STATES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => void logTone(s.value, s.label)}
              disabled={submitting}
              className={cn(
                'flex flex-col items-center gap-1 rounded-md border py-2.5 transition-colors disabled:opacity-50',
                'border-border hover:border-brand/50 hover:bg-brand-soft active:bg-brand-soft',
              )}
              title={`${s.label} — registrar al toque`}
              aria-label={`Registrar interacción: ${s.label} (${s.value} de 5)`}
            >
              {submitting
                ? <Loader2 size={18} className="animate-spin text-muted-foreground" aria-hidden="true" />
                : <s.Icon size={18} strokeWidth={1.75} className={s.accentClass} aria-hidden="true" />}
              <span className="text-[9px] leading-tight text-center text-muted-foreground">{s.label}</span>
            </button>
          ))}
        </div>

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
