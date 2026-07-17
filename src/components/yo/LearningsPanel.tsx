'use client'
// SIR V2 — LearningsPanel (Fase 3d): lo que SIR aprendió de vos.
//
// Transparencia + control: Aaron VE las lecciones durables que SIR destiló de sus
// relatos y las aplica al aconsejar, y puede archivarlas/borrarlas o agregar una a
// mano. No es caja negra — lo que SIR "sabe" de él es editable por él.

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Brain, Plus, Archive, ArchiveRestore, Trash2, Loader2 } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { LEARNING_KIND_LABEL, type LearningDto, type LearningKind } from '@/lib/learnings/types'

const KINDS: LearningKind[] = ['preference', 'pattern', 'principle', 'fact']

export function LearningsPanel() {
  const [items, setItems] = useState<LearningDto[]>([])
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newText, setNewText] = useState('')
  const [newKind, setNewKind] = useState<LearningKind>('preference')
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    fetch(`/api/learnings${showArchived ? '?all=1' : ''}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && Array.isArray(d.learnings)) setItems(d.learnings as LearningDto[]) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [showArchived])
  useEffect(() => load(), [load])

  async function add() {
    const t = newText.trim()
    if (!t) { toast.error('Escribe la lección'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/learnings', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: t, kind: newKind }),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); toast.error('No se pudo guardar', { description: e?.error }); return }
      toast.success('Lección agregada')
      setNewText(''); setAdding(false); load()
    } catch { toast.error('No se pudo guardar') } finally { setSaving(false) }
  }

  async function setActive(id: string, isActive: boolean) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/learnings/${id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ isActive }),
      })
      if (!res.ok) throw new Error()
      toast.success(isActive ? 'Reactivada' : 'Archivada — SIR ya no la usa')
      load()
    } catch { toast.error('No se pudo actualizar'); load() } finally { setBusyId(null) }
  }

  async function remove(id: string) {
    setBusyId(id)
    setItems((prev) => prev.filter((x) => x.id !== id))
    try {
      const res = await fetch(`/api/learnings/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Borrada')
    } catch { toast.error('No se pudo borrar'); load() } finally { setBusyId(null) }
  }

  const active = items.filter((l) => l.isActive)
  const archived = items.filter((l) => !l.isActive)

  return (
    <Card className="shadow-none mb-6">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2">
            <Brain size={15} strokeWidth={1.75} className="text-muted-foreground/80" aria-hidden="true" />
            <span className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Lo que SIR aprendió de ti</span>
          </div>
          {!adding && (
            <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
              <Plus size={13} strokeWidth={1.75} className="mr-1" /> Agregar
            </Button>
          )}
        </div>
        <p className="text-[12px] text-muted-foreground leading-relaxed mb-3">
          Lecciones durables sobre ti (preferencias, patrones, principios) que SIR tiene presentes al aconsejar.
          Las captura de lo que le cuentas — acá las ves y decides cuáles valen.
        </p>

        {adding && (
          <div className="mb-4 space-y-2 rounded-md border border-border/60 p-3">
            <Input value={newText} onChange={(e) => setNewText(e.target.value)} placeholder="Ej: Aaron prefiere findes largos para viajar" autoFocus maxLength={500} />
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex gap-1">
                {KINDS.map((k) => (
                  <button key={k} type="button" onClick={() => setNewKind(k)}
                    className={cn('rounded-full border px-2 py-0.5 text-[10px] transition-colors',
                      newKind === k ? 'border-brand/50 bg-brand/10 text-brand' : 'border-border text-muted-foreground hover:text-foreground')}>
                    {LEARNING_KIND_LABEL[k]}
                  </button>
                ))}
              </div>
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setNewText('') }} disabled={saving}>Cancelar</Button>
                <Button size="sm" onClick={add} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-1.5" aria-hidden="true">{[0, 1, 2].map((i) => <div key={i} className="h-10 rounded-md bg-muted/25 animate-pulse" />)}</div>
        ) : active.length === 0 && !adding ? (
          <p className="text-sm text-muted-foreground italic leading-relaxed">
            SIR todavía no aprendió nada durable de ti. Cuéntale por chat o WhatsApp algo estable —
            «prefiero X», «me pasa que Y», «este año priorizo Z» — y aparece acá.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {active.map((l) => (
              <LearningRow key={l.id} l={l} busy={busyId === l.id} onArchive={() => setActive(l.id, false)} onDelete={() => remove(l.id)} />
            ))}
          </ul>
        )}

        {/* Archivadas */}
        {(archived.length > 0 || showArchived) && (
          <button type="button" onClick={() => setShowArchived((v) => !v)}
            className="mt-3 text-[11px] text-muted-foreground hover:text-foreground">
            {showArchived ? 'Ocultar archivadas' : 'Ver archivadas'}
          </button>
        )}
        {showArchived && archived.length > 0 && (
          <ul className="mt-2 space-y-1.5 opacity-70">
            {archived.map((l) => (
              <LearningRow key={l.id} l={l} busy={busyId === l.id} archived onRestore={() => setActive(l.id, true)} onDelete={() => remove(l.id)} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function LearningRow({ l, busy, archived, onArchive, onRestore, onDelete }: {
  l: LearningDto
  busy: boolean
  archived?: boolean
  onArchive?: () => void
  onRestore?: () => void
  onDelete: () => void
}) {
  return (
    <li className="flex items-start justify-between gap-3 rounded-md border border-border/40 px-3 py-2">
      <div className="min-w-0">
        <div className="text-sm text-foreground leading-snug">{l.text}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="rounded-full border border-border/60 px-1.5 py-0.5">{LEARNING_KIND_LABEL[l.kind]}</span>
          {l.reinforcedCount > 1 && <span title="Veces que lo repetiste/confirmaste">×{l.reinforcedCount}</span>}
          {l.source === 'manual' && <span className="opacity-70">a mano</span>}
        </div>
      </div>
      <div className="flex-shrink-0 flex items-center gap-0.5">
        {busy && <Loader2 size={13} className="animate-spin text-muted-foreground" aria-hidden="true" />}
        {archived ? (
          <button type="button" onClick={onRestore} disabled={busy} className="flex items-center justify-center h-8 w-8 -m-1 rounded text-muted-foreground/60 hover:text-foreground" aria-label="Reactivar lección" title="Reactivar">
            <ArchiveRestore size={13} strokeWidth={1.75} />
          </button>
        ) : (
          <button type="button" onClick={onArchive} disabled={busy} className="flex items-center justify-center h-8 w-8 -m-1 rounded text-muted-foreground/60 hover:text-foreground" aria-label="Archivar lección" title="Archivar (SIR deja de usarla)">
            <Archive size={13} strokeWidth={1.75} />
          </button>
        )}
        <button type="button" onClick={onDelete} disabled={busy} className="flex items-center justify-center h-8 w-8 -m-1 rounded text-muted-foreground/40 hover:text-bad" aria-label="Borrar lección" title="Borrar">
          <Trash2 size={13} strokeWidth={1.75} />
        </button>
      </div>
    </li>
  )
}
