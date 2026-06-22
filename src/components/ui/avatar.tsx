// SIR V2 — Avatar (sistema de diseño)
// Avatar redondo con iniciales sobre brand-soft (el único uso decorativo
// del acento de marca, suave). Tamaños sm/md/lg. Sin imágenes por ahora:
// el OS es de texto, las iniciales bastan y leen consistente.

import { cn } from '@/lib/utils'

/** Iniciales de un nombre: 1 palabra → 2 letras; 2+ → primera de la
 *  primera y de la última. Fuente única (la usaban /relaciones y el detalle). */
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const SIZE: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'w-8 h-8 text-[11px]',
  md: 'w-10 h-10 text-xs',
  lg: 'w-14 h-14 text-base',
}

export interface AvatarProps {
  name: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
  /** Si hay foto, se muestra la imagen (con las iniciales de fallback debajo). */
  src?: string | null
}

export function Avatar({ name, size = 'md', className, src }: AvatarProps) {
  return (
    <div
      className={cn(
        'relative flex items-center justify-center overflow-hidden rounded-full shrink-0 font-semibold tracking-tight select-none',
        'bg-brand-soft text-brand-soft-foreground',
        SIZE[size],
        className,
      )}
      aria-hidden="true"
    >
      <span>{getInitials(name)}</span>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
      ) : null}
    </div>
  )
}
