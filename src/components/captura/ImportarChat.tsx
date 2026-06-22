'use client'
// SIR V2 — ImportarChat: subir el export de WhatsApp de OTRA persona y crear o
// vincular su contacto EN UN PASO (antes había que crear la persona primero y
// subir desde su ficha).
//
// Portón "¿de quién es?": a medida que escribís, SUGERIMOS personas existentes
// (searchPeople, matcher difuso server-side). Elegís una para VINCULAR, o creás
// una nueva EXPLÍCITAMENTE. Antes el match era por nombre EXACTO → un nombre con
// otra grafía creaba un duplicado (caso Nicolle). Resuelta la persona, se reusa
// AgregarCapturaPanel en modo 'whatsapp' (pipeline completo + revisión + persist).

import { useEffect, useState } from 'react'
import { Loader2, MessagesSquare, UserPlus, X, FileUp, CheckCircle2 } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { createPerson, searchPeople, type PersonCandidate } from '@/lib/capture/observations/client'
import { readExportText } from '@/lib/capture/whatsapp/export/client'
import { parseWhatsAppExport } from '@/lib/capture/whatsapp/export/parse'
import { chatFingerprint } from '@/lib/capture/whatsapp/export/fingerprint'
import { AgregarCapturaPanel } from '@/components/relaciones/AgregarCapturaPanel'

export function ImportarChat() {
  const [name, setName] = useState('')
  const [candidates, setCandidates] = useState<PersonCandidate[]>([])
  const [searching, setSearching] = useState(false)
  const [resolved, setResolved] = useState<{ id: string; name: string; created: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [waFile, setWaFile] = useState<File | null>(null)
  const [recognizing, setRecognizing] = useState(false)
  const [recognized, setRecognized] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Sugerencias en vivo (debounce). Solo mientras no haya persona resuelta.
  useEffect(() => {
    if (resolved) return
    const q = name.trim()
    if (q.length < 2) {
      setCandidates([])
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const r = await searchPeople(q, { captureType: 'whatsapp_chat', signal: controller.signal })
        setCandidates(r.candidates)
      } catch {
        if (!controller.signal.aborted) setCandidates([])
      } finally {
        if (!controller.signal.aborted) setSearching(false)
      }
    }, 250)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [name, resolved])

  function vincularExistente(c: PersonCandidate) {
    setErr(null)
    setResolved({ id: c.id, name: c.name, created: false })
  }

  async function reconocer(file: File) {
    setWaFile(file)
    setErr(null)
    setRecognizing(true)
    setRecognized(false)
    try {
      const text = await readExportText(file)
      const parsed = parseWhatsAppExport(text)
      const fp = chatFingerprint(parsed.participants)
      if (fp) {
        const res = await fetch(`/api/chat-identities?fingerprint=${encodeURIComponent(fp)}`)
        if (res.ok) {
          const j = (await res.json()) as { personId?: string | null; personName?: string }
          if (j.personId && j.personName) {
            setResolved({ id: j.personId, name: j.personName, created: false })
            setRecognized(true)
            return
          }
        }
      }
      // Sin match: dejamos el archivo cargado y caemos al matcher por nombre.
    } catch {
      setErr('No pude leer el archivo. Probá elegir a la persona manualmente.')
    } finally {
      setRecognizing(false)
    }
  }

  async function crearNueva() {
    const n = name.trim()
    if (!n || busy) return
    setBusy(true)
    setErr(null)
    try {
      // Crea el row en DB (server genera id + slug). El sync por realtime lo
      // baja al store; el export usa este id directo, sin esperar.
      const c = await createPerson({ name: n })
      setResolved({ id: c.person.id, name: c.person.name, created: true })
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (resolved) {
    return (
      <div className="mb-6">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="text-sm text-muted-foreground">
            Importando chat para{' '}
            <span className="font-medium text-foreground">{resolved.name}</span>
            {resolved.created && <span className="text-xs text-ok"> · contacto creado</span>}
          </div>
          <Button size="sm" variant="ghost" onClick={() => { setResolved(null); setName(''); setCandidates([]) }}>
            <X size={13} strokeWidth={2} className="mr-1" aria-hidden="true" />
            cambiar
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground mb-2 leading-relaxed">
          Tip: este mismo panel también suma su perfil — tras importar el chat, tocá la pestaña{' '}
          <span className="text-foreground font-medium">Imagen</span> y subí su captura de
          LinkedIn/Instagram para enriquecer a <span className="text-foreground">{resolved.name}</span>.
        </p>
        {recognized && <p className="text-[11px] text-ok mb-2 inline-flex items-center gap-1"><CheckCircle2 size={12} /> Reconocí este chat por sus participantes — lo ruteé solo.</p>}
        <AgregarCapturaPanel personId={resolved.id} personName={resolved.name} defaultMode="whatsapp" initialWaFile={waFile} />
      </div>
    )
  }

  const showCreate = name.trim().length >= 2

  return (
    <Card className="mb-6 shadow-none">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-2">
          <MessagesSquare size={16} strokeWidth={1.75} className="text-primary flex-shrink-0" aria-hidden="true" />
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Importar un chat de WhatsApp</div>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          Subí el export de una conversación y creá o vinculá su contacto en un paso. ¿De quién es el chat?
        </p>

        <label className="mb-3 flex items-center gap-2 cursor-pointer rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted/40">
          {recognizing ? <Loader2 size={15} className="animate-spin" /> : <FileUp size={15} />}
          <span>{recognizing ? 'Reconociendo el chat…' : 'Subí el .zip y lo reconozco solo (si ya lo importaste antes)'}</span>
          <input type="file" accept=".txt,.zip,text/plain,application/zip" className="hidden" disabled={recognizing}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void reconocer(f); e.currentTarget.value = '' }} />
        </label>
        {waFile && !recognizing && (
          <p className="text-[11px] text-muted-foreground mb-2">No reconocí este chat (primera vez). Elegí la persona abajo — la próxima lo ruteo solo.</p>
        )}

        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Empezá a escribir el nombre del contacto…"
          className="w-full"
        />

        {searching && (
          <div className="text-xs text-muted-foreground flex items-center gap-2 mt-2">
            <Loader2 size={12} className="animate-spin" /> Buscando…
          </div>
        )}

        {/* Sugerencias: vincular a alguien que YA existe (evita duplicados). */}
        {candidates.length > 0 && (
          <div className="mt-2">
            <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary mb-1.5">
              ¿Es alguno de estos?
            </div>
            <ul className="space-y-1.5 max-h-56 overflow-y-auto">
              {candidates.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => vincularExistente(c)}
                    className="w-full text-left rounded border border-border hover:border-accent/50 px-3 py-2 text-xs flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="font-medium text-foreground">{c.name}</div>
                      <div className="text-muted-foreground font-mono text-[10px]">
                        {c.slug ?? c.id}
                        {c.alias && ` · alias: ${c.alias}`}
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-[10px] font-mono shrink-0">
                      {c.matchReason} {c.matchScore}
                    </Badge>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {name.trim().length >= 2 && !searching && candidates.length === 0 && (
          <div className="text-xs text-muted-foreground italic mt-2">
            Sin coincidencias — creá el contacto nuevo abajo.
          </div>
        )}

        {/* Crear NUEVA: acción explícita (no auto-merge). */}
        {showCreate && (
          <div className="mt-3">
            <Button onClick={() => void crearNueva()} disabled={busy}>
              {busy ? (
                <Loader2 size={15} className="animate-spin mr-2" />
              ) : (
                <UserPlus size={15} strokeWidth={1.75} className="mr-2" />
              )}
              Crear contacto nuevo: «{name.trim()}»
            </Button>
          </div>
        )}

        {err && <div className="text-xs text-bad mt-2">{err}</div>}
      </CardContent>
    </Card>
  )
}
