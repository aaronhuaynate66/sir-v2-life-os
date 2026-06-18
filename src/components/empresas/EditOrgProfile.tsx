'use client'
// SIR V2 — Editar la info de una empresa/holding (escalón 3 + Fase B).
// Form colapsable prefijado → POST /api/empresas/profile → refresh.
// Fase B: autocompletar desde URL (meta best-effort) o pegando texto (IA
// estructura) → prefila los campos para REVISIÓN antes de guardar.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Loader2 } from 'lucide-react'

interface Props {
  slug: string
  label: string
  initial: { website?: string | null; description?: string | null; notes?: string | null; ruc?: string | null; address?: string | null; parentOrg?: string | null; tier?: string | null }
}

export function EditOrgProfile({ slug, label, initial }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [website, setWebsite] = useState(initial.website ?? '')
  const [description, setDescription] = useState(initial.description ?? '')
  const [notes, setNotes] = useState(initial.notes ?? '')
  const [ruc, setRuc] = useState(initial.ruc ?? '')
  const [address, setAddress] = useState(initial.address ?? '')
  const [parentOrg, setParentOrg] = useState(initial.parentOrg ?? '')
  const [tier, setTier] = useState(initial.tier ?? '')

  // Fase B — autocompletar.
  const [autoUrl, setAutoUrl] = useState(initial.website ?? '')
  const [autoText, setAutoText] = useState('')
  const [extracting, setExtracting] = useState<'url' | 'text' | null>(null)
  const [autoMsg, setAutoMsg] = useState<string | null>(null)

  async function extract(mode: 'url' | 'text') {
    if (extracting) return
    const payload =
      mode === 'url' ? { url: autoUrl.trim(), label } : { text: autoText.trim(), label }
    if (mode === 'url' && !payload.url) return
    if (mode === 'text' && !payload.text) return
    setExtracting(mode)
    setAutoMsg(null)
    try {
      const res = await fetch('/api/empresas/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = (await res.json().catch(() => ({}))) as {
        website?: string
        description?: string
        notes?: string
        error?: string
        detail?: string
      }
      if (!res.ok) {
        setAutoMsg(data.error ?? 'No se pudo autocompletar')
        return
      }
      if (data.website) setWebsite((w) => w || data.website!)
      if (data.description) setDescription(data.description)
      if (data.notes) setNotes((n) => (n ? `${n}\n${data.notes}` : data.notes!))
      setAutoMsg('Listo — revisá los campos abajo y guardá.')
    } catch {
      setAutoMsg('No se pudo autocompletar')
    } finally {
      setExtracting(null)
    }
  }

  async function save() {
    if (saving) return
    setSaving(true)
    try {
      const res = await fetch('/api/empresas/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, name: label, website, description, notes, ruc, address, parentOrg, tier }),
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
      {/* Fase B — autocompletar */}
      <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          Autocompletar
        </div>
        <div className="flex gap-2">
          <input
            value={autoUrl}
            onChange={(e) => setAutoUrl(e.target.value)}
            placeholder="https://… (trae lo público de la web)"
            className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
          />
          <button
            type="button"
            onClick={() => void extract('url')}
            disabled={extracting !== null || !autoUrl.trim()}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {extracting === 'url' ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Traer de la URL
          </button>
        </div>
        <textarea
          value={autoText}
          onChange={(e) => setAutoText(e.target.value)}
          rows={3}
          placeholder="…o pegá acá el texto de la web/LinkedIn (Quiénes somos, portafolio) y la IA lo estructura. Más confiable que la URL en sitios modernos."
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void extract('text')}
            disabled={extracting !== null || !autoText.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-sm text-brand-foreground disabled:opacity-50"
          >
            {extracting === 'text' ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Extraer del texto
          </button>
          {autoMsg && <span className="text-xs text-muted-foreground">{autoMsg}</span>}
        </div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground">Sitio web</label>
        <input
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="https://…"
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">RUC</label>
          <input
            value={ruc}
            onChange={(e) => setRuc(e.target.value)}
            placeholder="20510106394"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Tier / tamaño</label>
          <input
            value={tier}
            onChange={(e) => setTier(e.target.value)}
            placeholder="chico / mediano / grande"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
        </div>
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Dirección fiscal</label>
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Av. … Distrito, Ciudad"
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Empresa matriz / holding</label>
        <input
          value={parentOrg}
          onChange={(e) => setParentOrg(e.target.value)}
          placeholder="ej. PPX Mining Corp"
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
