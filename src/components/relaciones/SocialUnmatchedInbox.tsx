'use client'

// SIR V2 — Bandeja "¿quién es quién?": actividad social (IG/LinkedIn) que el
// reader vio pero no pudo asignar a un contacto (cuentas que Aaron sigue sin
// handle seteado). Asignar una setea el instagram_handle de la persona y promueve
// sus señales a contact_activity → de ahí en más matchea sola. Descartar la saca
// (negocio/desconocido). Se oculta si no hay nada. Ver /api/social/unmatched.

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { UserSearch, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Person } from '@/types'

interface UnmatchedItem {
  id: string
  platform: string
  handle: string | null
  name: string | null
  kind: string
  detail: string | null
  observed_at: string
}

const KIND_LABEL: Record<string, string> = {
  available: 'tiene historia',
  traveling: 'de viaje',
  job_change: 'cambió de trabajo',
}

export function SocialUnmatchedInbox({ people }: { people: Person[] }) {
  const [items, setItems] = useState<UnmatchedItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [pick, setPick] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    fetch('/api/social/unmatched')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d && Array.isArray(d.items)) setItems(d.items as UnmatchedItem[]) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [])

  const sortedPeople = [...people].sort((a, b) => a.name.localeCompare(b.name))

  async function assign(item: UnmatchedItem) {
    const personId = pick[item.id]
    if (!personId) { toast.error('Elegí a quién asignar'); return }
    setBusy(item.id)
    try {
      const r = await fetch('/api/social/unmatched', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, personId }),
      })
      if (!r.ok) { toast.error('No se pudo asignar'); return }
      const who = people.find((p) => p.id === personId)?.name ?? 'la persona'
      const d = await r.json().catch(() => ({}))
      toast.success(`Asignado a ${who}${d?.promoted ? ` · ${d.promoted} señal(es) guardada(s)` : ''}`)
      setItems((prev) => prev.filter((i) => i.id !== item.id))
    } catch {
      toast.error('Error de red')
    } finally {
      setBusy(null)
    }
  }

  async function dismiss(item: UnmatchedItem) {
    setBusy(item.id)
    try {
      const r = await fetch('/api/social/unmatched', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
      })
      if (!r.ok) { toast.error('No se pudo descartar'); return }
      setItems((prev) => prev.filter((i) => i.id !== item.id))
    } catch {
      toast.error('Error de red')
    } finally {
      setBusy(null)
    }
  }

  if (!loaded || items.length === 0) return null

  return (
    <Card className="border-brand/30">
      <CardContent className="p-4">
        <div className="mb-1 flex items-center gap-2">
          <UserSearch size={16} className="text-brand" />
          <h3 className="text-sm font-semibold">¿Quién es quién?</h3>
          <Badge variant="secondary" className="text-[10px]">{items.length}</Badge>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          SIR vio actividad de estas cuentas que sigues pero no las tiene asignadas. Asigná
          la que sea un contacto (queda enlazada para siempre) o descartá las que no.
        </p>
        <div className="space-y-2">
          {items.map((it) => (
            <div key={it.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span className="truncate">{it.handle ? `@${it.handle}` : (it.name || 'sin nombre')}</span>
                  <Badge variant="outline" className="shrink-0 text-[10px]">{KIND_LABEL[it.kind] ?? it.kind}</Badge>
                </div>
                {it.detail && <div className="truncate text-xs text-muted-foreground">{it.detail}</div>}
              </div>
              <Select value={pick[it.id] ?? ''} onValueChange={(v) => setPick((p) => ({ ...p, [it.id]: v }))}>
                <SelectTrigger className="h-9 w-[160px] text-xs"><SelectValue placeholder="Asignar a…" /></SelectTrigger>
                <SelectContent>
                  {sortedPeople.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" className="h-9" disabled={busy === it.id || !pick[it.id]} onClick={() => assign(it)}>
                Asignar
              </Button>
              <Button size="sm" variant="ghost" className="h-9 w-9 p-0" disabled={busy === it.id} onClick={() => dismiss(it)} aria-label="Descartar">
                <X size={15} />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
