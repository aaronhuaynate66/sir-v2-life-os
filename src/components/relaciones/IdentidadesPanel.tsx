'use client'
// SIR V2 — IdentidadesPanel: cómo se llama esta persona en cada red (WhatsApp,
// Instagram, etc.). Sirve para HOMOLOGAR zips/capturas a la persona correcta —
// si le enseñás que en WhatsApp es "Papa", el próximo zip de "Papa" se rutea
// solo. Auto-rutear solo con alias EXACTO y ÚNICO (la API rechaza fusionar el
// mismo alias en dos personas).

import { useCallback, useEffect, useState } from 'react'
import { AtSign, Plus, Loader2, X, Check } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { IDENTITY_NETWORKS, NETWORK_LABEL, type IdentityNetwork, type PersonIdentity } from '@/lib/identities/types'

export function IdentidadesPanel({ personId }: { personId: string }) {
  const [items, setItems] = useState<PersonIdentity[] | null>(null)
  const [show, setShow] = useState(false)
  const [network, setNetwork] = useState<IdentityNetwork>('whatsapp')
  const [identifier, setIdentifier] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/person-identities?person_id=${encodeURIComponent(personId)}`)
      if (!r.ok) throw new Error('load')
      const j = (await r.json()) as { identities: PersonIdentity[] }
      setItems(j.identities)
    } catch { setItems([]) }
  }, [personId])
  useEffect(() => { void load() }, [load])

  async function agregar() {
    if (!identifier.trim() || saving) return
    setSaving(true); setErr(null)
    try {
      const r = await fetch('/api/person-identities', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_id: personId, network, identifier: identifier.trim() }),
      })
      if (!r.ok) { const b = await r.json().catch(() => ({})); setErr(b.error || 'No se pudo guardar.'); return }
      const { identity } = (await r.json()) as { identity: PersonIdentity }
      setItems((prev) => {
        const rest = (prev ?? []).filter((i) => i.id !== identity.id)
        return [...rest, identity]
      })
      setIdentifier('')
    } catch { setErr('No se pudo guardar.') } finally { setSaving(false) }
  }

  async function borrar(id: string) {
    setItems((prev) => (prev ?? []).filter((i) => i.id !== id))
    try { await fetch(`/api/person-identities?id=${encodeURIComponent(id)}`, { method: 'DELETE' }) } catch { /* */ }
  }

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <AtSign size={16} className="text-muted-foreground" aria-hidden="true" />
            <h3 className="text-base font-semibold">Identidades por red</h3>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShow((s) => !s)}>
            {show ? <X size={14} className="mr-1.5" /> : <Plus size={14} className="mr-1.5" />}{show ? 'Cancelar' : 'Agregar'}
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground mb-3 leading-relaxed">
          Cómo está guardada esta persona en cada red. Si en WhatsApp es «Papa», SIR rutea su zip solo la próxima vez.
        </p>

        {show && (
          <div className="space-y-2 mb-4 rounded-lg border border-border p-3">
            <div className="flex gap-2">
              <select value={network} onChange={(e) => setNetwork(e.target.value as IdentityNetwork)}
                className="rounded-lg border border-border bg-background px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                {IDENTITY_NETWORKS.map((n) => <option key={n} value={n}>{NETWORK_LABEL[n]}</option>)}
              </select>
              <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="Nombre/usuario en esa red (ej: Papa)" />
            </div>
            {err && <div className="text-xs text-bad">{err}</div>}
            <Button size="sm" onClick={agregar} disabled={saving || !identifier.trim()}>
              {saving ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Check size={14} className="mr-2" />} Guardar
            </Button>
          </div>
        )}

        {items === null ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin alias guardados. Agregá cómo se llama en WhatsApp/Instagram para homologar su info.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {items.map((i) => (
              <Badge key={i.id} variant="secondary" className="gap-1.5 py-1">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{NETWORK_LABEL[i.network]}</span>
                <span className="font-medium">{i.identifier}</span>
                <button type="button" aria-label="Quitar" onClick={() => void borrar(i.id)} className="hover:text-bad"><X size={12} /></button>
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
