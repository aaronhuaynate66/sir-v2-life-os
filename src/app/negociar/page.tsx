'use client'

// SIR V2 — /negociar: Preparar una negociación (playbook de influencia #05).
//
// El marco RACIONAL de Harvard para una negociación concreta: BATNA (tu mejor
// alternativa → tu poder), ZOPA (zona de acuerdo), ancla y punto de retirada,
// leyendo lo que el otro dijo. Presión y apalancamiento sí; coacción no.
// Llama a /api/influence/negotiation (capable).

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Handshake, Loader2, Sparkles, Quote, Anchor, ArrowRight, ShieldAlert, DoorOpen, Scale, Users, Activity } from 'lucide-react'

import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Button, buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useRelationshipStore } from '@/stores'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { RouteSkeleton } from '@/components/skeletons/RouteSkeleton'
import { trackAiError } from '@/lib/analytics/track'
import type { NegotiationPrep } from '@/lib/influence/negotiationPrep'
import type { EthicsCheck } from '@/engines/ethics'
import { StrategicRiskMeter } from '@/components/influence/StrategicRiskMeter'
import { ContactTimingBanner } from '@/components/relaciones/ContactTimingBanner'

export default function NegociarPage() {
  const hydrated = useHasHydrated()
  if (!hydrated) return <RouteSkeleton cards={2} />
  return <NegociarContent />
}

function NegociarContent() {
  const people = useRelationshipStore((s) => s.people)
  const sorted = useMemo(
    () => [...people].sort((a, b) => (b.importanceScore ?? 0) - (a.importanceScore ?? 0) || a.name.localeCompare(b.name)),
    [people],
  )

  const [personId, setPersonId] = useState('')
  const [subject, setSubject] = useState('')
  const [goal, setGoal] = useState('')
  const [alternative, setAlternative] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [blocked, setBlocked] = useState<string | null>(null)
  const [prep, setPrep] = useState<NegotiationPrep | null>(null)
  const [ethics, setEthics] = useState<EthicsCheck | null>(null)
  const [selfWarning, setSelfWarning] = useState<string | null>(null)
  const [forName, setForName] = useState('')
  const [hadContext, setHadContext] = useState(true)

  async function run() {
    if (!personId || !subject.trim()) return
    setBusy(true); setError(null); setBlocked(null); setPrep(null); setEthics(null); setSelfWarning(null)
    try {
      const res = await fetch('/api/influence/negotiation', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personId, subject, goal, alternative }),
      })
      const text = await res.text()
      let j: {
        prep?: NegotiationPrep; person?: { name: string; hadContext: boolean }
        ethics?: EthicsCheck; blocked?: boolean; message?: string; error?: string; detail?: string
        selfWarning?: string | null
      } = {}
      try { j = text ? JSON.parse(text) : {} } catch { /* no-JSON */ }

      if (j.blocked) { setBlocked(j.message || 'Esto no pasa la prueba de fuego.'); setEthics(j.ethics ?? null); return }
      if (!res.ok || !j.prep) {
        trackAiError('negotiation', { status: res.status, message: j.error, detail: j.detail })
        setError(
          j.error ? `${j.error}${j.detail ? ` — ${j.detail}` : ''}`
            : res.status === 504 || res.status === 502
              ? 'Tardó demasiado y el servidor cortó. Reinténtalo.'
              : `No pude preparar la negociación (código ${res.status || '—'}). Reintenta.`,
        )
        return
      }
      setPrep(j.prep); setEthics(j.ethics ?? null); setSelfWarning(j.selfWarning ?? null)
      setForName(j.person?.name ?? ''); setHadContext(j.person?.hadContext ?? true)
    } catch (e) {
      trackAiError('negotiation', { status: 0, message: e instanceof Error ? e.message : String(e) })
      setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }

  return (
    <AppShell>
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <Handshake size={26} strokeWidth={1.5} className="text-muted-foreground" />
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Preparar una negociación</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed max-w-2xl">
          Para un trato concreto (un cliente, un proveedor, un sueldo). SIR arma el marco:
          <span className="text-foreground/80"> tu BATNA</span> (tu mejor alternativa, de ahí sale tu poder),
          la <span className="text-foreground/80">ZOPA</span> estimada leyendo lo que el otro dijo, con qué anclar
          y tu punto de retirada. Presión y apalancamiento sí; coacción no.
        </p>
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Aún no tienes personas en tu red."
          hint="Agrega a la contraparte en Relaciones y vuelve para armar el marco de la negociación."
          action={<Link href="/relaciones" className={buttonVariants({ size: 'sm' })}>Ir a Relaciones</Link>}
        />
      ) : (
      <>
      <Card className="shadow-none mb-4">
        <CardContent className="p-4 sm:p-5 space-y-3">
          <div>
            <label className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary font-sans block mb-1.5">Con quién</label>
            <Select value={personId} onValueChange={setPersonId}>
              <SelectTrigger><SelectValue placeholder="Elige una persona…" /></SelectTrigger>
              <SelectContent>
                {sorted.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}{p.title ? ` · ${p.title}` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label htmlFor="subject" className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary font-sans block mb-1.5">Qué vas a negociar</label>
            <textarea
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              rows={2}
              placeholder="Ej: el precio del contrato anual. / que me conecte con su proveedor. / los plazos de entrega."
              className="w-full resize-y rounded-md border border-border bg-background p-3 text-sm leading-relaxed outline-none focus:border-foreground/30 min-h-[60px]"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="goal" className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary font-sans block mb-1.5">Tu objetivo <span className="text-muted-foreground/50 normal-case tracking-normal">(opcional)</span></label>
              <input id="goal" value={goal} onChange={(e) => setGoal(e.target.value)}
                placeholder="Ej: cerrar en S/ 8k/mes" className="w-full rounded-md border border-border bg-background p-2.5 text-sm outline-none focus:border-foreground/30" />
            </div>
            <div>
              <label htmlFor="alt" className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary font-sans block mb-1.5">Tu alternativa si no hay trato <span className="text-muted-foreground/50 normal-case tracking-normal">(opcional)</span></label>
              <input id="alt" value={alternative} onChange={(e) => setAlternative(e.target.value)}
                placeholder="Ej: tengo otro proveedor a mano" className="w-full rounded-md border border-border bg-background p-2.5 text-sm outline-none focus:border-foreground/30" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => void run()} disabled={!personId || !subject.trim() || busy}>
              {busy ? <><Loader2 size={14} className="mr-1.5 animate-spin" />Preparando…</> : <><Sparkles size={14} strokeWidth={1.75} className="mr-1.5" />Prepárame</>}
            </Button>
          </div>
          {error && <div className="rounded-md border border-bad/30 bg-bad-soft p-2.5 text-[12px] text-bad leading-relaxed">{error}</div>}
        </CardContent>
      </Card>

      {personId && <ContactTimingBanner personId={personId} className="mb-4" />}

      {blocked && (
        <Card className="shadow-none border-warn/40 mb-4">
          <CardContent className="p-4 sm:p-5 bg-warn-soft">
            <div className="flex items-start gap-3">
              <ShieldAlert size={20} strokeWidth={1.75} className="text-warn mt-0.5 flex-shrink-0" aria-hidden="true" />
              <div>
                <div className="text-sm font-semibold text-warn">Un alto aquí</div>
                <p className="text-sm text-foreground/90 leading-relaxed mt-1">{blocked}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {selfWarning && (
        <Card className="shadow-none border-warn/40 mb-4">
          <CardContent className="p-4 sm:p-5 bg-warn-soft">
            <div className="flex items-start gap-3">
              <Activity size={20} strokeWidth={1.75} className="text-warn mt-0.5 flex-shrink-0" aria-hidden="true" />
              <div>
                <div className="text-sm font-semibold text-warn">¿Estás para esto?</div>
                <p className="text-sm text-foreground/90 leading-relaxed mt-1">{selfWarning}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {prep && <PrepView prep={prep} ethics={ethics} forName={forName} hadContext={hadContext} />}
      </>
      )}
    </AppShell>
  )
}

function PrepView({ prep, ethics, forName, hadContext }: { prep: NegotiationPrep; ethics?: EthicsCheck | null; forName: string; hadContext: boolean }) {
  return (
    <div className="space-y-4">
      <StrategicRiskMeter ethics={ethics} />

      {prep.ethicalNote && (
        <Card className="shadow-none border-warn/40">
          <CardContent className="p-4 sm:p-5 bg-warn-soft">
            <div className="flex items-start gap-3">
              <ShieldAlert size={20} strokeWidth={1.75} className="text-warn mt-0.5 flex-shrink-0" aria-hidden="true" />
              <div>
                <div className="text-sm font-semibold text-warn">Un alto aquí</div>
                <p className="text-sm text-foreground/90 leading-relaxed mt-1">{prep.ethicalNote}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {prep.read && (
        <Card className="shadow-none">
          <CardContent className="p-4 sm:p-5">
            <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary font-sans mb-2">La lectura{forName ? ` · ${forName}` : ''}</div>
            {!hadContext && <p className="text-[11px] text-muted-foreground/80 mb-2">SIR tenía poco registro de esta persona — la preparación es más genérica.</p>}
            <p className="text-sm text-foreground/90 leading-relaxed">{prep.read}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field icon={<Scale size={14} strokeWidth={1.75} className="text-brand" />} label="Tu BATNA (tu mejor alternativa)" value={prep.yourBatna} accent />
        <Field icon={<ArrowRight size={14} strokeWidth={1.75} className="text-muted-foreground" />} label="Su probable piso/techo" value={prep.theirLikely} />
      </div>

      {prep.zopa && (
        <Card className="shadow-none">
          <CardContent className="p-4 sm:p-5">
            <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary font-sans mb-2">ZOPA · zona de acuerdo posible</div>
            <p className="text-sm text-foreground/90 leading-relaxed">{prep.zopa}</p>
          </CardContent>
        </Card>
      )}

      {prep.signals.length > 0 && (
        <Card className="shadow-none">
          <CardContent className="p-4 sm:p-5">
            <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary font-sans mb-3">Señales de sus límites</div>
            <ul className="space-y-3">
              {prep.signals.map((s, i) => (
                <li key={i} className="min-w-0">
                  <p className="text-sm text-foreground/90 leading-relaxed">{s.signal}</p>
                  {s.evidence && (
                    <p className="text-[12px] text-accent/90 leading-relaxed mt-1 border-l-2 border-accent/30 pl-2 flex items-start gap-1.5">
                      <Quote size={12} className="text-accent/60 mt-0.5 shrink-0" aria-hidden="true" />
                      <span><span className="text-text-tertiary text-[10px] uppercase tracking-[0.07em] mr-1.5">de su chat</span><span className="italic">&ldquo;{s.evidence}&rdquo;</span></span>
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {prep.anchor && (
        <Card className="shadow-none border-brand/30">
          <CardContent className="p-4 sm:p-5 bg-brand-soft">
            <div className="flex items-center gap-2 mb-2">
              <Anchor size={14} strokeWidth={1.75} className="text-brand" aria-hidden="true" />
              <span className="text-[11px] uppercase tracking-[0.07em] text-brand-soft-foreground font-sans">Con qué anclar</span>
            </div>
            <p className="text-sm text-foreground leading-relaxed">{prep.anchor}</p>
          </CardContent>
        </Card>
      )}

      {prep.moves.length > 0 && (
        <Card className="shadow-none">
          <CardContent className="p-4 sm:p-5">
            <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary font-sans mb-3">Movidas</div>
            <ul className="space-y-1.5">
              {prep.moves.map((m, i) => (
                <li key={i} className="text-sm text-foreground/90 flex items-start gap-2">
                  <ArrowRight size={15} strokeWidth={1.75} className="text-brand mt-0.5 flex-shrink-0" aria-hidden="true" />
                  {m}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {prep.walkAway && (
        <Card className="shadow-none">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-start gap-2.5">
              <DoorOpen size={15} strokeWidth={1.75} className="text-warn mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary font-sans mb-1">Tu punto de retirada</div>
                <p className="text-sm text-foreground/90 leading-relaxed">{prep.walkAway}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-[11px] text-muted-foreground/80 leading-relaxed px-1">
        {prep.watchout || 'Es una estimación para prepararte, no una certeza — la ZOPA real la confirmas en la mesa. Presión sí; coaccionar quema a quien vas a volver a necesitar.'}
      </p>
    </div>
  )
}

function Field({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  if (!value) return null
  return (
    <Card className={`shadow-none ${accent ? 'border-brand/30' : ''}`}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-2">
          {icon}
          <span className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary font-sans">{label}</span>
        </div>
        <p className="text-sm text-foreground/90 leading-relaxed">{value}</p>
      </CardContent>
    </Card>
  )
}
