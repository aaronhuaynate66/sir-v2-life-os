'use client'
// SIR V2 — Crear una organización desde cero en /empresas.
// Escribís el nombre → crea un org_profile (POST /api/empresas/profile) → te
// lleva a su ficha vacía, lista para rellenar/autocompletar. No depende de que
// haya personas con ese org_group.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { generateSlug } from '@/lib/people/slug'

export function NuevaOrganizacion() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create() {
    const n = name.trim()
    if (n.length < 2 || saving) return
    const slug = generateSlug(n)
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/empresas/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ slug, name: n }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setError(b?.error ?? 'No se pudo crear'); return
      }
      router.push(`/empresas/${slug}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus size={14} className="mr-1.5" /> Nueva organización
      </Button>
    )
  }
  return (
    <div className="flex items-center gap-2">
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') create(); if (e.key === 'Escape') { setOpen(false); setName('') } }}
        placeholder="Nombre de la organización…"
        disabled={saving}
        className="h-9 w-56"
      />
      <Button size="sm" onClick={create} disabled={saving || name.trim().length < 2}>
        {saving ? 'Creando…' : 'Crear'}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => { setOpen(false); setName(''); setError(null) }} disabled={saving}>
        Cancelar
      </Button>
      {error && <span className="text-xs text-bad">{error}</span>}
    </div>
  )
}
