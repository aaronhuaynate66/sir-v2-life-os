'use client'
// SIR V2 — Avatar EDITABLE de una persona (ficha): muestra la foto si hay,
// con overlay para subir/cambiar. Lee de /api/avatars?person_id y sube vía
// uploadAvatar. Fallback a iniciales (componente Avatar base).

import { useEffect, useRef, useState } from 'react'
import { Camera } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { AvatarCropper } from './AvatarCropper'

export function PersonAvatar({ personId, name, size = 'lg' }: { personId: string; name: string; size?: 'sm' | 'md' | 'lg' }) {
  const [url, setUrl] = useState<string | null>(null)
  const [cropFile, setCropFile] = useState<File | null>(null)
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

  return (
    <div className="relative group">
      <Avatar name={name} size={size} src={url} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        aria-label="Cambiar foto"
        className="absolute -bottom-1 -right-1 rounded-full bg-background border border-border p-1 text-muted-foreground hover:text-foreground shadow-sm"
      >
        <Camera size={12} />
      </button>
      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.currentTarget.value = '' }} />
      {cropFile && (
        <AvatarCropper personId={personId} file={cropFile}
          onCancel={() => setCropFile(null)}
          onDone={(u) => { if (u) setUrl(u); setCropFile(null) }} />
      )}
    </div>
  )
}
