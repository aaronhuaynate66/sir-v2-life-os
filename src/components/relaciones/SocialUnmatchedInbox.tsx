'use client'

// SIR V2 — Bandeja "¿quién es quién?": actividad social (IG/LinkedIn) que el
// reader vio pero no pudo asignar a un contacto (cuentas que Aaron sigue sin
// handle seteado). Tres caminos para NO perder tiempo:
//   1. SIR SUGIERE el contacto probable (nombre pegado en el handle) → 1 toque.
//   2. Elegir a mano del combo (fallback).
//   3. CREAR la persona ahí mismo si no existe (Aaron: "crear a esa persona").
// Asignar setea el instagram_handle → de ahí en más matchea sola. Descartar la
// saca (negocio/desconocido). Los sugeridos van primero; el ruido cae al fondo.
// Se oculta si no hay nada. Ver /api/social/unmatched.

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { UserSearch, X, Sparkles, UserPlus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useRelationshipStore } from '@/stores/useRelationshipStore'
import { suggestPersonForHandle } from '@/lib/social-reader/suggestMatch'
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
  const addPerson = useRelationshipStore((s) => s.addPerson)
  const [items, setItems] = useState<UnmatchedItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [pick, setPick] = useState<Record<string, string>>({})
  const [creatingFor, setCreatingFor] = useState<string | null>(null)
  const [newName, setNewName] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    fetch('/api/social/unmatched')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d && Array.isArray(d.items)) setItems(d.items as UnmatchedItem[]) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [])

  const sortedPeople = useMemo(() => [...people].sort((a, b) => a.name.localeCompare(b.name)), [people])

  // Sugerencia de contacto por item (nombre pegado en el handle / nombre capturado).
  const suggestions = useMemo(() => {
    const lite = people.map((p) => ({ id: p.id, name: p.name, instagramHandle: p.instagramHandle }))
    const map: Record<string, ReturnType<typeof suggestPersonForHandle>> = {}
    for (const it of items) map[it.id] = suggestPersonForHandle({ handle: it.handle, name: it.name }, lite)
    return map
  }, [items, people])

  // Sugeridos primero: los contactos reales suben, el ruido (empresas/desconocidos) baja.
  const ordered = useMemo(
    () => [...items].sort((a, b) => (suggestions[a.id] ? 0 : 1) - (suggestions[b.id] ? 0 : 1)),
    [items, suggestions],
  )

  async function assignTo(item: UnmatchedItem, personId: string, personName: string) {
    setBusy(item.id)
    try {
      const r = await fetch('/api/social/unmatched', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, personId }),
      })
      if (!r.ok) { toast.error('No se pudo asignar'); return }
      const d = await r.json().catch(() => ({}))
      toast.success(`Asignado a ${personName}${d?.promoted ? ` · ${d.promoted} señal(es) guardada(s)` : ''}`)
      setItems((prev) => prev.filter((i) => i.id !== item.id))
    } catch {
      toast.error('Error de red')
    } finally {
      setBusy(null)
    }
  }

  function assignManual(item: UnmatchedItem) {
    const personId = pick[item.id]
    if (!personId) { toast.error('Elige a quién asignar'); return }
    const who = people.find((p) => p.id === personId)?.name ?? 'la persona'
    void assignTo(item, personId, who)
  }

  async function createContact(item: UnmatchedItem) {
    const name = (newName[item.id] ?? '').trim()
    if (name.length < 2) { toast.error('Escribe el nombre'); return }
    setBusy(item.id)
    const canon = item.handle ? item.handle.replace(/^@/, '').trim().toLowerCase() : undefined
    const taken = new Set(people.map((p) => p.slug).filter(Boolean) as string[])
    let slug = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    while (slug && taken.has(slug)) slug = `${slug}-${Math.random().toString(36).slice(2, 5)}`
    const pid = crypto.randomUUID()
    try {
      const r = await fetch('/api/social/unmatched', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, newPerson: { id: pid, name, slug } }),
      })
      if (!r.ok) { toast.error('No se pudo crear'); return }
      const d = await r.json().catch(() => ({}))
      const now = new Date().toISOString()
      addPerson({
        id: pid, slug: slug || undefined, name,
        relationship: 'acquaintance', category: 'network',
        importanceScore: 5, energyImpact: 'neutral', trustLevel: 5,
        contactFrequency: '', tags: [],
        instagramHandle: canon,
        notes: 'Creado desde ¿quién es quién?',
        createdAt: now, updatedAt: now,
      } as Person)
      toast.success(`Creé a ${name}${canon ? ` (@${canon})` : ''}${d?.promoted ? ` · ${d.promoted} señal(es)` : ''}`)
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
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
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
          SIR vio actividad de estas cuentas que sigues pero no las tiene asignadas. Cuando puede,
          te sugiere quién es (1 toque). Asigna la que sea un contacto, créala si no existe, o descarta el resto.
        </p>
        <div className="space-y-2">
          {ordered.map((it) => {
            const sug = suggestions[it.id]
            const isCreating = creatingFor === it.id
            return (
              <div key={it.id} className="rounded-lg border border-border p-2.5">
                {/* Identificador: su propia línea, ancho completo. */}
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <span className="truncate">{it.handle ? `@${it.handle}` : (it.name || 'sin nombre')}</span>
                  <Badge variant="outline" className="shrink-0 text-[10px]">{KIND_LABEL[it.kind] ?? it.kind}</Badge>
                </div>
                {it.detail && <div className="mb-2 truncate text-xs text-muted-foreground">{it.detail}</div>}

                {/* Sugerencia de SIR: 1 toque para confirmar. */}
                {sug && (
                  <div className="mb-2 flex items-center gap-2 rounded-md border border-brand/30 bg-brand-soft/40 px-2 py-1.5">
                    <Sparkles size={13} className="shrink-0 text-brand" />
                    <span className="min-w-0 flex-1 truncate text-xs">
                      ¿Es <span className="font-medium">{sug.personName}</span>?
                      {sug.confidence === 'media' && <span className="text-muted-foreground"> (probable)</span>}
                    </span>
                    <Button size="sm" className="h-8 shrink-0" disabled={busy === it.id} onClick={() => assignTo(it, sug.personId, sug.personName)}>
                      Sí, asignar
                    </Button>
                  </div>
                )}

                {/* Elegir a mano (fallback). */}
                <div className="flex items-center gap-2">
                  <Select value={pick[it.id] ?? ''} onValueChange={(v) => setPick((p) => ({ ...p, [it.id]: v }))}>
                    <SelectTrigger className="h-10 min-w-0 flex-1 text-xs"><SelectValue placeholder={sug ? 'o elige a otro…' : 'Asignar a…'} /></SelectTrigger>
                    <SelectContent>
                      {sortedPeople.map((p) => (
                        <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" className="h-10 shrink-0" disabled={busy === it.id || !pick[it.id]} onClick={() => assignManual(it)}>
                    Asignar
                  </Button>
                  <Button size="sm" variant="ghost" className="h-10 w-10 shrink-0 p-0" disabled={busy === it.id} onClick={() => dismiss(it)} aria-label="Descartar">
                    <X size={16} />
                  </Button>
                </div>

                {/* Crear contacto nuevo (no existe todavía). */}
                {isCreating ? (
                  <div className="mt-2 flex items-center gap-2">
                    <Input
                      autoFocus
                      value={newName[it.id] ?? ''}
                      onChange={(e) => setNewName((n) => ({ ...n, [it.id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') void createContact(it) }}
                      placeholder="Nombre y apellido"
                      className="h-9 min-w-0 flex-1 text-xs"
                    />
                    <Button size="sm" className="h-9 shrink-0" disabled={busy === it.id} onClick={() => createContact(it)}>Crear</Button>
                    <Button size="sm" variant="ghost" className="h-9 shrink-0" onClick={() => setCreatingFor(null)}>Cancelar</Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                    onClick={() => { setCreatingFor(it.id); setNewName((n) => ({ ...n, [it.id]: n[it.id] ?? it.name ?? '' })) }}
                  >
                    <UserPlus size={12} /> Crear contacto nuevo
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
