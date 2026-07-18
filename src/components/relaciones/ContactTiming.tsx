'use client'
// SIR V2 — "Momento para contactar" (Parte B del reader social · mig 0150).
//
// Muestra el veredicto de TIMING de una persona y deja marcar de un toque lo que
// ves (de viaje, a full, buen momento, cambió de trabajo). Nace del caso Dayana:
// ves su story "de viaje" → lo marcás acá → SIR te frena antes de pedirle algo
// (en la ficha, el push y —próximamente— el Ensayo/negociar). Después la
// extensión pasiva lo alimentará sola. Client-side + fail-soft (tabla 0150).

import { useCallback, useEffect, useState } from 'react'
import { Clock, Plane, Hourglass, Smile, Briefcase, X, Loader2 } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { ContactSignal, ContactSignalKind } from '@/lib/contact-timing/types'
import type { TimingVerdict, TimingLevel } from '@/lib/contact-timing/assess'

const BASE = '/api/relaciones/contact-timing'

const QUICK: { kind: ContactSignalKind; label: string; Icon: typeof Plane }[] = [
  { kind: 'traveling', label: 'De viaje', Icon: Plane },
  { kind: 'busy', label: 'A full', Icon: Hourglass },
  { kind: 'available', label: 'Buen momento', Icon: Smile },
  { kind: 'job_change', label: 'Cambió de trabajo', Icon: Briefcase },
]

const KIND_LABEL: Record<ContactSignalKind, string> = {
  traveling: 'De viaje', busy: 'A full', away: 'Fuera', focus: 'Concentrada/o',
  available: 'Por acá', posting_burst: 'Activa/o', job_change: 'Cambió de trabajo',
  life_event: 'Evento de vida', other: 'Otro',
}

const LEVEL_CHIP: Record<TimingLevel, string> = {
  bad: 'border-bad/30 bg-bad-soft text-bad',
  caution: 'border-warn/30 bg-warn-soft text-warn',
  good: 'border-ok/30 bg-ok-soft text-ok',
  neutral: 'border-border bg-muted/10 text-muted-foreground',
}

const NEUTRAL_VERDICT: TimingVerdict = { level: 'neutral', reason: '', drivingKind: null, until: null }

export function ContactTiming({ personId, personName }: { personId: string; personName?: string }) {
  const [verdict, setVerdict] = useState<TimingVerdict>(NEUTRAL_VERDICT)
  const [signals, setSignals] = useState<ContactSignal[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}?person_id=${encodeURIComponent(personId)}`)
      const j = (await r.json()) as { verdict?: TimingVerdict; signals?: ContactSignal[] }
      setVerdict(j.verdict ?? NEUTRAL_VERDICT)
      setSignals(Array.isArray(j.signals) ? j.signals : [])
    } catch {
      setVerdict(NEUTRAL_VERDICT); setSignals([])
    } finally { setLoaded(true) }
  }, [personId])

  useEffect(() => { void load() }, [load])

  const record = useCallback(async (kind: ContactSignalKind) => {
    if (busy) return
    setBusy(true)
    try {
      const r = await fetch(BASE, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_id: personId, kind, source: 'manual' }),
      })
      if (r.ok) await load()
    } catch { /* fail-soft */ } finally { setBusy(false) }
  }, [busy, personId, load])

  const remove = useCallback(async (id: string) => {
    setBusyId(id)
    try {
      const r = await fetch(`${BASE}?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (r.ok) await load()
    } catch { /* fail-soft */ } finally { setBusyId(null) }
  }, [load])

  if (!loaded) return null
  const first = personName?.split(/\s+/)[0]

  return (
    <Card className="shadow-none mb-4 border-brand/15">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-2.5">
          <Clock size={13} strokeWidth={1.75} className="text-brand/70 shrink-0" aria-hidden="true" />
          <span className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Momento para contactar</span>
        </div>

        {verdict.level !== 'neutral' && verdict.reason ? (
          <div className={cn('rounded-md border px-3 py-2 text-[13px] leading-snug mb-2.5', LEVEL_CHIP[verdict.level])}>
            {verdict.reason}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground leading-relaxed mb-2.5">
            Sin señales{first ? ` de ${first}` : ''} — si ves algo (una story de viaje, que anda a full), márcalo y SIR
            te cuida el timing antes de escribirle.
          </p>
        )}

        {signals.length > 0 && (
          <ul className="flex flex-wrap gap-1.5 mb-2.5">
            {signals.map((s) => (
              <li key={s.id}>
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/10 px-2 py-0.5 text-[11px] text-muted-foreground">
                  {KIND_LABEL[s.kind]}{s.detail ? ` · ${s.detail}` : ''}
                  <button
                    type="button"
                    onClick={() => void remove(s.id)}
                    disabled={busyId === s.id}
                    title="Ya no aplica"
                    className="ml-0.5 rounded p-0.5 hover:text-bad transition-colors"
                  >
                    {busyId === s.id ? <Loader2 size={10} className="animate-spin" /> : <X size={11} strokeWidth={2} />}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap gap-1.5">
          {QUICK.map(({ kind, label, Icon }) => (
            <button
              key={kind}
              type="button"
              onClick={() => void record(kind)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-accent/40 hover:text-foreground disabled:opacity-50"
            >
              <Icon size={12} strokeWidth={1.75} /> {label}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
