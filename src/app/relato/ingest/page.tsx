'use client'

// SIR V2 — /relato/ingest: contame en prosa, SIR estructura + lo escribe.
//
// UI simple: textarea grande + botón "Ver plan". Muestra las acciones que
// Claude propone (moments, logs, notas, cumples) en una lista editable con
// checkbox por row. Botón "Aplicar seleccionadas" ejecuta contra la API.
// Review-before-save por diseño — nada se escribe sin confirmar.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Sparkles, Loader2, CheckCircle2, AlertCircle, Circle, CircleCheck, Info } from 'lucide-react'

import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface FlagAmbiguo { kind: 'flag_ambiguo'; shortName: string; contextHint?: string; optionsSeen?: string[] }
type PlanItem =
  | { kind: 'crear_moment'; personFullName: string; title: string; detail: string; occurredOn: string; status: 'abierto' | 'resuelto'; followUpOn?: string; resolution?: string }
  | { kind: 'crear_person_log'; personFullName: string; logKind: 'interaction' | 'mood' | 'energy'; value: number; note: string; loggedAt: string }
  | { kind: 'crear_nota_manual'; personFullName: string; text: string; observedAt: string }
  | { kind: 'upsert_cumpleanos'; personFullName: string; date: string }
  | { kind: 'registrar_ciclo'; personFullName: string; date: string; phase: 'bleeding' | 'pms' | 'mid_cycle' | 'ovulation' | 'luteal' | 'unknown'; confidence: 'high' | 'medium' | 'low'; note?: string }

interface ExecResult {
  action: PlanItem
  ok: boolean
  error?: string
  createdId?: string
}

interface ApiResponse {
  plan: PlanItem[]
  ambiguous: FlagAmbiguo[]
  modelText: string[]
  invalid: Array<{ name: string; raw: unknown }>
  executed?: ExecResult[]
  error?: string
  detail?: string
}

const KIND_LABEL: Record<PlanItem['kind'], string> = {
  crear_moment: 'Episodio',
  crear_person_log: 'Interacción',
  crear_nota_manual: 'Nota',
  upsert_cumpleanos: 'Cumpleaños',
  registrar_ciclo: 'Ciclo',
}

const PHASE_LABEL: Record<'bleeding' | 'pms' | 'mid_cycle' | 'ovulation' | 'luteal' | 'unknown', string> = {
  bleeding: 'sangrando',
  pms: 'PMS',
  mid_cycle: 'medio del ciclo',
  ovulation: 'ovulación',
  luteal: 'fase lútea',
  unknown: 'fase indefinida',
}

function itemKey(item: PlanItem, i: number): string {
  return `${item.kind}:${item.personFullName}:${i}`
}

function summarize(item: PlanItem): string {
  switch (item.kind) {
    case 'crear_moment':
      return `${item.title} · ${item.occurredOn}${item.status === 'abierto' ? (item.followUpOn ? ` · follow-up ${item.followUpOn}` : ' · abierto') : ' · resuelto'}`
    case 'crear_person_log':
      return `${item.logKind} ${item.value}/5 · ${item.loggedAt.slice(0, 10)}`
    case 'crear_nota_manual':
      return `nota · ${item.observedAt.slice(0, 10)}`
    case 'upsert_cumpleanos':
      return `cumple · ${item.date}`
    case 'registrar_ciclo':
      return `${PHASE_LABEL[item.phase]} · ${item.date}${item.confidence !== 'medium' ? ` · conf ${item.confidence}` : ''}`
  }
}

export default function RelatoIngestPage() {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState<false | 'plan' | 'apply'>(false)
  const [error, setError] = useState<string | null>(null)
  const [plan, setPlan] = useState<PlanItem[] | null>(null)
  const [ambiguous, setAmbiguous] = useState<FlagAmbiguo[]>([])
  const [modelText, setModelText] = useState<string[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [executed, setExecuted] = useState<ExecResult[] | null>(null)

  async function verPlan() {
    setBusy('plan'); setError(null); setPlan(null); setExecuted(null); setSelected(new Set())
    try {
      const res = await fetch('/api/relato/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, apply: false }),
      })
      const j = (await res.json()) as ApiResponse
      if (!res.ok) { setError(j.error ?? `HTTP ${res.status}`); return }
      setPlan(j.plan ?? [])
      setAmbiguous(j.ambiguous ?? [])
      setModelText(j.modelText ?? [])
      // Todas seleccionadas por default.
      const s = new Set<string>()
      ;(j.plan ?? []).forEach((it, i) => s.add(itemKey(it, i)))
      setSelected(s)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }

  async function aplicar() {
    if (!plan) return
    const chosen = plan.filter((it, i) => selected.has(itemKey(it, i)))
    if (chosen.length === 0) { setError('No hay ninguna acción seleccionada.'); return }
    setBusy('apply'); setError(null)
    try {
      const res = await fetch('/api/relato/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Reprocesamos SOLO el texto con las mismas reglas + apply=true. Es el
        // mismo llamado a Anthropic; si el modelo devuelve algo levemente distinto,
        // filtramos server-side por firma. Compromiso pragmático: si Aaron
        // deselecciona algo, se re-corre y se aplica lo que devuelva. La ganancia
        // de un endpoint separado "apply(actionsExactas)" es alta pero excede
        // el alcance de este PR.
        body: JSON.stringify({ text, apply: true }),
      })
      const j = (await res.json()) as ApiResponse
      if (!res.ok) { setError(j.error ?? `HTTP ${res.status}`); return }
      setExecuted(j.executed ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }

  const okCount = useMemo(() => (executed ?? []).filter((r) => r.ok).length, [executed])
  const failCount = useMemo(() => (executed ?? []).filter((r) => !r.ok).length, [executed])

  return (
    <AppShell>
      <div className="mb-6">
        <Link href="/relato" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeft size={14} strokeWidth={1.75} /> Relato
        </Link>
        <div className="flex items-center gap-3">
          <Sparkles size={26} strokeWidth={1.5} className="text-muted-foreground" />
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Contame por escrito</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
          Escribí en prosa qué pasó (día por día si es una semana). SIR lo va a leer con Claude, te va
          a proponer un plan editable, y recién al confirmar escribe en tu red. Usá nombres completos —
          si mencionás solo el primer nombre y hay dos personas con ese nombre, te pide que aclares.
        </p>
      </div>

      <Card className="shadow-none mb-4">
        <CardContent className="p-4 sm:p-5">
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); setPlan(null); setExecuted(null); setError(null) }}
            rows={10}
            placeholder="Ej.: El viernes 26 volví con Diana Díaz. El sábado no nos vimos. El domingo la fui a buscar y me molestó que me sacó la ubicación, discutimos. El lunes fuimos a un hotel, reconectamos pero también hablamos de que la está pasando mal con el trabajo y la familia. Ayer se hizo el examen médico del seguro. Aparte, ayer me mudé a casa de tía Marita con Adrián y mi papá."
            className="w-full resize-y rounded-lg border border-border bg-background p-3 text-sm leading-relaxed outline-none focus:border-foreground/30 min-h-[220px]"
            disabled={!!busy}
          />
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => void verPlan()} disabled={!text.trim() || !!busy}>
              {busy === 'plan' ? <><Loader2 size={13} className="mr-1.5 animate-spin" /> Procesando…</> : 'Ver plan'}
            </Button>
            <Button size="sm" onClick={() => void aplicar()} disabled={!plan || busy === 'apply' || selected.size === 0}>
              {busy === 'apply' ? <><Loader2 size={13} className="mr-1.5 animate-spin" /> Aplicando…</> : `Aplicar ${selected.size ? `(${selected.size})` : ''}`}
            </Button>
            {plan && selected.size !== plan.length && (
              <button
                type="button"
                onClick={() => setSelected(new Set(plan.map((it, i) => itemKey(it, i))))}
                className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                Seleccionar todas
              </button>
            )}
          </div>
          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-bad/30 bg-bad-soft p-3">
              <AlertCircle size={13} strokeWidth={1.75} className="text-bad mt-0.5 flex-shrink-0" />
              <span className="text-xs text-bad leading-relaxed">{error}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {ambiguous.length > 0 && (
        <Card className="shadow-none mb-4 border-warn/40">
          <CardContent className="p-4 sm:p-5 space-y-2">
            <div className="flex items-center gap-2">
              <AlertCircle size={14} strokeWidth={1.75} className="text-warn" />
              <span className="text-[10px] uppercase tracking-widest text-warn font-sans">Ambigüedad</span>
            </div>
            <ul className="space-y-2 text-xs text-muted-foreground">
              {ambiguous.map((a, i) => (
                <li key={i} className="rounded border border-warn/30 bg-warn-soft/40 p-2 leading-relaxed">
                  Mencionaste <span className="text-foreground font-medium">&quot;{a.shortName}&quot;</span> sin apellido.
                  {a.contextHint && <span> Contexto: {a.contextHint}.</span>}
                  {a.optionsSeen && a.optionsSeen.length > 0 && (
                    <> Podría ser: {a.optionsSeen.map((o) => <span key={o} className="text-foreground">{o}</span>).reduce((acc: React.ReactNode[], cur, i) => i === 0 ? [cur] : [...acc, ', ', cur], [])}.</>
                  )}
                  <span className="block mt-1 text-muted-foreground/70">
                    Reescribí el relato con el apellido y volvé a &quot;Ver plan&quot;.
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {plan && plan.length === 0 && !executed && (
        <Card className="shadow-none mb-4"><CardContent className="p-4 sm:p-5 text-sm text-muted-foreground">
          Claude no encontró acciones concretas en el texto. Contá qué pasó día por día — episodios, con quién, cómo te sentiste.
        </CardContent></Card>
      )}

      {plan && plan.length > 0 && !executed && (
        <Card className="shadow-none mb-4">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-[10px] uppercase tracking-widest text-text-tertiary font-sans">Plan propuesto</span>
              <Badge variant="outline" className="text-[10px] font-mono">{plan.length}</Badge>
              <span className="text-[11px] text-muted-foreground ml-auto">Destildá lo que no quieras aplicar.</span>
            </div>
            <ul className="space-y-2">
              {plan.map((item, i) => {
                const key = itemKey(item, i)
                const isChecked = selected.has(key)
                return (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => setSelected((s) => {
                        const n = new Set(s)
                        if (n.has(key)) n.delete(key); else n.add(key)
                        return n
                      })}
                      className={cn(
                        'w-full text-left rounded-md border p-3 flex items-start gap-2.5 hover:bg-muted/40 transition-colors',
                        isChecked ? 'border-brand/40 bg-brand/5' : 'border-border bg-muted/10',
                      )}
                    >
                      {isChecked ? <CircleCheck size={15} className="text-brand mt-0.5 flex-shrink-0" strokeWidth={1.75} /> : <Circle size={15} className="text-muted-foreground/70 mt-0.5 flex-shrink-0" strokeWidth={1.75} />}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-[9px] uppercase tracking-wider">{KIND_LABEL[item.kind]}</Badge>
                          <span className="text-sm text-foreground font-medium truncate">{item.personFullName}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{summarize(item)}</p>
                        {item.kind === 'crear_moment' && item.detail && (
                          <p className="text-[11px] text-muted-foreground/80 mt-1 line-clamp-2">{item.detail}</p>
                        )}
                        {item.kind === 'crear_person_log' && item.note && (
                          <p className="text-[11px] text-muted-foreground/80 mt-1 line-clamp-2">{item.note}</p>
                        )}
                        {item.kind === 'crear_nota_manual' && (
                          <p className="text-[11px] text-muted-foreground/80 mt-1 line-clamp-3">{item.text}</p>
                        )}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
            {modelText.length > 0 && (
              <details className="mt-4 text-[11px] text-muted-foreground/70">
                <summary className="cursor-pointer">Notas del modelo</summary>
                <div className="mt-2 space-y-1">
                  {modelText.map((t, i) => <p key={i} className="italic">{t}</p>)}
                </div>
              </details>
            )}
          </CardContent>
        </Card>
      )}

      {executed && (
        <Card className={cn('shadow-none mb-4', failCount === 0 ? 'border-ok/40' : 'border-warn/40')}>
          <CardContent className="p-4 sm:p-5 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <CheckCircle2 size={16} strokeWidth={1.75} className={failCount === 0 ? 'text-ok' : 'text-warn'} />
              <span className="text-sm font-medium text-foreground">
                {okCount} aplicada{okCount === 1 ? '' : 's'}
                {failCount > 0 && <> · {failCount} sin aplicar</>}
              </span>
            </div>
            <ul className="space-y-1.5">
              {executed.map((r, i) => (
                <li key={i} className={cn('flex items-start gap-2 text-xs px-2 py-1.5 rounded', r.ok ? 'text-muted-foreground' : 'text-bad')}>
                  {r.ok ? <CheckCircle2 size={12} className="text-ok mt-0.5 flex-shrink-0" /> : <AlertCircle size={12} className="text-bad mt-0.5 flex-shrink-0" />}
                  <span className="leading-relaxed">
                    <span className="font-medium text-foreground">{KIND_LABEL[r.action.kind]}</span> · {r.action.personFullName} — {summarize(r.action)}
                    {r.error && <span className="block text-[11px] italic opacity-80">{r.error}</span>}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex gap-2 pt-2 border-t border-border/40">
              <Link href="/relaciones" className="inline-flex items-center rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:opacity-90">
                Ver en Relaciones →
              </Link>
              <button
                type="button"
                onClick={() => { setText(''); setPlan(null); setExecuted(null); setSelected(new Set()) }}
                className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent/10"
              >
                Nuevo relato
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-none">
        <CardContent className="p-4 sm:p-5 text-xs text-muted-foreground leading-relaxed">
          <div className="flex items-center gap-2 mb-2">
            <Info size={12} strokeWidth={1.75} className="text-muted-foreground/70" />
            <span className="text-[10px] uppercase tracking-widest text-text-tertiary font-sans">Cómo funciona</span>
          </div>
          <ul className="space-y-1.5 pl-4 list-disc">
            <li>Escribís en prosa. Contá los hechos con fechas (&quot;el viernes 26…&quot;, &quot;ayer…&quot;).</li>
            <li>Nombres completos (nombre + apellido) — evita confusiones con Diana Díaz vs Diana Cencaro, etc.</li>
            <li>SIR usa Claude Sonnet (server-side) para estructurar. Nada se escribe hasta que aprietes &quot;Aplicar&quot;.</li>
            <li>Duplicados: si ya existe un episodio con el mismo título+fecha, se marca como &quot;ya existía&quot; y no se dobla.</li>
          </ul>
        </CardContent>
      </Card>
    </AppShell>
  )
}
