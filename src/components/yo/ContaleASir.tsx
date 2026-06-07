// SIR V2 — Onboarding por TEXTO de identidad ("Contale a SIR quién sos").
//
// Sub-panel del panel unificado "Mis capturas". Aaron escribe/dicta un párrafo
// sobre quién es; la extracción (sin Visión/OCR) arma una PROPUESTA editable que
// SUMA a sus anclas sin pisar lo manual. Reusa el extractor de identidad por
// texto + la consolidación + buildCaptureProposal + la propuesta editable
// compartida. Es la versión mínima del onboarding conversacional.
'use client'

import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Check, MessageSquareHeart, AlertCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ApiErrorNotice } from '@/components/ui/api-error-notice'
import { IdentityProposalReview } from '@/components/yo/IdentityProposalReview'
import { useSelfStore } from '@/stores/useSelfStore'
import {
  emptyIdentityProfile,
  normalizeIdentityProfile,
  type IdentityProfile,
} from '@/lib/identity'
import { buildCaptureProposal, type CaptureProposalDiff } from '@/lib/identity/applyCapture'
import { extractSelfProfileText, HttpError } from '@/lib/identity/captureClient'
import { consolidateSelfProfiles } from '@/lib/capture/self-profile/consolidate'

type Phase = 'idle' | 'working' | 'review' | 'done' | 'illegible'

interface ErrorState {
  status: number
  message: string
  detail?: string
}

function toError(e: unknown): ErrorState {
  if (e instanceof HttpError) return { status: e.status, message: e.message, detail: e.detail }
  return { status: 0, message: e instanceof Error ? e.message : String(e) }
}

export function ContaleASir() {
  const profile = useSelfStore((s) => s.identityProfile)
  const setIdentityProfile = useSelfStore((s) => s.setIdentityProfile)

  const [narrative, setNarrative] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<ErrorState | null>(null)
  const [draft, setDraft] = useState<IdentityProfile | null>(null)
  const [diff, setDiff] = useState<CaptureProposalDiff | null>(null)

  const working = phase === 'working'

  const run = useCallback(async () => {
    const text = narrative.trim()
    if (text.length < 12) return
    setPhase('working')
    setError(null)
    try {
      const extracted = await extractSelfProfileText(text)
      const consolidated = consolidateSelfProfiles([extracted])!
      const base = profile ?? emptyIdentityProfile('idn_' + Date.now())
      const proposal = buildCaptureProposal(base, consolidated)

      const nothingUsable =
        !proposal.hasChanges &&
        consolidated.confidence === 'low' &&
        consolidated.roles.length === 0 &&
        consolidated.interests.length === 0 &&
        consolidated.skills.length === 0 &&
        !consolidated.fullName &&
        !consolidated.birthDate
      if (nothingUsable) {
        setPhase('illegible')
        return
      }
      setDraft(proposal.proposed)
      setDiff(proposal.diff)
      setPhase('review')
    } catch (e) {
      setError(toError(e))
      setPhase('idle')
    }
  }, [narrative, profile])

  const save = useCallback(() => {
    if (!draft) return
    const clean = normalizeIdentityProfile({ ...draft, updatedAt: new Date().toISOString() })
    setIdentityProfile(clean)
    setPhase('done')
    toast.success('Identidad actualizada', { description: 'Desde lo que le contaste a SIR.' })
  }, [draft, setIdentityProfile])

  function reset() {
    setNarrative('')
    setDraft(null)
    setDiff(null)
    setError(null)
    setPhase('idle')
  }

  if (phase === 'done') {
    return (
      <div className="space-y-3 rounded-md border border-ok/30 bg-ok-soft p-3">
        <div className="flex items-center gap-2 text-xs text-ok">
          <Check size={14} strokeWidth={2} className="flex-shrink-0" aria-hidden="true" />
          Tus anclas quedaron actualizadas con lo que contaste.
        </div>
        <Button size="sm" variant="outline" onClick={reset} className="w-full">
          Contar algo más
        </Button>
      </div>
    )
  }

  if (phase === 'illegible') {
    return (
      <div className="space-y-3">
        <div className="rounded-md border border-warn/30 bg-warn/5 p-3 text-xs flex items-start gap-2">
          <AlertCircle size={14} strokeWidth={1.75} className="text-warn flex-shrink-0 mt-0.5" aria-hidden="true" />
          <span className="text-warn-foreground">
            No pude sacar datos claros de tu relato. Contá un poco más sobre vos —
            a qué te dedicás, qué te importa, dónde vivís. No guardé nada.
          </span>
        </div>
        <Button size="sm" variant="outline" onClick={() => setPhase('idle')} className="w-full">
          Volver a intentar
        </Button>
      </div>
    )
  }

  if (phase === 'review' && draft) {
    return (
      <IdentityProposalReview
        draft={draft}
        setDraft={setDraft}
        diff={diff}
        source="text"
        usedCount={1}
        onSave={save}
        onCancel={reset}
      />
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
        Contá en tus palabras <span className="font-medium text-foreground">quién sos</span>: a qué te
        dedicás, qué te importa, cuándo naciste, dónde vivís. Escribí o dictá un párrafo — saco las
        anclas y te las muestro para revisar.{' '}
        <span className="font-medium text-foreground">Nunca piso lo que ya escribiste.</span>
      </p>
      <textarea
        value={narrative}
        onChange={(e) => { setNarrative(e.target.value); setError(null) }}
        disabled={working}
        rows={5}
        placeholder="Ej: Soy Aaron, bombero voluntario y fundador de Marlab. Nací el 30 de mayo de 1990 en Lima. Me apasiona el taekwondo y la fotografía…"
        className="w-full rounded-md border border-border bg-background p-2.5 text-sm leading-relaxed disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-accent/40"
      />

      {error && <ApiErrorNotice error={error} className="p-2" />}

      <Button size="sm" onClick={run} disabled={narrative.trim().length < 12 || working} className="w-full sm:w-auto">
        {working ? (
          <><Loader2 size={14} className="mr-2 animate-spin" />Procesando…</>
        ) : (
          <><MessageSquareHeart size={14} strokeWidth={1.75} className="mr-2" aria-hidden="true" />Procesar relato</>
        )}
      </Button>
    </div>
  )
}
