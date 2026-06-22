'use client'
// SIR V2 — Recorte asistido de avatar. Mostramos la imagen en un viewport
// cuadrado con zoom + arrastre; al confirmar, recortamos a un canvas y subimos.
// Sin librerías (canvas + pointer events nativos). El recorte siempre cubre el
// cuadro (no deja bordes vacíos).

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Check, X, ZoomIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { uploadAvatar } from '@/lib/avatars/client'

const BOX = 280        // lado del viewport en px (UI)
const OUT = 512        // lado de salida (px) del avatar final

export function AvatarCropper({ personId, file, onDone, onCancel }: {
  personId: string
  file: File
  onDone: (url: string | null) => void
  onCancel: () => void
}) {
  const [imgUrl, setImgUrl] = useState<string>('')
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)

  useEffect(() => {
    const url = URL.createObjectURL(file)
    setImgUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  // Escala base: la imagen CUBRE el cuadro (lado menor = BOX) al zoom 1.
  const baseScale = nat ? BOX / Math.min(nat.w, nat.h) : 1
  const dispScale = baseScale * zoom
  const dispW = nat ? nat.w * dispScale : 0
  const dispH = nat ? nat.h * dispScale : 0

  // Clamp del offset para que la imagen siempre cubra el cuadro.
  const clamp = useCallback((o: { x: number; y: number }) => {
    const minX = BOX - dispW, minY = BOX - dispH
    return { x: Math.min(0, Math.max(minX, o.x)), y: Math.min(0, Math.max(minY, o.y)) }
  }, [dispW, dispH])

  function onImgLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const im = e.currentTarget
    const n = { w: im.naturalWidth, h: im.naturalHeight }
    setNat(n)
    const bs = BOX / Math.min(n.w, n.h)
    // centrar
    setOffset({ x: (BOX - n.w * bs) / 2, y: (BOX - n.h * bs) / 2 })
  }

  useEffect(() => { if (nat) setOffset((o) => clamp(o)) }, [zoom, nat, clamp])

  function onPointerDown(e: React.PointerEvent) {
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return
    const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y
    setOffset(clamp({ x: drag.current.ox + dx, y: drag.current.oy + dy }))
  }
  function onPointerUp() { drag.current = null }

  async function confirmar() {
    if (!nat || busy) return
    setBusy(true); setErr(null)
    try {
      const srcSide = BOX / dispScale
      const srcX = (-offset.x) / dispScale
      const srcY = (-offset.y) / dispScale
      const canvas = document.createElement('canvas')
      canvas.width = OUT; canvas.height = OUT
      const ctx = canvas.getContext('2d')
      if (!ctx || !imgRef.current) throw new Error('canvas')
      ctx.drawImage(imgRef.current, srcX, srcY, srcSide, srcSide, 0, 0, OUT, OUT)
      const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.9))
      if (!blob) throw new Error('blob')
      const cropped = new File([blob], `${personId}.jpg`, { type: 'image/jpeg' })
      const url = await uploadAvatar(personId, cropped)
      onDone(url)
    } catch { setErr('No se pudo recortar. Reintentá.'); setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-xl bg-background border border-border p-4 shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold">Recortá la foto</div>
          <button type="button" onClick={onCancel} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>
        <div className="mx-auto overflow-hidden rounded-full bg-muted touch-none select-none" style={{ width: BOX, height: BOX, position: 'relative' }}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          {imgUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img ref={imgRef} src={imgUrl} alt="" onLoad={onImgLoad} draggable={false}
              style={{ position: 'absolute', left: offset.x, top: offset.y, width: dispW || undefined, height: dispH || undefined, maxWidth: 'none', cursor: 'grab' }} />
          )}
          <div className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-white/70" />
        </div>
        <div className="flex items-center gap-2 mt-4">
          <ZoomIn size={15} className="text-muted-foreground shrink-0" />
          <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-full accent-brand" />
        </div>
        {err && <div className="text-xs text-bad mt-2">{err}</div>}
        <div className="flex items-center justify-end gap-2 mt-4">
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>Cancelar</Button>
          <Button size="sm" onClick={confirmar} disabled={busy || !nat}>
            {busy ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Check size={14} className="mr-2" />} Usar foto
          </Button>
        </div>
      </div>
    </div>
  )
}
