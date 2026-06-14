'use client'
// SIR V2 — Editar la info de una empresa/holding (escalón 3, carga manual).
// Form colapsable prefijado → POST /api/empresas/profile → refresh.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Loader2 } from 'lucide-react'

interface Props {
  slug: string
  label: string
  initial: { website?: string | null; description?: string | null; notes?: string | null }
}

export function EditOrgProfile({ slug, label, initial }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [website, setWebsite] = useState(initial.website ?? '')
  const [description, setDescription] = useState(initial.description ?? '')
  const [notes, setNotes] = useState(initial.notes ?? '')

  async function save() {
    if (saving) return
    setSaving(true)
    try {
      const res = await fetch('/api/empresas/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, name: label, website, description, notes }),
      })
      if (res.ok) {
        setOpen(false)
        router.refresh()
      }
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <Pencil className="h-3.5 w-3.5" /> Editar info de la empresa
      </button>
    )
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div>
        <label className="text-xs text-muted-foreground">Sitio web</label>
        <input
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="https://…"
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Descripción</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Qué es la empresa / grupo…"
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Notas</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Sectores, sub-empresas, contexto, lo que quieras recordar…"
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-sm text-brand-foreground disabled:opacity-50"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Guardar
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={saving}
          className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}
