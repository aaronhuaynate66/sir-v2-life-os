'use client'

// SIR V2 — /captura/batch: pega un JSON generado por Claude.ai (o cualquier
// otra fuente que respete el formato de data/seed-batches/README.md), ve el
// plan, y aplica.
//
// Visión de Aaron (2026-07-01): "pasar PDFs a Claude.ai, extraer info según lo
// que conversé, obtener un JSON, pegarlo aquí — y que fluya". Sin CLI, sin
// service key, sin fricción.
//
// UX rediseñada (2026-07-02): drag-drop de .json, botón "Pegar del portapapeles"
// y "Subir .json" para no depender del copy-paste manual del archivo. Aaron:
// "necesitamos meterle más UX y UI, se hizo muy tedioso".

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { UploadCloud, ArrowLeft, CheckCircle2, AlertCircle, Info, ClipboardPaste, FileJson, Sparkles, Wand2 } from 'lucide-react'

import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { SeedPlan } from '@/lib/seed/plan'

interface ApiResponse {
  plan?: SeedPlan
  applied?: boolean
  stats?: { people: number; observations: number; orgs: number; links: number; skippedLinks?: number }
  error?: string
  detail?: string
}

interface ExtractResponse {
  batch?: unknown
  error?: string
  detail?: string
}

/** Validación mínima de shape client-side. Evita ir al server con basura y
 *  falla más rápido con mensaje humano. La validación pesada (enums, org
 *  slugs, tipos) sigue viviendo en /api/seed/batch. */
function preflightShape(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return 'El JSON debe ser un objeto con `_meta` y `people`.'
  const p = parsed as Record<string, unknown>
  if (!('people' in p) || !Array.isArray(p.people)) return 'Falta la lista `people` (array).'
  if ((p.people as unknown[]).length === 0) return '`people` no puede estar vacío.'
  for (let i = 0; i < (p.people as unknown[]).length; i++) {
    const item = (p.people as unknown[])[i] as Record<string, unknown> | undefined
    if (!item || typeof item !== 'object') return `people[${i}] no es un objeto.`
    const person = (item.person ?? item) as Record<string, unknown> | undefined
    if (!person || typeof person !== 'object') return `people[${i}] no tiene .person`
    const name = person.name
    if (typeof name !== 'string' || !name.trim()) return `people[${i}].person.name está vacío.`
  }
  return null
}

export default function CapturaBatchPage() {
  const [json, setJson] = useState('')
  const [plan, setPlan] = useState<SeedPlan | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [applied, setApplied] = useState<ApiResponse['stats'] | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // C1 — extracción integrada: pegar texto crudo (relato/PDF/perfil) y que SIR
  // arme el JSON, sin ir a Claude.ai. El resultado cae en el textarea de abajo
  // para revisar + dry-run + aplicar con el flujo de siempre.
  const [rawText, setRawText] = useState('')
  const [extracting, setExtracting] = useState(false)

  const parsedOk = useMemo(() => {
    if (!json.trim()) return false
    try { JSON.parse(json); return true } catch { return false }
  }, [json])

  const shapeError = useMemo(() => {
    if (!parsedOk) return null
    try { return preflightShape(JSON.parse(json)) } catch { return null }
  }, [json, parsedOk])

  function setJsonFromSource(text: string) {
    setJson(text)
    setPlan(null); setApplied(null); setError(null)
  }

  async function pasteFromClipboard() {
    try {
      const t = await navigator.clipboard.readText()
      if (!t.trim()) { setError('El portapapeles está vacío.'); return }
      setJsonFromSource(t)
    } catch (e) {
      setError(`No pude leer el portapapeles: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  function onFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.json') && file.type !== 'application/json') {
      setError('Solo archivos .json.'); return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const t = typeof reader.result === 'string' ? reader.result : ''
      if (!t.trim()) { setError('El archivo está vacío.'); return }
      setJsonFromSource(t)
    }
    reader.onerror = () => setError('No pude leer el archivo.')
    reader.readAsText(file)
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) onFile(file)
  }

  async function extractFromText() {
    if (!rawText.trim()) { setError('Pegá el texto a extraer.'); return }
    setExtracting(true); setError(null)
    try {
      const res = await fetch('/api/seed/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: rawText }),
      })
      const j = (await res.json()) as ExtractResponse
      if (!res.ok || !j.batch) {
        setError(j.error ? `${j.error}${j.detail ? ` — ${j.detail}` : ''}` : 'No pude extraer el JSON.')
        return
      }
      // Cargar el JSON extraído en el textarea (indentado, legible) para revisar.
      setJsonFromSource(JSON.stringify(j.batch, null, 2))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setExtracting(false)
    }
  }

  async function submit(dry: boolean) {
    if (!parsedOk) { setError('El JSON no parsea. Revisá comillas o llaves.'); return }
    if (shapeError) { setError(shapeError); return }
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
          Pegá texto crudo y <span className="text-foreground/80">SIR arma el JSON</span>, o cargá un{' '}
          <code className="text-xs">.json</code> ya hecho. Siempre ves el plan antes de aplicar.
        </p>
      </div>

      {/* C1 — extracción integrada: relato/PDF/perfil → JSON, sin ir a Claude.ai. */}
      <Card className="shadow-none mb-4 border-brand/30">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={14} strokeWidth={1.75} className="text-brand" aria-hidden="true" />
            <h2 className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary font-sans">Desde texto (extraer con SIR)</h2>
          </div>
          <p className="text-[11px] text-muted-foreground mb-3 leading-relaxed">
            Pegá un relato, el texto de un PDF/CV o un perfil de LinkedIn. SIR extrae las personas
            y arma el JSON abajo para que lo revises y apliques.
          </p>
          <label htmlFor="raw-text" className="sr-only">Texto a extraer</label>
          <textarea
            id="raw-text"
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={6}
            placeholder="Ej: 'Conocí a Ana Torres en el evento de HNG, es Data Lead en Falabella, muy energizante, me la presentó Cristina…'"
            className="w-full resize-y rounded-lg border border-border bg-background p-3 text-[13px] leading-relaxed outline-none focus:border-foreground/30 min-h-[120px]"
          />
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <Button size="sm" onClick={() => void extractFromText()} disabled={!rawText.trim() || extracting}>
              <Wand2 size={13} strokeWidth={1.75} className="mr-1.5" />
              {extracting ? 'Extrayendo…' : 'Extraer con SIR'}
            </Button>
            {rawText && (
              <button
                type="button"
                onClick={() => setRawText('')}
                className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                Limpiar texto
              </button>
            )}
            <span className="text-[11px] text-muted-foreground/70 ml-auto">Revisás el JSON antes de aplicar</span>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-none mb-4">
        <CardContent className="p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => void pasteFromClipboard()} disabled={busy}>
              <ClipboardPaste size={13} strokeWidth={1.75} className="mr-1.5" />
              Pegar del portapapeles
            </Button>
            <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={busy}>
              <FileJson size={13} strokeWidth={1.75} className="mr-1.5" />
              Subir .json
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }}
            />
            {json && (
              <button
                type="button"
                onClick={() => setJsonFromSource('')}
                className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 ml-auto"
              >
                Limpiar
              </button>
            )}
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              'rounded-lg border transition-colors relative',
              dragging ? 'border-brand/60 bg-brand/5' : 'border-border',
            )}
          >
            <textarea
              value={json}
              onChange={(e) => setJsonFromSource(e.target.value)}
              rows={14}
              placeholder='{"_meta": {…}, "people": [{"person": {"name": "…"}, …}], "person_links": [{"person_a": "…", "person_b": "SELF", …}]}'
              className="w-full resize-y rounded-lg bg-background p-3 font-mono text-[12px] leading-relaxed outline-none focus:border-foreground/30 min-h-[280px]"
            />
            {dragging && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-brand/5 border-2 border-dashed border-brand/60">
                <span className="text-xs text-brand font-medium">Soltá el archivo aquí</span>
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => void submit(true)} disabled={!parsedOk || !!shapeError || busy}>
              {busy ? 'Cargando…' : 'Ver plan (dry-run)'}
            </Button>
            <Button size="sm" onClick={() => void submit(false)} disabled={!plan || busy}>
              {busy ? 'Aplicando…' : 'Aplicar'}
            </Button>
            <span className={cn(
              'text-[11px] ml-auto',
              parsedOk && !shapeError ? 'text-ok' : json.trim() ? 'text-warn' : 'text-muted-foreground/70',
            )}>
              {parsedOk
                ? shapeError ? 'Shape inválido' : 'JSON OK'
                : json.trim() ? 'JSON inválido' : 'Vacío'}
            </span>
          </div>
          {(error || shapeError) && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-bad/30 bg-bad-soft p-3">
              <AlertCircle size={14} strokeWidth={1.75} className="text-bad mt-0.5 flex-shrink-0" />
              <span className="text-xs text-bad leading-relaxed">{error ?? shapeError}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {applied && (
        <Card className="shadow-none mb-4 border-ok/30">
          <CardContent className="p-4 sm:p-5 space-y-3">
            <div className="flex items-start gap-2">
              <CheckCircle2 size={16} strokeWidth={1.75} className="text-ok mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-sm font-medium text-foreground">Aplicado</div>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  {applied.people} persona{applied.people === 1 ? '' : 's'} · {applied.observations} observación{applied.observations === 1 ? '' : 'es'} · {applied.orgs} org profile{applied.orgs === 1 ? '' : 's'} · {applied.links} vínculo{applied.links === 1 ? '' : 's'}
                  {applied.skippedLinks && applied.skippedLinks > 0
                    ? ` (${applied.skippedLinks} sin metadata — 0107 aún no aplicada)` : ''}
                </p>
                <p className="mt-2 text-[11px] text-muted-foreground/70 leading-relaxed">
                  Realtime sincroniza el store local en 1-2s. Si no aparece, tocá &quot;Refrescar&quot;.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Link
                href="/relaciones"
                className="inline-flex items-center rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:opacity-90"
              >
                Ver en /relaciones →
              </Link>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent/10"
              >
                Refrescar
              </button>
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
