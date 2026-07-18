'use client'

// SIR V2 — /tacticas: Qué táctica usar (playbook de influencia #3).
//
// Aaron elige una persona + el tipo de conversación; SIR lee el estilo REAL de esa
// persona en sus chats y recomienda qué técnica con nombre (Voss/Cialdini/Harvard)
// le va, por qué (con la frase real que lo sostiene), una línea para probar y
// cuándo rebotaría. Es más quirúrgico y rápido que la Sala de ensayo.
// Llama a /api/influence/tactics (capable).

import { useMemo, useState } from 'react'
import { Swords, Loader2, Sparkles, Quote, AlertTriangle, ArrowRight, Ban } from 'lucide-react'

import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useRelationshipStore } from '@/stores'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { RouteSkeleton } from '@/components/skeletons/RouteSkeleton'
import { trackAiError } from '@/lib/analytics/track'
import {
  SCENARIOS, FRAMEWORK_LABEL, tacticById,
  type TacticRecommendation,
} from '@/lib/influence/tactics'
import type { EthicsCheck } from '@/engines/ethics'
import { StrategicRiskMeter } from '@/components/influence/StrategicRiskMeter'
import { ContactTimingBanner } from '@/components/relaciones/ContactTimingBanner'

export default function TacticasPage() {
  const hydrated = useHasHydrated()
  if (!hydrated) return <RouteSkeleton cards={2} />
  return <TacticasContent />
}

function TacticasContent() {
  const people = useRelationshipStore((s) => s.people)
  const sorted = useMemo(
    () => [...people].sort((a, b) => (b.importanceScore ?? 0) - (a.importanceScore ?? 0) || a.name.localeCompare(b.name)),
    [people],
  )

  const [personId, setPersonId] = useState('')
  const [scenario, setScenario] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [blocked, setBlocked] = useState<string | null>(null)
  const [rec, setRec] = useState<TacticRecommendation | null>(null)
  const [ethics, setEthics] = useState<EthicsCheck | null>(null)
  const [forName, setForName] = useState('')
  const [hadContext, setHadContext] = useState(true)

  async function run() {
    if (!personId || !scenario) return
    setBusy(true); setError(null); setBlocked(null); setRec(null); setEthics(null)
    try {
      const res = await fetch('/api/influence/tactics', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personId, scenario, note }),
      })
      const text = await res.text()
      let j: {
        recommendation?: TacticRecommendation; person?: { name: string; hadContext: boolean }
        ethics?: EthicsCheck; blocked?: boolean; message?: string; error?: string; detail?: string
      } = {}
      try { j = text ? JSON.parse(text) : {} } catch { /* no-JSON (timeout/gateway) */ }

      if (j.blocked) { setBlocked(j.message || 'Esto no pasa la prueba de fuego.'); setEthics(j.ethics ?? null); return }
      if (!res.ok || !j.recommendation) {
        trackAiError('tactics', { status: res.status, message: j.error, detail: j.detail })
        setError(
          j.error ? `${j.error}${j.detail ? ` — ${j.detail}` : ''}`
            : res.status === 504 || res.status === 502
              ? 'Tardó demasiado y el servidor cortó. Reinténtalo.'
              : `No pude recomendar tácticas (código ${res.status || '—'}). Reintenta.`,
        )
        return
      }
      setRec(j.recommendation); setEthics(j.ethics ?? null)
      setForName(j.person?.name ?? ''); setHadContext(j.person?.hadContext ?? true)
    } catch (e) {
      trackAiError('tactics', { status: 0, message: e instanceof Error ? e.message : String(e) })
      setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }

  return (
    <AppShell>
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <Swords size={26} strokeWidth={1.5} className="text-muted-foreground" />
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Qué táctica usar</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed max-w-2xl">
          Elige a quién y qué tipo de conversación. SIR lee el <span className="text-foreground/80">estilo real</span> de
          esa persona en sus chats y te dice qué técnica le va (Voss, Cialdini, Harvard) — con la frase que lo sostiene
          y una línea para probar. Solo la versión honesta; cuidar el vínculo es parte de la jugada.
        </p>
      </div>

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
            <label className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary font-sans block mb-1.5">Qué tipo de conversación</label>
            <Select value={scenario} onValueChange={setScenario}>
              <SelectTrigger><SelectValue placeholder="Elige el escenario…" /></SelectTrigger>
              <SelectContent>
                {SCENARIOS.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label htmlFor="nota" className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary font-sans block mb-1.5">Qué está pasando <span className="text-muted-foreground/50 normal-case tracking-normal">(opcional)</span></label>
            <textarea
              id="nota"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Ej: le pedí algo hace días y me deja en visto. / Quedamos en veremos y quiero retomarlo."
              className="w-full resize-y rounded-md border border-border bg-background p-3 text-sm leading-relaxed outline-none focus:border-foreground/30 min-h-[60px]"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => void run()} disabled={!personId || !scenario || busy}>
              {busy ? <><Loader2 size={14} className="mr-1.5 animate-spin" />Leyendo su estilo…</> : <><Sparkles size={14} strokeWidth={1.75} className="mr-1.5" />Recomiéndame</>}
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
              <Ban size={20} strokeWidth={1.75} className="text-warn mt-0.5 flex-shrink-0" aria-hidden="true" />
              <div>
                <div className="text-sm font-semibold text-warn">Un alto acá</div>
                <p className="text-sm text-foreground/90 leading-relaxed mt-1">{blocked}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {rec && <RecommendationView rec={rec} ethics={ethics} forName={forName} hadContext={hadContext} />}
    </AppShell>
  )
}

function RecommendationView({ rec, ethics, forName, hadContext }: { rec: TacticRecommendation; ethics?: EthicsCheck | null; forName: string; hadContext: boolean }) {
  return (
    <div className="space-y-4">
      <StrategicRiskMeter ethics={ethics} />

      {rec.style && (
        <Card className="shadow-none">
          <CardContent className="p-4 sm:p-5">
            <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary font-sans mb-2">Su estilo{forName ? ` · ${forName}` : ''}</div>
            {!hadContext && <p className="text-[11px] text-muted-foreground/80 mb-2">SIR tenía poco registro de esta persona — la lectura es más genérica. Con más chat suyo, más aterrizada.</p>}
            <p className="text-sm text-foreground/90 leading-relaxed">{rec.style}</p>
          </CardContent>
        </Card>
      )}

      {rec.picks.map((p, i) => {
        const t = tacticById(p.tacticId)
        if (!t) return null
        return (
          <Card key={i} className="shadow-none">
            <CardContent className="p-4 sm:p-5 space-y-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-foreground">{t.label}</span>
                <Badge variant="outline" className="text-[10px]">{FRAMEWORK_LABEL[t.framework]}</Badge>
              </div>
              <p className="text-[12.5px] text-muted-foreground leading-relaxed">{t.how}</p>

              <p className="text-sm text-foreground/90 leading-relaxed">
                <span className="text-text-tertiary text-[11px] uppercase tracking-[0.07em] mr-1.5">por qué a {forName || 'esta persona'}</span>{p.why}
              </p>

              {p.evidence && (
                <p className="text-[12px] text-accent/90 leading-relaxed border-l-2 border-accent/30 pl-2 flex items-start gap-1.5">
                  <Quote size={12} className="text-accent/60 mt-0.5 shrink-0" aria-hidden="true" />
                  <span><span className="text-text-tertiary text-[10px] uppercase tracking-[0.07em] mr-1.5">de su chat</span><span className="italic">&ldquo;{p.evidence}&rdquo;</span></span>
                </p>
              )}

              {p.line && (
                <div className="rounded-md border border-brand/30 bg-brand-soft p-2.5">
                  <span className="text-[10px] uppercase tracking-[0.07em] text-brand-soft-foreground block mb-0.5">Una línea para probar</span>
                  <p className="text-[14px] text-foreground leading-relaxed italic">&ldquo;{p.line}&rdquo;</p>
                </div>
              )}

              {p.caution && (
                <p className="text-[12px] text-muted-foreground leading-relaxed flex items-start gap-1.5">
                  <AlertTriangle size={12} className="text-warn mt-0.5 shrink-0" aria-hidden="true" />
                  <span><span className="text-text-tertiary text-[10px] uppercase tracking-[0.07em] mr-1.5">cuidado</span>{p.caution}</span>
                </p>
              )}
            </CardContent>
          </Card>
        )
      })}

      {rec.avoid && (
        <Card className="shadow-none border-bad/25">
          <CardContent className="p-4 sm:p-5">
            <p className="text-[13px] text-foreground/90 leading-relaxed flex items-start gap-2">
              <Ban size={15} strokeWidth={1.75} className="text-bad mt-0.5 shrink-0" aria-hidden="true" />
              <span><span className="text-text-tertiary text-[11px] uppercase tracking-[0.07em] mr-1.5">evita</span>{rec.avoid}</span>
            </p>
          </CardContent>
        </Card>
      )}

      <p className="text-[11px] text-muted-foreground/80 leading-relaxed px-1 flex items-start gap-2">
        <ArrowRight size={13} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden="true" />
        Una técnica es una forma de comunicarte mejor, no un truco. Si quieres jugar un objetivo completo (caminos, objeciones, opener), pásate a la Sala de ensayo.
      </p>
    </div>
  )
}
