'use client'
// SIR V2 — Avatar EDITABLE de una persona (ficha): muestra la foto si hay,
// con overlay para subir/cambiar. Lee de /api/avatars?person_id y sube vía
// uploadAvatar. Fallback a iniciales (componente Avatar base).

import { useEffect, useRef, useState } from 'react'
import { Camera, Wand2, Loader2 } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { AvatarCropper } from './AvatarCropper'

export function PersonAvatar({ personId, name, size = 'lg' }: { personId: string; name: string; size?: 'sm' | 'md' | 'lg' }) {
  const [url, setUrl] = useState<string | null>(null)
  const [cropFile, setCropFile] = useState<File | null>(null)
  const [autoBusy, setAutoBusy] = useState(false)
  const [autoMsg, setAutoMsg] = useState<string | null>(null)
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

  function onPick(file: File) { setCropFile(file) }

  // Auto-avatar: SIR saca la cara de una de tus capturas (IG/LinkedIn) y la recorta.
  async function autoFromCaptures() {
    if (autoBusy) return
    setAutoBusy(true); setAutoMsg(null)
    try {
      const res = await fetch('/api/avatars/auto', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_id: personId }),
      })
      const j = (await res.json()) as { url?: string | null; detail?: string; error?: string }
      if (res.ok && j.url) { setUrl(`${j.url}${j.url.includes('?') ? '&' : '?'}t=${Date.now()}`); setAutoMsg(null) }
      else setAutoMsg(j.detail || j.error || 'No pude generarla')
    } catch { setAutoMsg('Red caída, reinténtalo') } finally { setAutoBusy(false) }
  }

  return (
    <div className="relative group">
      <Avatar name={name} size={size} src={url} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        aria-label="Subir foto"
        title="Subir una foto"
        className="absolute -bottom-1 -right-1 rounded-full bg-background border border-border p-1 text-muted-foreground hover:text-foreground shadow-sm"
      >
        <Camera size={12} />
      </button>
      <button
        type="button"
        onClick={() => void autoFromCaptures()}
        disabled={autoBusy}
        aria-label="Usar una foto de mis capturas"
        title="Sacar la foto de mis capturas (Instagram/LinkedIn)"
        className="absolute -bottom-1 -left-1 rounded-full bg-background border border-border p-1 text-muted-foreground hover:text-brand shadow-sm disabled:opacity-60"
      >
        {autoBusy ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
      </button>
      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.currentTarget.value = '' }} />
      {autoMsg && (
        <div className="absolute top-full left-0 mt-1 w-max max-w-[220px] rounded-md border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground shadow-sm z-10">
          {autoMsg}
        </div>
      )}
      {cropFile && (
        <AvatarCropper personId={personId} file={cropFile}
          onCancel={() => setCropFile(null)}
          onDone={(u) => { if (u) setUrl(u); setCropFile(null) }} />
      )}
    </div>
  )
}
