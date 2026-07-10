'use client'
// SIR V2 — /captura/documento: subir un DOCUMENTO (PDF de informe/artículo/
// journal, o texto pegado) y convertirlo en memorias.
//
// El texto se extrae en el CLIENTE (pdfjs, lib/capture/pdf/pdfToText) — barato
// y sin mandar el PDF al server. Después: POST /api/ingest/document mode=preview
// estructura con Sonnet → pantalla de revisión/edición → mode=confirm guarda.
// Nunca guardado ciego. Honesto si el PDF es un scan sin texto.

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  FileText, ArrowLeft, Loader2, CheckCircle2, Upload, ClipboardPaste, Trash2, Users, X, Sparkles,
} from 'lucide-react'

import { AppShell } from '@/components/layout/AppShell'
import { RouteSkeleton } from '@/components/skeletons/RouteSkeleton'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ApiErrorNotice } from '@/components/ui/api-error-notice'
import { pdfFileToText } from '@/lib/capture/pdf/pdfToText'
import type { DocumentIngestPreview, DocMemoryProposal } from '@/lib/ingest/document/types'

interface ErrorState { status: number; message: string; detail?: string }

interface EditableMemory extends DocMemoryProposal { include: boolean }

interface PersonHit { id: string; name: string; slug?: string | null }

export default function DocumentoPage() {
  const hydrated = useHasHydrated()
  if (!hydrated) return <RouteSkeleton cards={1} />
  return <DocumentoContent />
}

function DocumentoContent() {
  const [source, setSource] = useState<'pdf' | 'texto'>('pdf')
  const [pastedText, setPastedText] = useState('')
  const [fileName, setFileName] = useState('')
  const [extractedText, setExtractedText] = useState('')
  const [extractMeta, setExtractMeta] = useState<{ pagesRead?: number; totalPages?: number }>({})
  const [extracting, setExtracting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const [analyzing, setAnalyzing] = useState(false)
  const [preview, setPreview] = useState<DocumentIngestPreview | null>(null)
  const [title, setTitle] = useState('')
  const [memories, setMemories] = useState<EditableMemory[]>([])
  const [error, setError] = useState<ErrorState | null>(null)

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<{ inserted: number; skipped: number } | null>(null)

  // Persona opcional
  const [personQuery, setPersonQuery] = useState('')
  const [personHits, setPersonHits] = useState<PersonHit[]>([])
  const [personId, setPersonId] = useState<string | null>(null)
  const [personName, setPersonName] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const resetPreview = useCallback(() => {
    setPreview(null); setMemories([]); setTitle(''); setSaved(null); setError(null)
  }, [])

  const onPickPdf = useCallback(async (file: File) => {
    resetPreview()
    setNotice(null)
    setFileName(file.name)
    setExtractedText('')
    setExtracting(true)
    try {
      const r = await pdfFileToText(file, { maxPages: 20 })
      if (r.error) { setNotice(`No pude leer el PDF: ${r.error}`); return }
      if (r.looksLikeScan || r.text.trim().length < 40) {
        setNotice(
          `El PDF parece un scan sin texto (${r.pagesRead} pág.). Para esos conviene subirlo como imagen desde Captura (Visión). Si tiene texto real, probá otro archivo.`,
        )
        return
      }
      setExtractedText(r.text)
      setExtractMeta({ pagesRead: r.pagesRead, totalPages: r.totalPages })
    } catch (e) {
      setNotice(`No pude leer el PDF: ${e instanceof Error ? e.message : 'error'}`)
    } finally {
      setExtracting(false)
    }
  }, [resetPreview])

  const analyze = useCallback(async () => {
    const text = source === 'pdf' ? extractedText : pastedText
    if (!text.trim()) return
    setAnalyzing(true); setError(null); setSaved(null)
    try {
      const res = await fetch('/api/ingest/document', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'preview',
          text,
          filename: source === 'pdf' ? fileName : 'texto pegado',
          pagesRead: extractMeta.pagesRead,
          totalPages: extractMeta.totalPages,
        }),
      })
      const j = await res.json()
      if (!res.ok) { setError({ status: res.status, message: j.error ?? 'No pude analizar', detail: j.detail }); return }
      const p = j as DocumentIngestPreview
      setPreview(p)
      setTitle(p.title)
      setMemories(p.memories.map((m) => ({ ...m, include: true })))
    } catch {
      setError({ status: 0, message: 'No pude analizar el documento' })
    } finally {
      setAnalyzing(false)
    }
  }, [source, extractedText, pastedText, fileName, extractMeta])

  const save = useCallback(async () => {
    if (!preview) return
    const included = memories.filter((m) => m.include && m.content.trim().length > 0)
    if (included.length === 0) return
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/ingest/document', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'confirm',
          docHash: preview.docHash,
          title: title.trim() || preview.title,
          person_id: personId,
          memories: included.map(({ include: _i, ...rest }) => rest),
        }),
      })
      const j = await res.json()
      if (!res.ok) { setError({ status: res.status, message: j.error ?? 'No pude guardar', detail: j.detail }); return }
      setSaved({ inserted: j.inserted ?? 0, skipped: j.skipped ?? 0 })
    } catch {
      setError({ status: 0, message: 'No pude guardar las memorias' })
    } finally {
      setSaving(false)
    }
  }, [preview, memories, title, personId])

  // Búsqueda de persona (opcional) — debounced.
  useEffect(() => {
    const q = personQuery.trim()
    if (q.length < 2 || personId) { setPersonHits([]); return }
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/people/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        if (!res.ok) return
        const j = await res.json()
        const hits = Array.isArray(j.candidates) ? j.candidates : []
        setPersonHits(hits.map((c: PersonHit) => ({ id: c.id, name: c.name, slug: c.slug })))
      } catch { /* abort/red */ }
    }, 250)
    return () => { ctrl.abort(); clearTimeout(t) }
  }, [personQuery, personId])

  const updateMemory = (idx: number, patch: Partial<EditableMemory>) => {
    setMemories((cur) => cur.map((m, i) => (i === idx ? { ...m, ...patch } : m)))
  }

  const canAnalyze = (source === 'pdf' ? extractedText.trim().length > 0 : pastedText.trim().length >= 40) && !analyzing
  const includedCount = memories.filter((m) => m.include && m.content.trim().length > 0).length

  return (
    <AppShell>
      <div className="mb-6">
        <Link href="/captura" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeft size={14} strokeWidth={1.75} /> Captura
        </Link>
        <div className="flex items-center gap-3">
          <FileText size={26} strokeWidth={1.5} className="text-muted-foreground" aria-hidden="true" />
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Subir un documento</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed max-w-2xl">
          Subí un PDF (un informe, un paper, una entrada de journal) o pegá su texto. SIR lo lee, lo
          resume y propone memorias — vos las revisás y editás antes de guardar. Nada se guarda solo.
        </p>
      </div>

      {/* ── Fuente ─────────────────────────────────────────────── */}
      <Card className="mb-4">
        <CardContent className="p-4 space-y-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setSource('pdf'); resetPreview() }}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${source === 'pdf' ? 'border-brand/50 bg-brand/10 text-brand' : 'border-border text-muted-foreground hover:text-foreground'}`}
            >
              <Upload size={13} strokeWidth={1.75} /> PDF
            </button>
            <button
              type="button"
              onClick={() => { setSource('texto'); resetPreview() }}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${source === 'texto' ? 'border-brand/50 bg-brand/10 text-brand' : 'border-border text-muted-foreground hover:text-foreground'}`}
            >
              <ClipboardPaste size={13} strokeWidth={1.75} /> Pegar texto
            </button>
          </div>

          {source === 'pdf' ? (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                aria-label="Elegir un PDF"
                accept="application/pdf,.pdf"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPickPdf(f); e.target.value = '' }}
                disabled={extracting}
                className="text-sm w-full file:mr-3 file:rounded file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-medium hover:file:bg-accent/10"
              />
              {extracting && (
                <div className="mt-2 text-xs text-muted-foreground flex items-center gap-2">
                  <Loader2 size={12} className="animate-spin" /> Extrayendo texto del PDF…
                </div>
              )}
              {extractedText && !extracting && (
                <div className="mt-2 text-xs text-muted-foreground">
                  <span className="text-foreground font-medium">{fileName}</span> · {extractMeta.pagesRead ?? '?'} de {extractMeta.totalPages ?? '?'} páginas · {extractedText.length.toLocaleString()} caracteres
                </div>
              )}
            </div>
          ) : (
            <textarea
              value={pastedText}
              onChange={(e) => { setPastedText(e.target.value); resetPreview() }}
              rows={10}
              placeholder="Pegá acá el texto del documento…"
              className="w-full resize-y rounded-md border border-border bg-background p-3 font-mono text-[12px] leading-relaxed"
            />
          )}

          {notice && (
            <div className="rounded-md border border-warn/30 bg-warn-soft/40 p-2.5 text-xs text-foreground">{notice}</div>
          )}

          <div className="flex items-center gap-3">
            <Button onClick={() => void analyze()} disabled={!canAnalyze}>
              {analyzing ? <Loader2 size={15} className="mr-2 animate-spin" /> : <Sparkles size={15} className="mr-2" />}
              Analizar documento
            </Button>
            {source === 'texto' && pastedText.trim().length > 0 && pastedText.trim().length < 40 && (
              <span className="text-xs text-muted-foreground">Pegá un poco más de texto (mín 40 caracteres).</span>
            )}
          </div>
        </CardContent>
      </Card>

      {error && <div className="mb-4"><ApiErrorNotice error={error} /></div>}

      {/* ── Preview / edición ──────────────────────────────────── */}
      {preview && !saved && (
        <Card className="mb-4">
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-[10px] font-mono uppercase tracking-wider">Propuesta</Badge>
              <Badge variant="secondary" className="text-[10px] font-mono">{preview.docKind}</Badge>
              <span className="text-[11px] text-muted-foreground">Revisá y editá antes de guardar</span>
            </div>

            <div>
              <label htmlFor="doc-title" className="text-xs text-muted-foreground">Título del documento</label>
              <input
                id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)}
                className="mt-1 text-sm w-full rounded border border-border bg-background px-3 py-1.5"
              />
            </div>

            {preview.summary && (
              <div className="rounded-md border border-border/60 bg-muted/20 p-3">
                <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary mb-1">Resumen</div>
                <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{preview.summary}</p>
              </div>
            )}

            {/* Persona opcional */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Users size={14} className="text-muted-foreground/70" />
                <span className="text-xs text-muted-foreground">Ligar a una persona (opcional)</span>
              </div>
              {personId ? (
                <div className="rounded-md border border-ok/30 bg-ok-soft p-2.5 text-xs flex items-center justify-between">
                  <span className="text-foreground font-medium">{personName}</span>
                  <button type="button" onClick={() => { setPersonId(null); setPersonName(null); setPersonQuery('') }} aria-label="Quitar persona" className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
                </div>
              ) : (
                <>
                  <input
                    value={personQuery} onChange={(e) => setPersonQuery(e.target.value)}
                    placeholder="Buscar por nombre…"
                    className="text-sm w-full rounded border border-border bg-background px-3 py-1.5"
                  />
                  {personHits.length > 0 && (
                    <ul className="mt-1.5 space-y-1 max-h-40 overflow-y-auto">
                      {personHits.map((h) => (
                        <li key={h.id}>
                          <button type="button" onClick={() => { setPersonId(h.id); setPersonName(h.name); setPersonHits([]) }} className="w-full text-left rounded border border-border hover:border-accent/50 px-3 py-1.5 text-xs">
                            {h.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>

            {/* Memorias */}
            <div className="space-y-3">
              <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">
                Memorias propuestas ({includedCount} de {memories.length} seleccionadas)
              </div>
              {memories.map((m, idx) => (
                <div key={idx} className={`rounded-md border p-3 space-y-2 ${m.include ? 'border-border' : 'border-border/40 opacity-50'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input type="checkbox" checked={m.include} onChange={(e) => updateMemory(idx, { include: e.target.checked })} />
                      <span className="text-muted-foreground">Incluir</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px] font-mono">{m.type}</Badge>
                      <label className="text-[10px] text-muted-foreground flex items-center gap-1">
                        imp.
                        <input
                          type="number" min={1} max={10} value={m.importance}
                          onChange={(e) => updateMemory(idx, { importance: Math.min(10, Math.max(1, Number(e.target.value) || 5)) })}
                          className="w-12 rounded border border-border bg-background px-1 py-0.5 text-xs"
                        />
                      </label>
                      <button type="button" onClick={() => updateMemory(idx, { include: false })} aria-label="Descartar" className="text-muted-foreground hover:text-bad"><Trash2 size={13} /></button>
                    </div>
                  </div>
                  <input
                    value={m.title} onChange={(e) => updateMemory(idx, { title: e.target.value })}
                    className="text-sm w-full rounded border border-border bg-background px-2 py-1 font-medium"
                    placeholder="Título"
                  />
                  <textarea
                    value={m.content} onChange={(e) => updateMemory(idx, { content: e.target.value })}
                    rows={2}
                    className="text-sm w-full resize-y rounded border border-border bg-background px-2 py-1 leading-relaxed"
                    placeholder="Contenido"
                  />
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3 pt-1">
              <Button onClick={() => void save()} disabled={saving || includedCount === 0}>
                {saving ? <Loader2 size={15} className="mr-2 animate-spin" /> : <CheckCircle2 size={15} className="mr-2" />}
                Guardar {includedCount} memoria{includedCount === 1 ? '' : 's'}
              </Button>
              {!preview.legible && (
                <span className="text-xs text-warn">El texto se leyó con dificultad — revisá bien antes de guardar.</span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Guardado ───────────────────────────────────────────── */}
      {saved && (
        <Card className="border-ok/30">
          <CardContent className="p-4 flex items-start gap-2">
            <CheckCircle2 size={16} strokeWidth={1.75} className="text-ok mt-0.5 flex-shrink-0" aria-hidden="true" />
            <div className="text-sm">
              <span className="font-medium text-foreground">{saved.inserted} memoria{saved.inserted === 1 ? '' : 's'}</span> guardada{saved.inserted === 1 ? '' : 's'} desde el documento.
              {saved.skipped > 0 && ` (${saved.skipped} ya existían — no se duplicaron.)`}
              {' '}Las vas a ver en el contexto de SIR y, si ligaste una persona, en su ficha.
            </div>
          </CardContent>
        </Card>
      )}
    </AppShell>
  )
}
