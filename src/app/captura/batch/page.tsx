'use client'

// SIR V2 — /captura/batch: pega un JSON generado por Claude.ai (o cualquier
// otra fuente que respete el formato de data/seed-batches/README.md), ve el
// plan, y aplica.
//
// Visión de Aaron (2026-07-01): "pasar PDFs a Claude.ai, extraer info según lo
// que conversé, obtener un JSON, pegarlo aquí — y que fluya". Sin CLI, sin
// service key, sin fricción.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { UploadCloud, ArrowLeft, CheckCircle2, AlertCircle, Info } from 'lucide-react'

import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { SeedPlan } from '@/lib/seed/plan'

interface ApiResponse {
  plan?: SeedPlan
  applied?: boolean
  stats?: { people: number; observations: number; orgs: number; links: number; skippedLinks?: number }
  error?: string
  detail?: string
}

export default function CapturaBatchPage() {
  const [json, setJson] = useState('')
  const [plan, setPlan] = useState<SeedPlan | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [applied, setApplied] = useState<ApiResponse['stats'] | null>(null)

  const parsedOk = useMemo(() => {
    if (!json.trim()) return false
    try { JSON.parse(json); return true } catch { return false }
  }, [json])

  async function submit(dry: boolean) {
    if (!parsedOk) { setError('El JSON no parsea. Revisá comillas o llaves.'); return }
    setBusy(true); setError(null); if (dry) setApplied(null)
    try {
      const parsed = JSON.parse(json)
      const res = await fetch('/api/seed/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch: parsed, dry }),
      })
      const j = (await res.json()) as ApiResponse
      if (!res.ok) {
        setError(j.error ?? 'Error')
        setPlan(null)
      } else {
        setPlan(j.plan ?? null)
        if (j.applied && j.stats) setApplied(j.stats)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AppShell>
      <div className="mb-6">
        <Link href="/captura" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeft size={14} strokeWidth={1.75} /> Captura
        </Link>
        <div className="flex items-center gap-3">
          <UploadCloud size={26} strokeWidth={1.5} className="text-muted-foreground" />
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Cargar batch (JSON)</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
          Pegá un JSON generado por Claude.ai (u otra fuente) con el formato de{' '}
          <code className="text-xs">data/seed-batches/README.md</code>. Ver el plan primero, después aplicar.
        </p>
      </div>

      <Card className="shadow-none mb-4">
        <CardContent className="p-4 sm:p-5">
          <textarea
            value={json}
            onChange={(e) => { setJson(e.target.value); setPlan(null); setApplied(null); setError(null) }}
            rows={14}
            placeholder='{"_meta": {…}, "people": [{"person": {"name": "…"}, …}], "person_links": [{"person_a": "…", "person_b": "SELF", …}]}'
            className="w-full resize-y rounded-lg border border-border bg-background p-3 font-mono text-[12px] leading-relaxed outline-none focus:border-foreground/30 min-h-[280px]"
          />
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => void submit(true)} disabled={!parsedOk || busy}>
              {busy ? 'Cargando…' : 'Ver plan (dry-run)'}
            </Button>
            <Button size="sm" onClick={() => void submit(false)} disabled={!plan || busy}>
              {busy ? 'Aplicando…' : 'Aplicar'}
            </Button>
            <span className="text-[11px] text-muted-foreground/70 ml-auto">
              {parsedOk ? 'JSON OK' : json.trim() ? 'JSON inválido' : 'Vacío'}
            </span>
          </div>
          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-bad/30 bg-bad-soft p-3">
              <AlertCircle size={14} strokeWidth={1.75} className="text-bad mt-0.5 flex-shrink-0" />
              <span className="text-xs text-bad leading-relaxed">{error}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {applied && (
        <Card className="shadow-none mb-4 border-ok/30">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-start gap-2">
              <CheckCircle2 size={16} strokeWidth={1.75} className="text-ok mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-sm font-medium text-foreground">Aplicado</div>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  {applied.people} persona{applied.people === 1 ? '' : 's'} · {applied.observations} observación{applied.observations === 1 ? '' : 'es'} · {applied.orgs} org profile{applied.orgs === 1 ? '' : 's'} · {applied.links} vínculo{applied.links === 1 ? '' : 's'}
                  {applied.skippedLinks && applied.skippedLinks > 0
                    ? ` (${applied.skippedLinks} sin metadata — 0107 aún no aplicada)` : ''}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {plan && !applied && <PlanView plan={plan} />}
    </AppShell>
  )
}

function PlanView({ plan }: { plan: SeedPlan }) {
  return (
    <div className="space-y-4">
      {plan.warnings.length > 0 && (
        <Card className="shadow-none border-warn/30">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-2">
              <Info size={14} strokeWidth={1.75} className="text-warn" />
              <span className="text-[10px] uppercase tracking-widest text-warn font-sans">Warnings</span>
            </div>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {plan.warnings.map((w, i) => (
                <li key={i} className="leading-relaxed">· {w}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-none">
        <CardContent className="p-4 sm:p-5">
          <div className="text-[10px] uppercase tracking-widest text-text-tertiary font-sans mb-3">
            Personas ({plan.people.length})
          </div>
          <ul className="space-y-2">
            {plan.people.map((p) => (
              <li key={p.id} className="flex items-start gap-2 py-2 border-b border-border/40 last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground">{p.name}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                    slug: <span className="font-mono text-foreground/80">{p.slug}</span> ·
                    {p.title ? ` ${p.title} ·` : ''}
                    {p.organization ? ` ${p.organization} ·` : ''}
                    {' '}importance {p.importance_score}/10
                  </div>
                  {p.notes && <p className="text-[11px] text-muted-foreground/70 mt-0.5 line-clamp-2">{p.notes}</p>}
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <Badge variant="outline" className="text-[9px]">{p.category}</Badge>
                  <Badge variant="outline" className="text-[9px]">{p.relationship}</Badge>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {plan.orgs.length > 0 && (
        <Card className="shadow-none">
          <CardContent className="p-4 sm:p-5">
            <div className="text-[10px] uppercase tracking-widest text-text-tertiary font-sans mb-3">
              Org profiles ({plan.orgs.length})
            </div>
            <ul className="space-y-2">
              {plan.orgs.map((o) => (
                <li key={o.id} className="flex items-center gap-2 py-1.5 border-b border-border/40 last:border-0">
                  <span className="text-sm text-foreground">{o.name}</span>
                  <span className="text-[11px] font-mono text-muted-foreground">({o.org_slug})</span>
                  {o.existing ? (
                    <Badge variant="outline" className="text-[9px] ml-auto border-warn/30 bg-warn-soft text-warn">YA EXISTE — SE REUSA</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[9px] ml-auto border-ok/30 bg-ok-soft text-ok">NUEVA</Badge>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-none">
        <CardContent className="p-4 sm:p-5">
          <div className="text-[10px] uppercase tracking-widest text-text-tertiary font-sans mb-3">
            Person links ({plan.links.length})
          </div>
          {plan.links.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin vínculos para crear.</p>
          ) : (
            <ul className="space-y-1.5">
              {plan.links.map((l) => (
                <li key={l.id} className="flex items-center gap-2 py-1 border-b border-border/40 last:border-0 text-xs text-muted-foreground">
                  <span className="font-mono text-foreground/80 truncate max-w-[6rem]">{l.person_a_id}</span>
                  <span className="text-muted-foreground/60">—[{l.kind}{l.weight != null ? `, w=${l.weight}` : ''}]→</span>
                  <span className="font-mono text-foreground/80 truncate max-w-[6rem]">{l.person_b_id}</span>
                  {l.context && <span className="text-[11px] text-muted-foreground/70 truncate ml-2">· {l.context}</span>}
                  {l.inferred && <Badge variant="outline" className="text-[9px] ml-auto">inferido</Badge>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardContent className="p-4 sm:p-5">
          <div className="text-[10px] uppercase tracking-widest text-text-tertiary font-sans mb-3">
            Observations ({plan.observations.length})
          </div>
          <p className="text-xs text-muted-foreground">
            {plan.observations.length} observación{plan.observations.length === 1 ? '' : 'es'} van a quedar ligadas a las personas creadas (LinkedIn/manual/etc).
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
