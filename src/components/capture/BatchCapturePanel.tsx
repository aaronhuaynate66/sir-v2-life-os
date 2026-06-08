'use client'
// SIR V2 — BatchCapturePanel: subir VARIAS imágenes a la vez en /captura (#102).
//
// Distinto de AgregarCapturaPanel (varias del MISMO perfil → 1 observación) y del
// flujo single de /captura (1 imagen por vez). Acá: N imágenes potencialmente de
// tipos/personas DISTINTAS, procesadas en cola (detect → process por archivo),
// con estado por imagen y vínculo de persona por captura tras el guardado.
//
// AISLADO a propósito: vive aparte del flujo single (que queda intacto). Reusa
// los clientes ya probados (detectCaptureType, processCapture, linkObservationToPerson,
// createPerson). Sin endpoint batch nuevo: la cola es client-side y secuencial
// (evita saturar Vision / rate limits).

import { useCallback, useState } from 'react'
import { Images, Loader2, CheckCircle2, X, UserPlus, ChevronDown, ChevronRight } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { detectCaptureType, DetectorError } from '@/lib/capture/detector/client'
import {
  HttpError,
  processCapture,
  linkObservationToPerson,
  createPerson,
  type ProcessCaptureResponse,
  type PersonCandidate,
} from '@/lib/capture/observations/client'
import type { CaptureType, Observation } from '@/lib/capture/observations/types'

const TYPES_WITH_EXTRACTOR: ReadonlySet<CaptureType> = new Set([
  'whatsapp_chat',
  'whatsapp_web',
  'whatsapp_info',
  'instagram',
  'linkedin',
])

type ItemStatus = 'pending' | 'detecting' | 'processing' | 'done' | 'skipped' | 'error'

interface BatchItem {
  id: string
  file: File
  status: ItemStatus
  detectedType?: CaptureType
  result?: ProcessCaptureResponse
  error?: string
}

let _seq = 0
const nextId = () => `b${Date.now()}_${_seq++}`

const STATUS_LABEL: Record<ItemStatus, string> = {
  pending: 'En cola',
  detecting: 'Detectando…',
  processing: 'Procesando…',
  done: 'Guardada',
  skipped: 'Omitida',
  error: 'Error',
}

export function BatchCapturePanel() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<BatchItem[]>([])
  const [running, setRunning] = useState(false)

  const onFiles = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    setItems(files.map((f) => ({ id: nextId(), file: f, status: 'pending' as ItemStatus })))
  }, [])

  const patch = useCallback((id: string, p: Partial<BatchItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...p } : it)))
  }, [])

  const processAll = useCallback(async () => {
    if (running) return
    setRunning(true)
    try {
      const toRun = items.filter((it) => it.status === 'pending' || it.status === 'error')
      for (const it of toRun) {
        patch(it.id, { status: 'detecting', error: undefined })
        try {
          const det = await detectCaptureType(it.file)
          const type = det.detected.type
          if (!TYPES_WITH_EXTRACTOR.has(type)) {
            // Báscula/sueño/FC/otros: no se procesan en lote (son self o sin extractor).
            patch(it.id, { status: 'skipped', detectedType: type })
            continue
          }
          patch(it.id, { status: 'processing', detectedType: type })
          const result = await processCapture({
            file: it.file,
            captureType: type,
            detectorData: det.detected,
            personId: null,
          })
          patch(it.id, { status: 'done', detectedType: type, result })
        } catch (e) {
          const msg =
            e instanceof DetectorError || e instanceof HttpError
              ? e.message
              : e instanceof Error
                ? e.message
                : String(e)
          patch(it.id, { status: 'error', error: msg })
        }
      }
    } finally {
      setRunning(false)
    }
  }, [items, running, patch])

  const pendingCount = items.filter((it) => it.status === 'pending' || it.status === 'error').length
  const doneCount = items.filter((it) => it.status === 'done').length

  return (
    <Card className="shadow-none mb-6">
      <CardContent className="p-4 sm:p-6 space-y-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center gap-2 text-left"
          aria-expanded={open}
        >
          {open ? <ChevronDown size={16} className="text-muted-foreground/70" /> : <ChevronRight size={16} className="text-muted-foreground/70" />}
          <Images size={16} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
          <h2 className="text-sm font-semibold tracking-tight">Subir varias a la vez</h2>
          <span className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">lote</span>
        </button>

        {open && (
          <>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Elegí varios pantallazos (WhatsApp, Instagram o LinkedIn). Se procesan en cola, uno por
              uno, y después vinculás la persona de cada captura. Báscula / sueño / FC se omiten acá —
              esas subilas de a una arriba.
            </p>

            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={onFiles}
              disabled={running}
              className="text-sm w-full file:mr-3 file:rounded file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-medium hover:file:bg-accent/10"
            />

            {items.length > 0 && (
              <div className="flex items-center gap-3 flex-wrap">
                <Button size="sm" onClick={processAll} disabled={running || pendingCount === 0}>
                  {running ? (
                    <>
                      <Loader2 size={14} className="mr-2 animate-spin" />
                      Procesando…
                    </>
                  ) : (
                    `Procesar ${pendingCount} ${pendingCount === 1 ? 'imagen' : 'imágenes'}`
                  )}
                </Button>
                <span className="text-[11px] text-muted-foreground font-mono">
                  {items.length} en lista · {doneCount} guardadas
                </span>
              </div>
            )}

            <ul className="space-y-2">
              {items.map((it) => (
                <li key={it.id} className="rounded-md border border-border bg-muted/10 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate">{it.file.name}</div>
                      <div className="text-[10px] font-mono text-muted-foreground/70">
                        {(it.file.size / 1024).toFixed(0)} KB
                        {it.detectedType && ` · ${it.detectedType}`}
                      </div>
                    </div>
                    <Badge
                      variant={it.status === 'done' ? 'default' : it.status === 'error' ? 'destructive' : 'secondary'}
                      className="text-[10px] font-mono shrink-0"
                    >
                      {(it.status === 'detecting' || it.status === 'processing') && (
                        <Loader2 size={10} className="mr-1 animate-spin" />
                      )}
                      {STATUS_LABEL[it.status]}
                    </Badge>
                  </div>

                  {it.status === 'error' && it.error && (
                    <div className="text-[11px] text-destructive">{it.error}</div>
                  )}
                  {it.status === 'skipped' && (
                    <div className="text-[11px] text-muted-foreground">
                      Tipo <span className="font-mono">{it.detectedType}</span> no va en lote. Subila de a una arriba.
                    </div>
                  )}
                  {it.status === 'done' && it.result && <BatchResultRow result={it.result} />}
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  )
}

/** Nombre best-effort del extractor para prellenar "crear persona". */
function initialName(captureType: CaptureType, extracted: Record<string, unknown>): string {
  const read = (k: string) => (typeof extracted[k] === 'string' ? (extracted[k] as string).trim() : '')
  switch (captureType) {
    case 'linkedin':
      return read('fullName')
    case 'instagram':
      return read('displayName') || read('handle')
    case 'whatsapp_info':
      return read('displayName')
    default:
      return read('personName')
  }
}

/** Vínculo de persona por captura guardada (slim, reusa los clientes). */
function BatchResultRow({ result }: { result: ProcessCaptureResponse }) {
  const [obs, setObs] = useState<Observation>(result.observation)
  const [candidates] = useState<PersonCandidate[]>(result.matchCandidates)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState(() => initialName(result.observation.captureType, result.extracted))

  const link = useCallback(
    async (personId: string | null) => {
      setBusy(personId ?? '__unlink__')
      setErr(null)
      try {
        const r = await linkObservationToPerson(obs.id, personId)
        setObs(r.observation)
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e))
      } finally {
        setBusy(null)
      }
    },
    [obs.id],
  )

  const createAndLink = useCallback(async () => {
    const name = createName.trim()
    if (!name) return
    setBusy('__create__')
    setErr(null)
    try {
      const created = await createPerson({ name })
      const r = await linkObservationToPerson(obs.id, created.person.id)
      setObs(r.observation)
      setShowCreate(false)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }, [createName, obs.id])

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap text-[10px] font-mono text-muted-foreground/70">
        <span className="break-all">{obs.id}</span>
        {result.autoLinked && (
          <Badge variant="secondary" className="text-[10px] font-mono">
            auto-link · {result.autoLinked.reason}
          </Badge>
        )}
      </div>

      {obs.personId ? (
        <div className="rounded border border-ok/30 bg-ok-soft p-2 text-xs flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <CheckCircle2 size={13} className="text-ok" />
            <span className="font-mono text-muted-foreground/70 break-all">{obs.personId}</span>
          </span>
          <button
            type="button"
            onClick={() => link(null)}
            disabled={busy !== null}
            className="text-muted-foreground hover:text-foreground disabled:opacity-50"
            aria-label="Desvincular"
          >
            {busy === '__unlink__' ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {candidates.length > 0 ? (
            <ul className="space-y-1">
              {candidates.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => link(c.id)}
                    disabled={busy !== null}
                    className="w-full text-left rounded border border-border hover:border-accent/50 px-2.5 py-1.5 text-xs flex items-center justify-between gap-2 disabled:opacity-50"
                  >
                    <span className="font-medium">{c.name}</span>
                    <span className="flex items-center gap-2 shrink-0">
                      <Badge variant="secondary" className="text-[10px] font-mono">
                        {c.matchReason} {c.matchScore}
                      </Badge>
                      {busy === c.id && <Loader2 size={11} className="animate-spin" />}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-[11px] text-muted-foreground italic">Sin coincidencias.</div>
          )}

          {showCreate ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Nombre de la persona"
                className="text-xs flex-1 rounded border border-border bg-background px-2.5 py-1.5"
                disabled={busy !== null}
              />
              <Button size="sm" onClick={createAndLink} disabled={busy !== null || createName.trim().length === 0}>
                {busy === '__create__' ? <Loader2 size={12} className="animate-spin" /> : 'Crear'}
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setShowCreate(true)} disabled={busy !== null}>
              <UserPlus size={13} className="mr-1.5" />
              Crear persona nueva
            </Button>
          )}
        </div>
      )}

      {err && <div className="text-[11px] text-destructive">{err}</div>}
    </div>
  )
}
