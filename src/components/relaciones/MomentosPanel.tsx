'use client'
// SIR V2 — MomentosPanel: registra "momentos / decisiones" con una persona —
// algo que pasó y queda ABIERTO hasta resolverse (ej. "le propuse mudarse, lo
// está pensando"). A diferencia de una interacción puntual, esto es un open
// loop que SIR debería recordarte. Lo abierto se ve arriba; al resolver, lo
// marcás con su desenlace.

import { useCallback, useEffect, useState } from 'react'
import { Flag, Plus, Loader2, Check, X, Clock } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import type { RelationshipMoment } from '@/lib/moments/types'

function todayLimaISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
function fmtDate(iso: string): string {
  try { return new Date(`${iso}T12:00:00Z`).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) } catch { return iso }
}

export function MomentosPanel({ personId }: { personId: string }) {
  const [moments, setMoments] = useState<RelationshipMoment[] | null>(null)
  const [show, setShow] = useState(false)
  const [title, setTitle] = useState('')
  const [detail, setDetail] = useState('')
  const [occurred, setOccurred] = useState(todayLimaISO())
  const [followUp, setFollowUp] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/moments?person_id=${encodeURIComponent(personId)}`)
      if (!res.ok) throw new Error('load')
      const j = (await res.json()) as { moments: RelationshipMoment[] }
      setMoments(j.moments)
    } catch { setMoments([]) }
  }, [personId])
  useEffect(() => { void load() }, [load])

  async function crear() {
    if (!title.trim() || saving) return
    setSaving(true); setErr(null)
    try {
      const res = await fetch('/api/moments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_id: personId, title: title.trim(), detail: detail.trim() || undefined, occurred_on: occurred, follow_up_on: followUp || undefined }),
      })
      if (!res.ok) { const b = await res.json().catch(() => ({})); setErr(b.detail || b.error || 'No se pudo guardar.'); return }
      const { moment } = (await res.json()) as { moment: RelationshipMoment }
      setMoments((prev) => [moment, ...(prev ?? [])])
      setTitle(''); setDetail(''); setOccurred(todayLimaISO()); setFollowUp(''); setShow(false)
    } catch { setErr('No se pudo guardar.') } finally { setSaving(false) }
  }

  async function resolver(id: string) {
    const resolution = window.prompt('¿Cómo se resolvió? (opcional)') ?? ''
    setMoments((prev) => (prev ?? []).map((m) => (m.id === id ? { ...m, status: 'resuelto', resolution: resolution || m.resolution } : m)))
    try {
      await fetch('/api/moments', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: 'resuelto', resolution: resolution || undefined }) })
    } catch { /* */ }
  }

  async function borrar(id: string) {
    setMoments((prev) => (prev ?? []).filter((m) => m.id !== id))
    try { await fetch(`/api/moments?id=${encodeURIComponent(id)}`, { method: 'DELETE' }) } catch { /* */ }
  }

  const abiertos = (moments ?? []).filter((m) => m.status === 'abierto')
  const resueltos = (moments ?? []).filter((m) => m.status === 'resuelto')

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Flag size={16} className="text-muted-foreground" aria-hidden="true" />
            <h3 className="text-base font-semibold">Momentos y decisiones</h3>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShow((s) => !s)}>
            {show ? <X size={14} className="mr-1.5" /> : <Plus size={14} className="mr-1.5" />}{show ? 'Cancelar' : 'Registrar'}
          </Button>
        </div>

        {show && (
          <div className="space-y-2 mb-4 rounded-lg border border-border p-3">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="¿Qué pasó? (ej: Le propuse que se mude conmigo)" />
            <textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={3}
              placeholder="Contexto (opcional): qué dijo, cómo quedó…"
              className="w-full rounded-lg border border-border bg-background p-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <label className="flex items-center gap-1.5">Cuándo <Input type="date" value={occurred} max={todayLimaISO()} onChange={(e) => setOccurred(e.target.value)} className="w-auto" /></label>
              <label className="flex items-center gap-1.5">Seguir el <Input type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} className="w-auto" /></label>
            </div>
            {err && <div className="text-xs text-bad">{err}</div>}
            <Button size="sm" onClick={crear} disabled={saving || !title.trim()}>
              {saving ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Check size={14} className="mr-2" />} Guardar
            </Button>
          </div>
        )}

        {moments === null ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>
        ) : moments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin momentos registrados. Anotá una decisión o conversación clave para que SIR la siga.</p>
        ) : (
          <div className="space-y-2">
            {abiertos.map((m) => (
              <div key={m.id} className="rounded-lg border border-brand/40 bg-brand-soft/20 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground">{m.title}</div>
                    {m.detail && <div className="text-[13px] text-muted-foreground mt-0.5">{m.detail}</div>}
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1">
                      <Badge variant="secondary" className="text-[10px]">abierto</Badge>
                      <span>{fmtDate(m.occurredOn)}</span>
                      {m.followUpOn && <span className="inline-flex items-center gap-1"><Clock size={11} /> seguir el {fmtDate(m.followUpOn)}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => void resolver(m.id)} className="text-[11px] text-good hover:underline">Resolver</button>
                    <button type="button" onClick={() => void borrar(m.id)} aria-label="Borrar" className="text-muted-foreground hover:text-bad"><X size={14} /></button>
                  </div>
                </div>
              </div>
            ))}
            {resueltos.map((m) => (
              <div key={m.id} className="rounded-lg border border-border p-3 opacity-75">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground line-through decoration-muted-foreground/40">{m.title}</div>
                    {m.resolution && <div className="text-[13px] text-foreground mt-0.5">→ {m.resolution}</div>}
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1">
                      <Badge variant="outline" className="text-[10px]">resuelto</Badge>
                      <span>{fmtDate(m.occurredOn)}</span>
                    </div>
                  </div>
                  <button type="button" onClick={() => void borrar(m.id)} aria-label="Borrar" className="text-muted-foreground hover:text-bad shrink-0"><X size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
