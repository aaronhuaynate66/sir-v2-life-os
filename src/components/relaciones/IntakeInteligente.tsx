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

import { readExportText, interpretChunk, persistWhatsAppExport, getLastImportedISO, archiveConversation } from '@/lib/capture/whatsapp/export/client'
import { trackCreated, EVENTS } from '@/lib/analytics/track'
import { parseWhatsAppExport, isWhatsAppExport } from '@/lib/capture/whatsapp/export/parse'
import { chunkConversation } from '@/lib/capture/whatsapp/export/chunk'
import { consolidateInterpretations, buildExportObservationData } from '@/lib/capture/whatsapp/export/consolidate'
import { sliceParsedSince } from '@/lib/capture/whatsapp/export/incremental'
import type { ChunkInterpretation, ParsedExport } from '@/lib/capture/whatsapp/export/types'

import {
  HttpError,
  createPerson,
  searchPeople,
  previewCapture,
  processCapture,
  previewCaptureFromText,
  processCaptureFromText,
  type PersonCandidate,
} from '@/lib/capture/observations/client'
import { detectCaptureType } from '@/lib/capture/detector/client'
import { detectorResultFromText } from '@/lib/capture/text/detectFromText'
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

const LINKABLE_TYPES = ['linkedin', 'instagram', 'whatsapp_chat', 'whatsapp_web', 'whatsapp_info']

/** Mensaje de error legible para cualquier throw (Error, ApiError {message}, u objeto). */
function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    return (e as { message: string }).message
  }
  try { return JSON.stringify(e) } catch { return String(e) }
}

/** Interpreta un bloque con reintentos (transitorios/rate-limit). Devuelve null
 *  si tras los reintentos sigue fallando — el import NO se aborta por un bloque. */
async function interpretChunkResilient(
  input: Parameters<typeof interpretChunk>[0],
  retries = 2,
): Promise<ChunkInterpretation | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await interpretChunk(input)
    } catch {
      if (attempt === retries) return null
      await new Promise((r) => setTimeout(r, 700 * (attempt + 1)))
    }
  }
  return null
}

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

/** Agrupa archivos por PERSONA: cada export de WhatsApp por su contacto (nombre
 *  del archivo); cada imagen suelta en su propio grupo. Así subir 5 chats de 5
 *  personas distintas produce 5 grupos en vez de fusionarse en uno. */
function groupFilesByPerson(files: File[]): File[][] {
  const groups = new Map<string, File[]>()
  for (const f of files) {
    const key = isExportName(f.name) ? `wa:${cleanExportFileName(f.name).toLowerCase()}` : `img:${f.name.toLowerCase()}`
    const arr = groups.get(key) ?? []
    arr.push(f)
    groups.set(key, arr)
  }
  return [...groups.values()]
}

export function IntakeInteligente() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<ErrorState | null>(null)
  const [files, setFiles] = useState<File[]>([])
  // Cola multi-persona: si subís archivos de varias personas, se procesan de a una.
  const [queue, setQueue] = useState<File[][]>([])
  const [queueIdx, setQueueIdx] = useState(0)

  const [waChats, setWaChats] = useState<{ parsed: ParsedExport; name: string; raw: string }[]>([])
  const [imgs, setImgs] = useState<ImgItem[]>([])
  const [imgDiag, setImgDiag] = useState<{ name: string; type: string; detail: string }[]>([])
  const [profileText, setProfileText] = useState('')
  const [profileCap, setProfileCap] = useState<{ text: string; captureType: CaptureType; detectorData: DetectorResult; extracted: Record<string, unknown> } | null>(null)

  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)
  const [name, setName] = useState('')
  const [relationship, setRelationship] = useState<RelationshipType>('professional')
  const [category, setCategory] = useState<PersonCategory>('network')

  const [candidates, setCandidates] = useState<PersonCandidate[]>([])
  const [selected, setSelected] = useState<{ id: string; name: string; slug: string | null } | null>(null)

  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [result, setResult] = useState<{ name: string; slug: string | null; messages: number; imgs: number; profile: boolean } | null>(null)

  function reset() {
    setPhase('idle'); setError(null); setFiles([]); setWaChats([]); setImgs([]); setImgDiag([]); setProfileText(''); setProfileCap(null)
    setSuggestion(null); setName(''); setRelationship('professional'); setCategory('network')
    setCandidates([]); setSelected(null); setProgress(null); setResult(null)
    setQueue([]); setQueueIdx(0)
  }

  async function analyze() {
    if ((files.length === 0 && !profileText.trim()) || phase === 'analyzing') return
    setPhase('analyzing'); setError(null); setImgDiag([])
    try {
      const exportFiles = files.filter((f) => isExportName(f.name))
      const imageFiles = files.filter((f) => f.type.startsWith('image/'))

      // 1) Imágenes → detectar + preview (best-effort, no bloquea).
      const imgItems: ImgItem[] = []
      const diag: { name: string; type: string; detail: string }[] = []
      for (const f of imageFiles) {
        try {
          const det = await detectCaptureType(f)
          let extracted: Record<string, unknown> = {}
          try {
            const pv = await previewCapture({ file: f, captureType: det.detected.type, detectorData: det.detected })
            extracted = pv.extracted
          } catch {
            /* el extractor no pudo leerla (ej. captura de página completa); guardamos igual el detect */
          }
          const nm =
            read(extracted, 'fullName') || read(extracted, 'displayName') || read(extracted, 'handle') ||
            (det.detected.suggestedPersonName ?? '')
          imgItems.push({ file: f, captureType: det.detected.type, detectorData: det.detected, extracted })
          diag.push({ name: f.name, type: det.detected.type, detail: nm ? `→ ${nm}` : 'sin nombre legible' })
        } catch {
          diag.push({ name: f.name, type: 'no detectada', detail: 'no se pudo leer la imagen' })
        }
      }
      setImgs(imgItems); setImgDiag(diag)

      // 2) WhatsApp → parse TODOS los exports (una persona puede tener varios
      //    chats: teléfono personal + corporativo). Se cruzan después.
      const chats: { parsed: ParsedExport; name: string; raw: string }[] = []
      for (const f of exportFiles) {
        try {
          const text = await readExportText(f)
          if (isWhatsAppExport(text)) {
            chats.push({ parsed: parseWhatsAppExport(text), name: cleanExportFileName(f.name), raw: text })
            diag.push({ name: f.name, type: 'whatsapp', detail: '→ chat leído' })
          } else {
            diag.push({ name: f.name, type: 'archivo', detail: 'no parece export de WhatsApp' })
          }
        } catch {
          diag.push({ name: f.name, type: 'archivo', detail: 'no se pudo leer' })
        }
      }
      setWaChats(chats)
      setImgDiag([...diag])
      // Nombre más limpio entre los archivos de chat (sin sufijos tipo "Hv").
      const waFileName = chats.map((c) => c.name).sort((a, b) => a.length - b.length)[0] ?? '' 

      // 3) Señales → IA (lenientes: usamos el nombre de cualquier imagen aunque
      //    el detector la haya clasificado distinto).
      const li = imgItems.find((it) => it.captureType === 'linkedin') ?? imgItems.find((it) => !!read(it.extracted, 'fullName'))
      const ig = imgItems.find((it) => it.captureType === 'instagram')
      const anyName =
        imgItems
          .map((it) => read(it.extracted, 'fullName') || read(it.extracted, 'displayName') || read(it.extracted, 'handle') || (it.detectorData.suggestedPersonName ?? ''))
          .find((x) => !!x) || ''
      // 2b) Perfil pegado como TEXTO (LinkedIn/Instagram) → extraer sin persistir.
      let prof: { text: string; captureType: CaptureType; detectorData: DetectorResult; extracted: Record<string, unknown> } | null = null
      if (profileText.trim().length >= 20) {
        try {
          const det = detectorResultFromText(profileText)
          const pv = await previewCaptureFromText({ text: profileText, captureType: det.type, detectorData: det })
          prof = { text: profileText, captureType: det.type, detectorData: det, extracted: pv.extracted }
          const nm = read(pv.extracted, 'fullName') || read(pv.extracted, 'displayName') || read(pv.extracted, 'handle') || ''
          diag.push({ name: 'perfil pegado', type: det.type, detail: nm ? `→ ${nm}` : 'leído' })
          setImgDiag([...diag])
        } catch {
          diag.push({ name: 'perfil pegado', type: 'texto', detail: 'no se pudo leer' })
          setImgDiag([...diag])
        }
      }
      setProfileCap(prof)

      const allParticipants = Array.from(new Set(chats.flatMap((c) => c.parsed.participants)))
      // Excerpt del chat más reciente (mayor lastISO).
      const recentChat = chats.slice().sort((a, b) => (b.parsed.lastISO ?? '').localeCompare(a.parsed.lastISO ?? ''))[0]
      const excerpt = recentChat
        ? recentChat.parsed.messages.slice(-25).map((m) => `${m.author}: ${m.content}`).join('\n').slice(0, 800)
        : undefined
      // El perfil pegado alimenta la señal del tipo que sea (li/ig) si no hubo imagen.
      const liExtracted = li?.extracted ?? (prof?.captureType === 'linkedin' ? prof.extracted : undefined)
      const igExtracted = ig?.extracted ?? (prof?.captureType === 'instagram' ? prof.extracted : undefined)
      const profName = prof ? (read(prof.extracted, 'fullName') || read(prof.extracted, 'displayName') || read(prof.extracted, 'handle') || '') : ''
      const signals = {
        linkedin: liExtracted
          ? { fullName: read(liExtracted, 'fullName') || anyName || profName || undefined, headline: read(liExtracted, 'headline'), company: read(liExtracted, 'currentCompany') ?? read(liExtracted, 'company') }
          : undefined,
        instagram: igExtracted ? { displayName: read(igExtracted, 'displayName'), handle: read(igExtracted, 'handle') } : undefined,
        whatsapp: chats.length > 0 ? { name: waFileName, participants: allParticipants, excerpt } : undefined,
      }
      const hasSignal = !!(signals.linkedin || signals.instagram || signals.whatsapp)

      // 4) IA (si hay alguna señal). Nunca bloquea: si falla, caemos a manual.
      let sug: Suggestion | null = null
      if (hasSignal) {
        try {
          const res = await fetch('/api/relaciones/intake-suggest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ signals }),
          })
          const data = (await res.json().catch(() => ({}))) as { suggestion?: Suggestion }
          if (res.ok && data.suggestion) sug = data.suggestion
        } catch {
          /* sin IA: seguimos con lo que tengamos */
        }
      }

      const bestName = sug?.name || anyName || profName || waFileName || ''
      if (sug) {
        setSuggestion(sug); setName(sug.name); setRelationship(sug.relationship); setCategory(sug.category)
      } else {
        setSuggestion({
          name: bestName,
          organization: '',
          relationship: (li || prof?.captureType === 'linkedin') ? 'professional' : 'friend',
          category: 'network',
          reason: bestName ? 'Inferido del archivo (sin IA).' : 'No pude leer la imagen — escribí el nombre abajo y seguí.',
        })
        setName(bestName); setRelationship((li || prof?.captureType === 'linkedin') ? 'professional' : 'friend'); setCategory('network')
      }

      // 5) Matcher (si hay nombre).
      if (bestName) {
        try {
          const sr = await searchPeople(bestName, { captureType: 'whatsapp_chat' })
          setCandidates(sr.candidates)
        } catch {
          setCandidates([])
        }
      }
      setPhase('review')
    } catch (e) {
      setError({ status: e instanceof HttpError ? e.status : 0, message: 'No se pudo analizar', detail: errMsg(e) })
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
        trackCreated(EVENTS.personAdded, { method: 'intake' })
      }

      // WhatsApp → persistir CADA chat (personal + corporativo). promoteDates
      //    activa el cruce de fechas → "Fechas importantes" (dedup server-side).
      let messages = 0
      if (waChats.length > 0) {
        // INCREMENTAL: recorto cada export a lo nuevo desde el último import de
        // esta persona. Re-subir el mismo chat no duplica; uno que creció
        // procesa solo la cola nueva. El watermark avanza dentro del batch por
        // si hay varios exports de la misma persona.
        let watermark = await getLastImportedISO(personId)
        const freshChats = waChats.map((c) => {
          const fresh = sliceParsedSince(c.parsed, watermark)
          if (fresh.messages.length > 0 && fresh.lastISO) watermark = fresh.lastISO
          return fresh
        })
        const perChat = freshChats.map((fp) => (fp.messages.length > 0 ? chunkConversation(fp.messages) : []))
        const totalChunks = perChat.reduce((a, ch) => a + ch.length, 0)
        let done = 0
        setProgress({ done: 0, total: totalChunks })
        for (let ci = 0; ci < freshChats.length; ci++) {
          const fresh = freshChats[ci]
          // Archivar el CRUDO completo SIEMPRE (aunque no haya mensajes nuevos).
          {
            const rawFull0 = (waChats[ci] as { raw?: string }).raw
            if (rawFull0) void archiveConversation({ personId, rawText: rawFull0, dateFirst: waChats[ci].parsed.firstISO, dateLast: waChats[ci].parsed.lastISO, messageCount: waChats[ci].parsed.messages.length })
          }
          if (fresh.messages.length === 0) continue // archivo ya conocido, nada nuevo
          const chunks = perChat[ci]
          const interps: (ChunkInterpretation | null)[] = new Array(chunks.length)
          await runPool(chunks, 3, async (chunk, i) => {
            interps[i] = await interpretChunkResilient({ chunkText: chunk.text, personName, index: i, total: chunks.length })
            done += 1
            setProgress({ done, total: totalChunks })
          })
          const consolidated = consolidateInterpretations(interps.filter((x): x is ChunkInterpretation => !!x))
          const data = buildExportObservationData(fresh, consolidated, personName)
          await persistWhatsAppExport({ personId, data, promoteDates: true })
          messages += fresh.messages.length
        }
      }

      // Imágenes → adjuntar.
      let imgOk = 0
      for (const it of imgs) {
        if (!LINKABLE_TYPES.includes(it.captureType)) continue
        try {
          await processCapture({ file: it.file, captureType: it.captureType, detectorData: it.detectorData, personId })
          imgOk += 1
        } catch {
          /* una imagen falló: el resto sigue */
        }
      }

      // Perfil pegado → persistir Vida Profesional (texto, confirmado).
      let profileOk = false
      if (profileCap) {
        try {
          await processCaptureFromText({
            text: profileCap.text,
            captureType: profileCap.captureType,
            detectorData: profileCap.detectorData,
            personId,
            confirmedData: profileCap.extracted,
          })
          profileOk = true
        } catch {
          /* no fatal: la persona ya quedó creada */
        }
      }

      setResult({ name: personName, slug, messages, imgs: imgOk, profile: profileOk })
      setPhase('done')
    } catch (e) {
      setError({ status: e instanceof HttpError ? e.status : 0, message: 'No se pudo crear/importar', detail: errMsg(e) })
      setPhase('review')
    }
  }

  // ─────────────── UI ───────────────
  function nextInQueue() {
    const ni = queueIdx + 1
    if (ni >= queue.length) return
    setQueueIdx(ni)
    setFiles(queue[ni])
    setWaChats([]); setImgs([]); setImgDiag([]); setProfileText(''); setProfileCap(null)
    setSuggestion(null); setName(''); setRelationship('professional'); setCategory('network')
    setCandidates([]); setSelected(null); setProgress(null); setResult(null)
    setPhase('idle'); setError(null)
  }

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
            {result.imgs > 0 && ` · ${result.imgs} captura(s) adjunta(s)`}
            {result.profile && ' · perfil cargado en Vida Profesional'}.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {result.slug && (
              <Button size="sm" asChild>
                <Link href={`/relaciones/${result.slug}`} className="inline-flex items-center gap-1.5">
                  Ver el perfil <ArrowRight size={14} />
                </Link>
              </Button>
            )}
            {queueIdx + 1 < queue.length ? (
              <Button size="sm" onClick={nextInQueue}>
                Siguiente persona ({queueIdx + 2} de {queue.length}) <ArrowRight size={14} className="ml-1" />
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={reset}>Cargar otra persona</Button>
            )}
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
          propone el <span className="text-foreground">tipo de relación</span>. También podés <span className="text-foreground">pegar el texto de su LinkedIn</span> y lo crea con su Vida Profesional. Confirmás y queda todo en su perfil.
        </p>

        {/* Archivos */}
        <div className="space-y-2">
          <input
            type="file"
            multiple
            accept=".zip,.txt,image/jpeg,image/png,image/webp"
            disabled={phase === 'analyzing' || phase === 'importing'}
            onChange={(e) => {
              const all = Array.from(e.target.files ?? [])
              const groups = groupFilesByPerson(all)
              setQueue(groups); setQueueIdx(0)
              setFiles(groups[0] ?? all)
              setSuggestion(null); setPhase('idle'); setError(null); setSelected(null)
            }}
            className="text-sm w-full file:mr-3 file:rounded file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-medium hover:file:bg-accent/10"
          />
          {queue.length > 1 && (
            <div className="rounded-md border border-[#14b8a6]/40 bg-[#14b8a6]/5 px-3 py-1.5 text-[12px] text-foreground">
              Detecté <span className="font-semibold">{queue.length} personas distintas</span>. Procesando <span className="font-semibold">persona {queueIdx + 1} de {queue.length}</span> — revisás y confirmás una por una.
            </div>
          )}
          {files.length > 0 && (
            <ul className="text-[11px] text-muted-foreground font-mono space-y-0.5">
              {files.map((f, i) => (
                <li key={i} className="flex items-center gap-1.5">
                  <FileText size={11} /> {f.name} · {(f.size / 1024).toFixed(0)} KB
                </li>
              ))}
            </ul>
          )}
          <div className="pt-1">
            <label className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary block mb-1">
              …o pegá el texto de su perfil (LinkedIn / Instagram)
            </label>
            <textarea
              value={profileText}
              onChange={(e) => { setProfileText(e.target.value); setSuggestion(null); setPhase('idle'); setError(null); setSelected(null) }}
              rows={3}
              placeholder="Pegá el 'Acerca de' + experiencia del perfil. Más confiable que la captura de página entera."
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
              disabled={phase === 'analyzing' || phase === 'importing'}
            />
          </div>
          {phase !== 'review' && phase !== 'importing' && (
            <Button size="sm" onClick={() => void analyze()} disabled={(files.length === 0 && !profileText.trim()) || phase === 'analyzing'}>
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
            {imgDiag.length > 0 && (
              <ul className="text-[11px] text-muted-foreground space-y-0.5">
                {imgDiag.map((d, i) => (
                  <li key={i} className="font-mono">
                    <span className="text-foreground/80">{d.type}</span> · {d.detail}
                  </li>
                ))}
              </ul>
            )}

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
