'use client'
// SIR V2 — Avatar EDITABLE de una persona (ficha): muestra la foto si hay,
// con overlay para subir/cambiar. Lee de /api/avatars?person_id y sube vía
// uploadAvatar. Fallback a iniciales (componente Avatar base).

import { useEffect, useRef, useState } from 'react'
import { Camera, Loader2 } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { uploadAvatar } from '@/lib/avatars/client'

export function PersonAvatar({ personId, name, size = 'lg' }: { personId: string; name: string; size?: 'sm' | 'md' | 'lg' }) {
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch(`/api/avatars?person_id=${encodeURIComponent(personId)}`)
        const j = (await res.json()) as { avatars?: Record<string, string> }
        if (alive) setUrl(j.avatars?.[personId] ?? null)
      } catch { /* */ }
    })()
    return () => { alive = false }
  }, [personId])

  async function onPick(file: File) {
    if (busy) return
    setBusy(true)
    try { const u = await uploadAvatar(personId, file); if (u) setUrl(u) }
    catch { /* silencioso: el avatar es opcional */ }
    finally { setBusy(false) }
  }

  return (
    <div className="relative group">
      <Avatar name={name} size={size} src={url} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label="Cambiar foto"
        className="absolute -bottom-1 -right-1 rounded-full bg-background border border-border p-1 text-muted-foreground hover:text-foreground shadow-sm"
      >
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
      </button>
      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPick(f); e.currentTarget.value = '' }} />
    </div>
  )
}
