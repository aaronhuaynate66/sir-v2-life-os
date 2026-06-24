'use client'
// SIR V2 — ReferenciasEpisodio (Paso 3): rastrea dónde, en OTRAS conversaciones,
// se habla de este episodio. SIR barre el archivo por las keywords y PROPONE
// candidatos (persona + snippets fechados); el usuario CONFIRMA (nunca
// auto-link). Las confirmadas son el ALCANCE del episodio (su hilo en la vida).

import { useCallback, useEffect, useState } from 'react'
import { Radar, Loader2, Check, X, Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useRelationshipStore } from '@/stores'

interface SavedRef { id: string; person_id: string; snippet: string | null; ref_date: string | null }
interface Candidate { personId: string; personName: string; isParticipant: boolean; count: number; hits: { date: string | null; snippet: string }[] }

export function ReferenciasEpisodio({ momentId }: { momentId: string }) {
  const { people } = useRelationshipStore()
  const nameOf = useCallback((id: string) => people.find((p) => p.id === id)?.name ?? 'alguien', [people])
  const [saved, setSaved] = useState<SavedRef[]>([])
  const [open, setOpen] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [cands, setCands] = useState<Candidate[] | null>(null)
  const [kw, setKw] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const loadSaved = useCallback(async () => {
    try {
      const r = await fetch(`/api/moments/references?moment_id=${encodeURIComponent(momentId)}`)
      if (!r.ok) return
      const j = (await r.json()) as { references: SavedRef[] }
      setSaved(j.references ?? [])
    } catch { /* */ }
  }, [momentId])
  useEffect(() => { void loadSaved() }, [loadSaved])

  async function scan(q?: string) {
    setScanning(true); setCands(null)
    try {
      const url = `/api/moments/references?moment_id=${encodeURIComponent(momentId)}&scan=1${q ? `&q=${encodeURIComponent(q)}` : ''}`
      const r = await fetch(url)
      const j = (await r.json()) as { candidates: Candidate[]; keywords: string[] }
      if (!q && j.keywords?.length) setKw(j.keywords.join(' '))
      // Oculta los que ya están confirmados.
      const savedIds = new Set(saved.map((s) => s.person_id))
      setCands((j.candidates ?? []).filter((c) => !savedIds.has(c.personId)))
    } catch { setCands([]) } finally { setScanning(false) }
  }

  async function vincular(c: Candidate) {
    setBusy(c.personId)
    const top = c.hits[0]
    try {
      await fetch('/api/moments/references', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moment_id: momentId, person_id: c.personId, snippet: top?.snippet ?? null, ref_date: top?.date ?? null }),
      })
      setCands((prev) => (prev ?? []).filter((x) => x.personId !== c.personId))
      void loadSaved()
    } catch { /* */ } finally { setBusy(null) }
  }
  function descartar(personId: string) { setCands((prev) => (prev ?? []).filter((x) => x.personId !== personId)) }
  async function quitarRef(personId: string) {
    setSaved((prev) => prev.filter((s) => s.person_id !== personId))
    try { await fetch(`/api/moments/references?moment_id=${encodeURIComponent(momentId)}&person_id=${encodeURIComponent(personId)}`, { method: 'DELETE' }) } catch { /* */ }
  }

  const savedPeople = Array.from(new Set(saved.map((s) => s.person_id)))

  return (
    <div className="mt-2 border-t border-border/60 pt-2">
      {savedPeople.length > 0 && (
        <div className="text-[11px] text-muted-foreground mb-1.5">
          <span className="inline-flex items-center gap-1 text-foreground"><Link2 size={11} /> Mencionado en {savedPeople.length} {savedPeople.length === 1 ? 'conversación' : 'conversaciones'}:</span>{' '}
          {savedPeople.map((pid, i) => (
            <span key={pid}>{i > 0 ? ', ' : ''}<span className="text-foreground">{nameOf(pid)}</span> <button type="button" aria-label="quitar" onClick={() => void quitarRef(pid)} className="text-muted-foreground hover:text-bad">×</button></span>
          ))}
        </div>
      )}

      {!open ? (
        <button type="button" onClick={() => { setOpen(true); if (!cands) void scan() }} className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
          <Radar size={12} /> Rastrear referencias en otras conversaciones
        </button>
      ) : (
        <div className="rounded-lg border border-border p-2 mt-1">
          <div className="flex items-center gap-1.5 mb-2">
            <Input value={kw} onChange={(e) => setKw(e.target.value)} placeholder="palabras a buscar…" className="h-8 text-xs" />
            <Button size="sm" variant="outline" onClick={() => void scan(kw)} disabled={scanning}>
              {scanning ? <Loader2 size={13} className="animate-spin" /> : 'Buscar'}
            </Button>
            <button type="button" onClick={() => setOpen(false)} aria-label="cerrar" className="text-muted-foreground hover:text-bad"><X size={14} /></button>
          </div>

          {scanning ? (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Barriendo el archivo…</div>
          ) : cands && cands.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">Sin referencias nuevas en otras conversaciones.</p>
          ) : (
            <ul className="space-y-1.5">
              {(cands ?? []).map((c) => (
                <li key={c.personId} className="rounded border border-border/70 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-medium text-foreground">
                      {c.personName} {c.isParticipant && <Badge variant="secondary" className="text-[9px] ml-1">ya en el episodio</Badge>}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button type="button" onClick={() => void vincular(c)} disabled={busy === c.personId} className="text-[11px] text-good hover:underline inline-flex items-center gap-1">
                        {busy === c.personId ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Vincular
                      </button>
                      <button type="button" onClick={() => descartar(c.personId)} className="text-[11px] text-muted-foreground hover:text-bad">Descartar</button>
                    </div>
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {c.hits.slice(0, 3).map((h, i) => (
                      <div key={i} className="text-[10px] text-muted-foreground truncate">{h.date ? `[${h.date}] ` : ''}{h.snippet}</div>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
