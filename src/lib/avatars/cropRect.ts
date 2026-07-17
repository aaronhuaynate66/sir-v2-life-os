// SIR V2 — Cálculo del recorte cuadrado de avatar desde la caja detectada por
// visión. PURO (misma lógica que el AvatarCropper client, portada a server para
// el auto-avatar). Dada la caja normalizada (0..1) de la cara/foto-de-perfil y
// las dimensiones naturales de la imagen, devuelve el cuadrado a extraer (px).

export interface DetectBox {
  /** Esquina sup-izq + tamaño, normalizado 0..1. */
  x: number
  y: number
  w: number
  h: number
}

export interface CropRect {
  left: number
  top: number
  /** Lado del cuadrado (px). */
  side: number
}

/** Cuadrado a extraer alrededor de la caja: 1.5× el lado mayor de la caja (para
 *  incluir toda la cabeza), centrado en la caja y clampeado a los bordes. */
export function avatarCropRect(box: DetectBox, natW: number, natH: number): CropRect {
  const W = Math.max(1, natW)
  const H = Math.max(1, natH)
  const bw = box.w * W
  const bh = box.h * H
  const cx = (box.x + box.w / 2) * W
  const cy = (box.y + box.h / 2) * H
  const want = Math.max(bw, bh) * 1.5
  const side = Math.max(40, Math.min(Math.min(W, H), want))
  const left = clamp(Math.round(cx - side / 2), 0, Math.round(W - side))
  const top = clamp(Math.round(cy - side / 2), 0, Math.round(H - side))
  return { left, top, side: Math.round(side) }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}
