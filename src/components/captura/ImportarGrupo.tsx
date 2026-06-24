'use client'
// SIR V2 — ImportarGrupo: importar un chat GRUPAL atribuyendo por autor. Detecta
// los participantes, resuelve cada uno a una persona (el que no resuelve suele
// ser "vos" → excluido), confirmás, y procesa atribuyendo a cada miembro sin
// contaminar fichas (cada uno recibe SU señal). Reusa runGroupImport.

import { useCallback, useState } from 'react'
import { Users, Loader2, Check, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { searchPeople, type PersonCandidate } from '@/lib/capture/observations/client'
import { readExportText } from '@/lib/capture/whatsapp/export/client'
import { parseWhatsAppExport } from '@/lib/capture/whatsapp/export/parse'
import { runGroupImport, type GroupProgress, type GroupMemberResult } from '@/lib/capture/whatsapp/groupImport'

interface MemberRow {
  author: string
  include: boolean
  personId: string | null
  personName: string | null
  editing: boolean
  q: string
  cands: PersonCandidate[]
  status: 'idle' | 'processing' | 'done' | 'error'
  detail: string
}

export function ImportarGrupo() {
  const [file, setFile] = useState<File | null>(null)
  const [reading, setReading] = useState(false)
  const [rows, setRows] = useState<MemberRow[]>([])
  const [transcribeAudios, setTranscribeAudios] = useState(true)
  const [readImages, setReadImages] = useState(true)
  const [readStickers, setReadStickers] = useState(true)
  const [running, setRunning] = useState(false)
  const [prog, setProg] = useState<GroupProgress | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const onFile = useCallback(async (f: File | null) => {
    if (!f) return
    setFile(f); setReading(true); setErr(null); setRows([])
    try {
      const text = await readExportText(f)
      const parsed = parseWhatsAppExport(text)
      const authors = parsed.participants ?? []
      if (authors.length < 2) { setErr('No detecté participantes (¿es un export válido?).'); setReading(false); return }
      const built = await Promise.all(authors.map(async (a): Promise<MemberRow> => {
        let personId: string | null = null, personName: string | null = null
        try { const r = await searchPeople(a, { captureType: 'whatsapp_chat' }); const top = r.candidates[0]; if (top) { personId = top.id; personName = top.name } } catch { /* */ }
        return { author: a, include: !!personId, personId, personName, editing: false, q: '', cands: [], status: 'idle', detail: '' }
      }))
      setRows(built)
    } catch { setErr('No pude leer el archivo.') } finally { setReading(false) }
  }, [])

  function patch(author: string, p: Partial<MemberRow>) { setRows((prev) => prev.map((r) => (r.author === author ? { ...r, ...p } : r))) }
  async function buscar(author: string, v: string) {
    patch(author, { q: v })
    if (v.trim().length < 2) { patch(author, { cands: [] }); return }
    try { const r = await searchPeople(v.trim(), { captureType: 'whatsapp_chat' }); patch(author, { cands: r.candidates.slice(0, 5) }) } catch { /* */ }
  }

  async function procesar() {
    if (!file || running) return
    const members = rows.filter((r) => r.include && r.personId).map((r) => ({ id: r.personId as string, name: r.personName as string }))
    if (members.length === 0) { setErr('Marcá al menos un miembro con persona asignada.'); return }
    setRunning(true); setErr(null)
    members.forEach((m) => setRows((prev) => prev.map((r) => (r.personId === m.id ? { ...r, status: 'processing' } : r))))
    const res = await runGroupImport(file, members, { transcribeAudios, readImages, readStickers }, (p) => setProg(p))
    for (const r of res.perMember as GroupMemberResult[]) {
      setRows((prev) => prev.map((row) => (row.personId === r.id ? { ...row, status: r.ok ? 'done' : 'error', detail: r.ok ? `${r.messageCount ?? 0} msgs · ${r.blocks ?? 0} bloques` : (r.error ?? 'falló') } : row)))
    }
    if (!res.ok && res.error) setErr(res.error)
    setProg(null); setRunning(false)
  }

  const asignados = rows.filter((r) => r.include && r.personId)
  const pendientes = asignados.filter((r) => r.status !== 'done').length
  const hechos = rows.filter((r) => r.status === 'done')

  return (
    <Card className="mb-6 shadow-none">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-2">
          <Users size={16} strokeWidth={1.75} className="text-primary" aria-hidden="true" />
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Importar un chat grupal (por autor)</div>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          Para grupos (mamá + hermana, equipo, etc.). SIR atribuye lo de cada uno a SU ficha, sin mezclar. El que sos vos queda excluido.
        </p>

        <label className="mb-3 flex items-center gap-2 cursor-pointer rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted/40">
          {reading ? <Loader2 size={15} className="animate-spin" /> : <Users size={15} />}
          <span>{reading ? 'Leyendo participantes…' : (file ? file.name : 'Elegí el .zip del grupo')}</span>
          <input type="file" accept=".txt,.zip,text/plain,application/zip" className="hidden" disabled={running}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.currentTarget.value = '' }} />
        </label>

        {rows.length > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-[11px] text-muted-foreground">
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={transcribeAudios} onChange={(e) => setTranscribeAudios(e.target.checked)} disabled={running} /> Notas de voz</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={readImages} onChange={(e) => setReadImages(e.target.checked)} disabled={running} /> Documentos/capturas</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={readStickers} onChange={(e) => setReadStickers(e.target.checked)} disabled={running} /> Stickers</label>
            </div>

            <ul className="space-y-1.5 mb-3">
              {rows.map((r) => (
                <li key={r.author} className="rounded-lg border border-border p-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 min-w-0">
                      <input type="checkbox" checked={r.include} disabled={running} onChange={(e) => patch(r.author, { include: e.target.checked })} />
                      <span className="min-w-0">
                        <span className="font-medium text-foreground">{r.author}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {' '}→ {r.personName ? <span className="text-foreground">{r.personName}</span> : <span className="text-warn">sin persona (¿sos vos?)</span>}
                        </span>
                      </span>
                    </label>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {r.status === 'done' && <Badge variant="secondary" className="text-[10px] text-good">listo</Badge>}
                      {r.status === 'processing' && <Badge variant="secondary" className="text-[10px]">procesando…</Badge>}
                      {r.status === 'error' && <Badge variant="destructive" className="text-[10px]">error</Badge>}
                      {!running && r.status === 'idle' && <button type="button" onClick={() => patch(r.author, { editing: !r.editing })} className="text-[11px] text-primary hover:underline">cambiar</button>}
                    </div>
                  </div>
                  {r.detail && <div className={`mt-1 text-[10px] ${r.status === 'error' ? 'text-bad' : 'text-muted-foreground'}`}>{r.detail}</div>}
                  {r.editing && !running && (
                    <div className="mt-2 rounded border border-border p-2">
                      <Input value={r.q} onChange={(e) => void buscar(r.author, e.target.value)} placeholder="Buscar persona…" className="h-8 text-xs" />
                      {r.cands.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {r.cands.map((c) => (
                            <button key={c.id} type="button" onClick={() => patch(r.author, { personId: c.id, personName: c.name, include: true, editing: false })}
                              className="rounded-full border border-border px-2 py-0.5 text-[11px] hover:bg-brand-soft/30">{c.name}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>

            {hechos.length > 0 && !running && (
              <div className="mb-2 rounded-lg border border-good/40 bg-good/10 p-2.5 text-xs text-foreground">
                ✓ Listo — importado a {hechos.map((r) => r.personName).join(' y ')}. Mirá sus fichas; cada uno recibió SU parte de la conversación.
              </div>
            )}
            {prog?.phase === 'member' && <div className="text-[11px] text-muted-foreground mb-2">Atribuyendo a {prog.member}… {prog.done ?? 0}/{prog.total ?? 0}</div>}
            {prog?.phase === 'media' && <div className="text-[11px] text-muted-foreground mb-2">Leyendo {prog.label}… {prog.done ?? 0}/{prog.total ?? 0}</div>}
            {err && <div className="text-xs text-bad mb-2">{err}</div>}

            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] text-muted-foreground">
                {pendientes > 0 ? `${pendientes} miembro${pendientes === 1 ? '' : 's'} a atribuir` : (hechos.length > 0 ? 'todo importado' : 'sin miembros asignados')}
              </div>
              <Button size="sm" onClick={() => void procesar()} disabled={running || pendientes === 0}>
                {running ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Check size={14} className="mr-2" />}
                {hechos.length > 0 && pendientes === 0 ? 'Listo' : 'Procesar grupo'}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
