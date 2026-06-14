'use client'
// SIR V2 — Intake inteligente: arrastrá VARIOS archivos de una persona (export
// de WhatsApp + captura de LinkedIn/Instagram) y SIR, en vez de pedirte el
// nombre, EXTRAE los datos, propone con IA quién es y qué tipo de relación, y te
// deja confirmar/editar antes de crear (o vincular a alguien existente) y
// adjuntar todo. Reusa el pipeline de export, el extractor de imagen y el
// matcher. No toca el panel de /captura.

import { useState } from 'react'
import Link from 'next/link'
import { Loader2, Upload, X, CheckCircle2, ArrowRight, UserPlus, Users, FileText } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ApiErrorNotice } from '@/components/ui/api-error-notice'

import { readExportText, interpretChunk, persistWhatsAppExport } from '@/lib/capture/whatsapp/export/client'
import { parseWhatsAppExport, isWhatsAppExport } from '@/lib/capture/whatsapp/export/parse'
import { chunkConversation } from '@/lib/capture/whatsapp/export/chunk'
import { consolidateInterpretations, buildExportObservationData } from '@/lib/capture/whatsapp/export/consolidate'
import type { ChunkInterpretation, ParsedExport } from '@/lib/capture/whatsapp/export/types'

import {
  HttpError,
  createPerson,
  searchPeople,
  previewCapture,
  processCapture,
  type PersonCandidate,
} from '@/lib/capture/observations/client'
import { detectCaptureType } from '@/lib/capture/detector/client'
import type { CaptureType, DetectorResult } from '@/lib/capture/observations/types'
import type { RelationshipType, PersonCategory } from '@/types'

type Phase = 'idle' | 'analyzing' | 'review' | 'importing' | 'done'

interface ErrorState {
  status: number
  message: string
  detail?: string
}

interface ImgItem {
  file: File
  captureType: CaptureType
  detectorData: DetectorResult
  extracted: Record<string, unknown>
}

interface Suggestion {
  name: string
  organization: string
  relationship: RelationshipType
  category: PersonCategory
  reason: string
}

const REL_OPTS: { v: RelationshipType; l: string }[] = [
  { v: 'professional', l: 'Profesional' },
  { v: 'friend', l: 'Amistad' },
  { v: 'family', l: 'Familia' },
  { v: 'romantic', l: 'Romántica' },
  { v: 'mentor', l: 'Mentor' },
  { v: 'mentee', l: 'Mentee' },
]
const CAT_OPTS: { v: PersonCategory; l: string }[] = [
  { v: 'inner_circle', l: 'Círculo íntimo' },
  { v: 'close', l: 'Cercano' },
  { v: 'network', l: 'Red' },
  { v: 'peripheral', l: 'Periférico' },
]

async function runPool<T>(items: T[], limit: number, worker: (item: T, i: number) => Promise<void>): Promise<void> {
  let next = 0
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      await worker(items[i], i)
    }
  })
  await Promise.all(lanes)
}

function isExportName(n: string): boolean {
  return /\.(zip|txt)$/i.test(n)
}

function cleanExportFileName(fileName: string): string {
  let n = (fileName ?? '').trim().replace(/\.(zip|txt)$/i, '')
  n = n.replace(/^whatsapp chat - /i, '').replace(/^chat de whatsapp con /i, '')
  n = n.replace(/-[0-9a-f]{6,}$/i, '')
  return n.trim()
}

function read(extracted: Record<string, unknown>, k: string): string | undefined {
  const v = extracted[k]
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined
}

export function IntakeInteligente() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<ErrorState | null>(null)
  const [files, setFiles] = useState<File[]>([])

  const [parsedWa, setParsedWa] = useState<ParsedExport | null>(null)
  const [waName, setWaName] = useState('')
  const [imgs, setImgs] = useState<ImgItem[]>([])

  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)
  const [name, setName] = useState('')
  const [relationship, setRelationship] = useState<RelationshipType>('professional')
  const [category, setCategory] = useState<PersonCategory>('network')

  const [candidates, setCandidates] = useState<PersonCandidate[]>([])
  const [selected, setSelected] = useState<{ id: string; name: string; slug: string | null } | null>(null)

  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [result, setResult] = useState<{ name: string; slug: string | null; messages: number; imgs: number } | null>(null)

  function reset() {
    setPhase('idle'); setError(null); setFiles([]); setParsedWa(null); setWaName(''); setImgs([])
    setSuggestion(null); setName(''); setRelationship('professional'); setCategory('network')
    setCandidates([]); setSelected(null); setProgress(null); setResult(null)
  }

  async function analyze() {
    if (files.length === 0 || phase === 'analyzing') return
    setPhase('analyzing'); setError(null)
    try {
      const exportFiles = files.filter((f) => isExportName(f.name))
      const imageFiles = files.filter((f) => f.type.startsWith('image/'))

      // 1) Imágenes → detectar + preview (sin persistir).
      const imgItems: ImgItem[] = []
      for (const f of imageFiles) {
        try {
          const det = await detectCaptureType(f)
          const pv = await previewCapture({ file: f, captureType: det.detected.type, detectorData: det.detected })
          imgItems.push({ file: f, captureType: det.detected.type, detectorData: det.detected, extracted: pv.extracted })
        } catch {
          /* imagen ilegible/no soportada: se omite del análisis */
        }
      }
      setImgs(imgItems)

      // 2) WhatsApp → parse.
      let parsed: ParsedExport | null = null
      let waFileName = ''
      if (exportFiles.length > 0) {
        const text = await readExportText(exportFiles[0])
        if (isWhatsAppExport(text)) {
          parsed = parseWhatsAppExport(text)
          waFileName = cleanExportFileName(exportFiles[0].name)
        }
      }
      setParsedWa(parsed)
      setWaName(waFileName)

      // 3) Señales → IA.
      const li = imgItems.find((it) => it.captureType === 'linkedin')
      const ig = imgItems.find((it) => it.captureType === 'instagram')
      const excerpt = parsed
        ? parsed.messages.slice(-25).map((m) => `${m.author}: ${m.content}`).join('\n').slice(0, 800)
        : undefined
      const signals = {
        linkedin: li
          ? { fullName: read(li.extracted, 'fullName'), headline: read(li.extracted, 'headline'), company: read(li.extracted, 'currentCompany') ?? read(li.extracted, 'company') }
          : undefined,
        instagram: ig ? { displayName: read(ig.extracted, 'displayName'), handle: read(ig.extracted, 'handle') } : undefined,
        whatsapp: parsed ? { name: waFileName, participants: parsed.participants, excerpt } : undefined,
      }

      const res = await fetch('/api/relaciones/intake-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signals }),
      })
      const data = (await res.json().catch(() => ({}))) as { suggestion?: Suggestion; error?: string; detail?: string }
      if (!res.ok || !data.suggestion) {
        // Fallback sin IA: nombre del LinkedIn o del archivo.
        const fallbackName = (li && read(li.extracted, 'fullName')) || waFileName || ''
        if (!fallbackName) {
          setError({ status: res.status, message: data.error ?? 'No se pudo identificar', detail: data.detail })
          setPhase('idle')
          return
        }
        setSuggestion({ name: fallbackName, organization: '', relationship: li ? 'professional' : 'friend', category: 'network', reason: 'Sin IA: inferido del archivo.' })
        setName(fallbackName); setRelationship(li ? 'professional' : 'friend'); setCategory('network')
      } else {
        setSuggestion(data.suggestion)
        setName(data.suggestion.name)
        setRelationship(data.suggestion.relationship)
        setCategory(data.suggestion.category)
      }

      // 4) Matcher sobre el nombre propuesto.
      const propName = (data.suggestion?.name) || (li && read(li.extracted, 'fullName')) || waFileName
      if (propName) {
        try {
          const sr = await searchPeople(propName, { captureType: 'whatsapp_chat' })
          setCandidates(sr.candidates)
        } catch {
          setCandidates([])
        }
      }
      setPhase('review')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError({ status: e instanceof HttpError ? e.status : 0, message: 'No se pudo analizar', detail: msg })
      setPhase('idle')
    }
  }

  async function confirm() {
    if (phase === 'importing') return
    const finalName = name.trim()
    if (!finalName && !selected) return
    setPhase('importing'); setError(null); setProgress(null)
    try {
      // Resolver persona.
      let personId: string
      let personName: string
      let slug: string | null
      if (selected) {
        personId = selected.id; personName = selected.name; slug = selected.slug
      } else {
        const c = await createPerson({ name: finalName, relationship, category })
        personId = c.person.id; personName = c.person.name; slug = c.person.slug
      }

      // WhatsApp → persistir.
      let messages = 0
      if (parsedWa) {
        const chunks = chunkConversation(parsedWa.messages)
        const interps: ChunkInterpretation[] = new Array(chunks.length)
        setProgress({ done: 0, total: chunks.length })
        let done = 0
        await runPool(chunks, 4, async (chunk, i) => {
          interps[i] = await interpretChunk({ chunkText: chunk.text, personName, index: i, total: chunks.length })
          done += 1
          setProgress({ done, total: chunks.length })
        })
        const consolidated = consolidateInterpretations(interps.filter(Boolean))
        const data = buildExportObservationData(parsedWa, consolidated, personName)
        await persistWhatsAppExport({ personId, data })
        messages = parsedWa.messages.length
      }

      // Imágenes → adjuntar.
      let imgOk = 0
      for (const it of imgs) {
        try {
          await processCapture({ file: it.file, captureType: it.captureType, detectorData: it.detectorData, personId })
          imgOk += 1
        } catch {
          /* una imagen falló: el resto sigue */
        }
      }

      setResult({ name: personName, slug, messages, imgs: imgOk })
      setPhase('done')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError({ status: e instanceof HttpError ? e.status : 0, message: 'No se pudo crear/importar', detail: msg })
      setPhase('review')
    }
  }

  // ─────────────── UI ───────────────
  if (phase === 'done' && result) {
    return (
      <Card className="shadow-none border-ok/30">
        <CardContent className="p-4 sm:p-6 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-ok" />
            <h2 className="text-sm font-semibold tracking-tight">Listo</h2>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="text-foreground font-medium">{result.name}</span> quedó{' '}
            {selected ? 'actualizado' : 'creado'}
            {result.messages > 0 && ` · ${result.messages} mensajes importados`}
            {result.imgs > 0 && ` · ${result.imgs} captura(s) adjunta(s)`}.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {result.slug && (
              <Button size="sm" asChild>
                <Link href={`/relaciones/${result.slug}`} className="inline-flex items-center gap-1.5">
                  Ver el perfil <ArrowRight size={14} />
                </Link>
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={reset}>Cargar otra persona</Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="shadow-none">
      <CardContent className="p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Upload size={16} strokeWidth={1.75} className="text-muted-foreground/70" />
          <h2 className="text-sm font-semibold tracking-tight">Intake inteligente</h2>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
          Arrastrá varios archivos de una misma persona — el export de WhatsApp (.zip/.txt) y su
          captura de LinkedIn/Instagram. SIR extrae los datos, te dice <span className="text-foreground">quién es</span> y
          propone el <span className="text-foreground">tipo de relación</span>. Confirmás y queda todo en su perfil.
        </p>

        {/* Archivos */}
        <div className="space-y-2">
          <input
            type="file"
            multiple
            accept=".zip,.txt,image/jpeg,image/png,image/webp"
            disabled={phase === 'analyzing' || phase === 'importing'}
            onChange={(e) => { setFiles(Array.from(e.target.files ?? [])); setSuggestion(null); setPhase('idle'); setError(null); setSelected(null) }}
            className="text-sm w-full file:mr-3 file:rounded file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-medium hover:file:bg-accent/10"
          />
          {files.length > 0 && (
            <ul className="text-[11px] text-muted-foreground font-mono space-y-0.5">
              {files.map((f, i) => (
                <li key={i} className="flex items-center gap-1.5">
                  <FileText size={11} /> {f.name} · {(f.size / 1024).toFixed(0)} KB
                </li>
              ))}
            </ul>
          )}
          {phase !== 'review' && phase !== 'importing' && (
            <Button size="sm" onClick={() => void analyze()} disabled={files.length === 0 || phase === 'analyzing'}>
              {phase === 'analyzing' ? (<><Loader2 size={14} className="mr-2 animate-spin" /> Analizando…</>) : 'Analizar y proponer'}
            </Button>
          )}
        </div>

        {error && <ApiErrorNotice error={error} />}

        {/* Revisión */}
        {phase === 'review' && suggestion && (
          <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
            <div className="flex items-center gap-2">
              <Users size={15} className="text-muted-foreground/70" />
              <h3 className="text-sm font-semibold tracking-tight">Propuesta de SIR</h3>
            </div>
            {suggestion.reason && <p className="text-[11px] text-muted-foreground italic">{suggestion.reason}</p>}

            <div className="space-y-2">
              <div>
                <label className="text-xs text-muted-foreground">Nombre</label>
                <input value={name} onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded border border-border bg-background px-3 py-1.5 text-sm" />
              </div>
              {suggestion.organization && (
                <div className="text-[11px] text-muted-foreground">
                  Empresa detectada: <span className="text-foreground">{suggestion.organization}</span>
                  {' '}<span className="opacity-70">(se completa al adjuntar el LinkedIn)</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">Relación</label>
                  <select value={relationship} onChange={(e) => setRelationship(e.target.value as RelationshipType)}
                    className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm">
                    {REL_OPTS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Categoría</label>
                  <select value={category} onChange={(e) => setCategory(e.target.value as PersonCategory)}
                    className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm">
                    {CAT_OPTS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Matcher: ¿ya existe? */}
            {candidates.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">¿Es alguno que ya tenés?</div>
                {candidates.map((c) => (
                  <button key={c.id} type="button"
                    onClick={() => setSelected(selected?.id === c.id ? null : { id: c.id, name: c.name, slug: c.slug })}
                    className={`w-full text-left rounded border px-3 py-2 text-xs flex items-center justify-between gap-3 ${selected?.id === c.id ? 'border-ok bg-ok-soft' : 'border-border hover:border-accent/50'}`}>
                    <span className="text-foreground">{c.name} <span className="font-mono text-[10px] text-muted-foreground">{c.slug ?? c.id}</span></span>
                    {selected?.id === c.id ? <CheckCircle2 size={14} className="text-ok" /> : <Badge variant="secondary" className="text-[10px] font-mono">{c.matchReason} {c.matchScore}</Badge>}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <Button onClick={() => void confirm()} disabled={!name.trim() && !selected}>
                {selected ? <Users size={15} className="mr-2" /> : <UserPlus size={15} className="mr-2" />}
                {selected ? `Vincular a ${selected.name}` : 'Crear y adjuntar todo'}
              </Button>
              <button type="button" onClick={reset} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                <X size={13} /> empezar de nuevo
              </button>
            </div>
          </div>
        )}

        {/* Progreso */}
        {phase === 'importing' && (
          <div className="rounded-md border border-border bg-muted/20 p-3 text-xs space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 size={14} className="animate-spin" />
              {progress ? `Interpretando la conversación… bloque ${progress.done} de ${progress.total}` : 'Guardando…'}
            </div>
            {progress && progress.total > 0 && (
              <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
                <div className="h-full bg-accent transition-all" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
