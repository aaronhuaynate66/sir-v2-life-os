'use client'
// SIR V2 — Auto-extracción del avatar desde una captura de perfil. Detecta la
// cara (avatars/detect), recorta en cuadrado alrededor y la sube. Best-effort:
// solo setea avatar si se detectó una cara (no pone recortes random). Reusa
// uploadAvatar + el endpoint detect (mismo patrón que AvatarCropper, headless).
import { uploadAvatar } from './client'

interface Box { found?: boolean; x?: number; y?: number; w?: number; h?: number }

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e) }
    img.src = url
  })
}

/** Detecta + recorta + sube. Devuelve la URL si se guardó, null si no había
 *  cara o falló (sin ruido). */
export async function autoExtractAvatar(personId: string, file: File): Promise<string | null> {
  let box: Box = {}
  try {
    const fd = new FormData(); fd.append('file', file)
    const r = await fetch('/api/avatars/detect', { method: 'POST', body: fd })
    if (r.ok) box = (await r.json()) as Box
  } catch { return null }
  if (!box.found || !box.w || !box.h) return null // sin cara → no seteamos nada

  let img: HTMLImageElement
  try { img = await loadImage(file) } catch { return null }
  const W = img.naturalWidth, H = img.naturalHeight
  if (!W || !H) return null
  const bx = (box.x ?? 0) * W, by = (box.y ?? 0) * H, bw = box.w * W, bh = box.h * H
  const side = Math.min(W, H, Math.max(bw, bh) * 1.3)
  const cx = bx + bw / 2, cy = by + bh / 2
  const sx = Math.max(0, Math.min(W - side, cx - side / 2))
  const sy = Math.max(0, Math.min(H - side, cy - side / 2))

  const OUT = 256
  const canvas = document.createElement('canvas')
  canvas.width = OUT; canvas.height = OUT
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(img, sx, sy, side, side, 0, 0, OUT, OUT)
  const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.9))
  if (!blob) return null
  try { return await uploadAvatar(personId, new File([blob], `${personId}.jpg`, { type: 'image/jpeg' })) } catch { return null }
}
