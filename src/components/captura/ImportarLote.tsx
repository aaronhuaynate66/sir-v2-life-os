'use client'
// SIR V2 — ImportarLote (#91): soltar VARIOS exports de WhatsApp de una.
// Por cada archivo, SIR intenta rutear solo (alias de red → nombre del archivo;
// si no, match difuso por nombre) y muestra un SEMÁFORO: verde = ruteado por
// alias, amarillo = match por nombre (verificá), rojo = elegí/creá. Resueltos
// todos, "Procesar" corre la COLA reusando runWhatsappImport (mismo pipeline
// que el import de a uno), secuencial, con progreso por chat. La media se
// procesa en el navegador, con créditos — por eso es secuencial.

import { useCallback, useRef, useState } from 'react'
import { Layers, Loader2, Check, X, UserPlus, CircleDot } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { createPerson, searchPeople, type PersonCandidate } from '@/lib/capture/observations/client'
import { runWhatsappImport, waNameFromFile, type RunImportProgress } from '@/lib/capture/whatsapp/runImport'

type Conf = 'green' | 'yellow' | 'red'
type RowStatus = 'idle' | 'processing' | 'done' | 'dup' | 'error'
interface Row {
  key: string
  file: File
  waName: string
  personId: string | null
  personName: string | null
  conf: Conf
  reason: string
  status: RowStatus
  detail: string
  progress: RunImportProgress | null
}

function confColor(c: Conf): string {
  return c === 'green' ? 'text-good' : c === 'yellow' ? 'text-warn' : 'text-bad'
}

export function ImportarLote() {
  const [rows, setRows] = useState<Row[]>([])
  const [classifying, setClassifying] = useState(false)
  const [running, setRunning] = useState(false)
  const [transcribeAudios, setTranscribeAudios] = useState(true)
  const [readImages, setReadImages] = useState(true)
  const [readStickers, setReadStickers] = useState(true)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Clasifica un archivo: alias por red (verde) → match difuso por nombre
  // (amarillo) → nada (rojo).
  const classify = useCallback(async (file: File): Promise<Row> => {
    const waName = waNameFromFile(file.name)
    const base: Row = { key: `${file.name}-${file.size}-${file.lastModified}`, file, waName, personId: null, personName: null, conf: 'red', reason: 'elegí a quién', status: 'idle', detail: '', progress: null }
    if (!waName) return base
    // 1) alias exacto por red (whatsapp)
    try {
      const r = await fetch(`/api/person-identities?network=whatsapp&names=${encodeURIComponent(waName)}`)
      if (r.ok) {
        const j = (await r.json()) as { personId?: string | null; personName?: string }
        if (j.personId && j.personName) return { ...base, personId: j.personId, personName: j.personName, conf: 'green', reason: 'alias de WhatsApp' }
      }
    } catch { /* */ }
    // 2) match difuso por nombre → pre-selecciona el mejor, amarillo (verificá)
    try {
      const r = await searchPeople(waName, { captureType: 'whatsapp_chat' })
      const top = r.candidates[0]
      if (top) return { ...base, personId: top.id, personName: top.name, conf: 'yellow', reason: `por nombre (${top.matchReason})` }
    } catch { /* */ }
    return base
  }, [])

  const onFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setClassifying(true)
    const arr = Array.from(files).filter((f) => /\.(zip|txt)$/i.test(f.name))
    const placeholders: Row[] = arr.map((f) => ({ key: `${f.name}-${f.size}-${f.lastModified}`, file: f, waName: waNameFromFile(f.name), personId: null, personName: null, conf: 'red', reason: '…', status: 'idle', detail: '', progress: null }))
    setRows(placeholders)
    const classified = await Promise.all(arr.map((f) => classify(f)))
    setRows(classified)
    setClassifying(false)
  }, [classify])

  function setRow(key: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }
  function quitar(key: string) { setRows((prev) => prev.filter((r) => r.key !== key)) }

  async function procesar() {
    if (running) return
    setRunning(true)
    const opts = { transcribeAudios, readImages, readStickers }
    // Secuencial: la media corre en el navegador con créditos.
    for (const r of rows) {
      if (!r.personId || r.status === 'done' || r.status === 'dup') continue
      setRow(r.key, { status: 'processing', detail: '', progress: null })
      const res = await runWhatsappImport(r.file, r.personId, r.personName ?? r.waName, opts, (p) => setRow(r.key, { progress: p }))
      if (res.ok && res.alreadyImported) setRow(r.key, { status: 'dup', detail: 'ya estaba al día', progress: null })
      else if (res.ok) setRow(r.key, { status: 'done', detail: `${res.messageCount ?? 0} msgs · ${res.blocks ?? 0} bloques${res.calls ? ` · ${res.calls} llamadas` : ''}`, progress: null })
      else setRow(r.key, { status: 'error', detail: res.error ?? 'falló', progress: null })
    }
    setRunning(false)
  }

  const pendientes = rows.filter((r) => r.personId && r.status !== 'done' && r.status !== 'dup').length
  const hechos = rows.filter((r) => r.status === 'done' || r.status === 'dup')
  const sinPersona = rows.filter((r) => !r.personId).length

  return (
    <Card className="mb-6 shadow-none">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-2">
          <Layers size={16} strokeWidth={1.75} className="text-primary" aria-hidden="true" />
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Importar varios chats (lote)</div>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          Soltá todos los <span className="font-mono">.zip</span> de una. SIR rutea por alias/nombre; verificás los dudosos y procesa la cola. La media corre en tu navegador, secuencial.
        </p>

        <label className="mb-3 flex items-center gap-2 cursor-pointer rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted/40">
          {classifying ? <Loader2 size={15} className="animate-spin" /> : <Layers size={15} />}
          <span>{classifying ? 'Clasificando…' : 'Elegí varios .zip / .txt'}</span>
          <input ref={inputRef} type="file" accept=".txt,.zip,text/plain,application/zip" multiple className="hidden" disabled={running}
            onChange={(e) => { void onFiles(e.target.files); e.currentTarget.value = '' }} />
        </label>

        {rows.length > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-[11px] text-muted-foreground">
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={transcribeAudios} onChange={(e) => setTranscribeAudios(e.target.checked)} disabled={running} /> Notas de voz</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={readImages} onChange={(e) => setReadImages(e.target.checked)} disabled={running} /> Documentos/capturas</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={readStickers} onChange={(e) => setReadStickers(e.target.checked)} disabled={running} /> Stickers</label>
            </div>

            <ul className="space-y-1.5 mb-3">
              {rows.map((r) => <RowItem key={r.key} row={r} running={running} onResolve={(id, nm, conf) => setRow(r.key, { personId: id, personName: nm, conf, reason: 'elegido a mano' })} onRemove={() => quitar(r.key)} />)}
            </ul>

            {hechos.length > 0 && !running && (
              <div className="mb-2 rounded-lg border border-good/40 bg-good/10 p-2.5 text-xs text-foreground">
                ✓ Listo — {hechos.length} chat{hechos.length === 1 ? '' : 's'} importado{hechos.length === 1 ? '' : 's'}{pendientes > 0 ? `; quedan ${pendientes}` : ''}.
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] text-muted-foreground">
                {sinPersona > 0 ? `${sinPersona} sin asignar` : 'todos asignados'} · {pendientes} por procesar
              </div>
              <Button size="sm" onClick={() => void procesar()} disabled={running || pendientes === 0}>
                {running ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Check size={14} className="mr-2" />}
                Procesar {pendientes} chat{pendientes === 1 ? '' : 's'}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function RowItem({ row, running, onResolve, onRemove }: { row: Row; running: boolean; onResolve: (id: string, name: string, conf: Conf) => void; onRemove: () => void }) {
  const [editing, setEditing] = useState(false)
  const [q, setQ] = useState('')
  const [cands, setCands] = useState<PersonCandidate[]>([])
  const [busy, setBusy] = useState(false)

  async function buscar(v: string) {
    setQ(v)
    if (v.trim().length < 2) { setCands([]); return }
    try { const r = await searchPeople(v.trim(), { captureType: 'whatsapp_chat' }); setCands(r.candidates.slice(0, 5)) } catch { setCands([]) }
  }
  async function crear() {
    const n = q.trim(); if (!n || busy) return
    setBusy(true)
    try { const c = await createPerson({ name: n }); onResolve(c.person.id, c.person.name, 'green'); setEditing(false) } catch { /* */ } finally { setBusy(false) }
  }

  const statusBadge =
    row.status === 'done' ? <Badge variant="secondary" className="text-[10px] text-good">listo</Badge>
    : row.status === 'dup' ? <Badge variant="outline" className="text-[10px]">al día</Badge>
    : row.status === 'error' ? <Badge variant="destructive" className="text-[10px]">error</Badge>
    : row.status === 'processing' ? <Badge variant="secondary" className="text-[10px]">procesando…</Badge>
    : null

  return (
    <li className="rounded-lg border border-border p-2.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-2">
          <CircleDot size={12} className={confColor(row.conf)} aria-hidden="true" />
          <div className="min-w-0">
            <div className="font-medium text-foreground truncate">{row.waName || row.file.name}</div>
            <div className="text-[10px] text-muted-foreground">
              {row.personName ? <>→ <span className="text-foreground">{row.personName}</span> · {row.reason}</> : <span className="text-bad">{row.reason}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {statusBadge}
          {!running && row.status === 'idle' && <button type="button" onClick={() => setEditing((s) => !s)} className="text-[11px] text-primary hover:underline">cambiar</button>}
          {!running && row.status === 'idle' && <button type="button" onClick={onRemove} aria-label="Quitar" className="text-muted-foreground hover:text-bad"><X size={13} /></button>}
        </div>
      </div>

      {row.status === 'processing' && row.progress && (
        <div className="mt-1.5 text-[10px] text-muted-foreground">
          {row.progress.phase === 'media' ? `Leyendo ${row.progress.label}… ${row.progress.done ?? 0}/${row.progress.total ?? 0}`
            : row.progress.phase === 'interpreting' ? `Interpretando ${row.progress.done ?? 0}/${row.progress.total ?? 0}`
            : row.progress.phase === 'persisting' ? 'Guardando…' : 'Leyendo…'}
        </div>
      )}
      {(row.status === 'done' || row.status === 'dup' || row.status === 'error') && row.detail && (
        <div className={`mt-1 text-[10px] ${row.status === 'error' ? 'text-bad' : 'text-muted-foreground'}`}>{row.detail}</div>
      )}

      {editing && row.status === 'idle' && (
        <div className="mt-2 rounded border border-border p-2">
          <Input value={q} onChange={(e) => void buscar(e.target.value)} placeholder="Buscar persona…" className="text-xs h-8" />
          {cands.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {cands.map((c) => (
                <button key={c.id} type="button" onClick={() => { onResolve(c.id, c.name, 'green'); setEditing(false) }}
                  className="rounded-full border border-border px-2 py-0.5 text-[11px] hover:bg-brand-soft/30">{c.name}</button>
              ))}
            </div>
          )}
          {q.trim().length >= 2 && (
            <button type="button" onClick={() => void crear()} disabled={busy} className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
              {busy ? <Loader2 size={11} className="animate-spin" /> : <UserPlus size={11} />} Crear «{q.trim()}»
            </button>
          )}
        </div>
      )}
    </li>
  )
}
