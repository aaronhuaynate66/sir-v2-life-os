'use client'
// SIR V2 — Pre-Mortem de decisiones (Motor #3). Antes de un movimiento grande,
// SIR proyecta la consecuencia más probable DESDE tu propio patrón. Ahora podés
// GUARDAR la decisión + la proyección, y después registrar qué pasó realmente
// para comparar predicción vs realidad y aprender de tus decisiones.

import { useCallback, useEffect, useState } from 'react'
import { GitBranch, Loader2, Save, History, Check, Trash2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SectionTitle } from '@/components/ui/section-title'

interface PreMortem { id: string; decision: string; projection: string; outcome: string | null; createdAt: string; reviewedAt: string | null }

export function PreMortemPanel() {
  const [decision, setDecision] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const [history, setHistory] = useState<PreMortem[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [outcomeDraft, setOutcomeDraft] = useState<Record<string, string>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/self/premortems')
      if (!res.ok) return
      const j = (await res.json()) as { premortems: PreMortem[] }
      setHistory(j.premortems ?? [])
    } catch { /* */ }
  }, [])
  useEffect(() => { void loadHistory() }, [loadHistory])

  async function run() {
    if (!decision.trim() || busy) return
    setBusy(true); setErr(null); setResult(null); setSaved(false)
    try {
      const res = await fetch('/api/self/premortem', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: decision.trim() }),
      })
      const j = (await res.json()) as { premortem?: string; error?: string }
      if (!res.ok || !j.premortem) { setErr(j.error ?? 'No se pudo correr'); return }
      setResult(j.premortem)
    } catch { setErr('No se pudo correr') } finally { setBusy(false) }
  }

  async function save() {
    if (!result || !decision.trim() || busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/self/premortems', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: decision.trim(), projection: result }),
      })
      if (res.ok) { setSaved(true); await loadHistory() }
    } finally { setBusy(false) }
  }

  async function saveOutcome(id: string) {
    const outcome = (outcomeDraft[id] ?? '').trim()
    if (!outcome) return
    try {
      await fetch('/api/self/premortems', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, outcome }),
      })
      setOutcomeDraft((d) => { const n = { ...d }; delete n[id]; return n })
      await loadHistory()
    } catch { /* */ }
  }

  async function remove(id: string) {
    try { await fetch(`/api/self/premortems?id=${encodeURIComponent(id)}`, { method: 'DELETE' }); await loadHistory() } catch { /* */ }
  }

  const fmtDate = (iso: string) => { try { return new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }) } catch { return '' } }

  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <SectionTitle icon={GitBranch} label="Pre-mortem de una decisión" />
        <p className="mt-1 text-[13px] text-muted-foreground">
          ¿Qué estás por decidir? SIR proyecta cómo termina, según tu propio patrón.
        </p>
        <textarea
          value={decision}
          onChange={(e) => setDecision(e.target.value)}
          rows={3}
          placeholder="Ej: irme al Mundial aunque mi familia está en contra…"
          className="mt-3 w-full resize-none rounded-lg border border-border bg-background p-3 text-[14px] outline-none focus:border-foreground/30"
        />
        <Button size="sm" className="mt-2" disabled={busy || !decision.trim()} onClick={run}>
          {busy ? <Loader2 size={14} className="mr-1 animate-spin" /> : null}
          {busy ? 'Proyectando…' : 'Correr pre-mortem'}
        </Button>
        {err && <p className="mt-2 text-[13px] text-red-500">{err}</p>}
        {result && (
          <>
            <div className="mt-3 whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3 text-[13.5px] leading-relaxed text-foreground/90">
              {result}
            </div>
            <div className="mt-2">
              {saved ? (
                <span className="inline-flex items-center gap-1 text-[12px]" style={{ color: '#2dd4a7' }}>
                  <Check size={13} /> Guardado — lo revisás más adelante
                </span>
              ) : (
                <Button size="sm" variant="secondary" disabled={busy} onClick={save}>
                  <Save size={13} className="mr-1" /> Guardar para revisar después
                </Button>
              )}
            </div>
          </>
        )}

        {/* Historial de decisiones proyectadas */}
        {history.length > 0 && (
          <div className="mt-4 border-t border-border pt-3">
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="flex w-full items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground hover:text-foreground"
            >
              <History size={13} /> Decisiones que proyectaste ({history.length})
            </button>

            {showHistory && (
              <div className="mt-3 space-y-3">
                {history.map((p) => {
                  const open = expanded.has(p.id)
                  return (
                    <div key={p.id} className="rounded-lg border border-border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <button type="button" className="text-left" onClick={() => setExpanded((s) => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n })}>
                          <p className="text-[13.5px] font-medium text-foreground/90">{p.decision}</p>
                          <p className="text-[11px] text-muted-foreground">{fmtDate(p.createdAt)}{p.outcome ? ' · revisado' : ' · sin revisar'}</p>
                        </button>
                        <button type="button" onClick={() => remove(p.id)} className="shrink-0 text-muted-foreground/60 hover:text-red-500" title="Borrar">
                          <Trash2 size={13} />
                        </button>
                      </div>

                      {open && (
                        <p className="mt-2 whitespace-pre-wrap border-t border-border pt-2 text-[12.5px] leading-relaxed text-muted-foreground">
                          {p.projection}
                        </p>
                      )}

                      {p.outcome ? (
                        <div className="mt-2 rounded-md border p-2 text-[12.5px]" style={{ borderColor: '#2dd4a755' }}>
                          <span className="text-[10px] uppercase tracking-wide" style={{ color: '#2dd4a7' }}>Qué pasó realmente</span>
                          <p className="mt-0.5 text-foreground/85">{p.outcome}</p>
                        </div>
                      ) : (
                        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                          <Input
                            placeholder="¿Qué pasó realmente?"
                            value={outcomeDraft[p.id] ?? ''}
                            onChange={(e) => setOutcomeDraft((d) => ({ ...d, [p.id]: e.target.value }))}
                            className="text-[13px]"
                          />
                          <Button size="sm" variant="secondary" disabled={!(outcomeDraft[p.id] ?? '').trim()} onClick={() => saveOutcome(p.id)}>
                            Registrar
                          </Button>
                        </div>
                      )}
                    </div>
                  )
                })}
                <p className="text-[11px] text-muted-foreground/70">
                  Comparar lo que SIR proyectó con lo que pasó afina tu propio criterio.
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
