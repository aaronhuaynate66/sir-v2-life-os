'use client'

// SIR V2 — SectionTitle: el header consistente de las Cards de todas las rutas.
//
// ═══ POR QUÉ AHORA TIENE NIVELES ════════════════════════════════════════════
//
// Aaron, 4-ago-2026, sobre `/salud`: *"ha quedado horroroso, cero UX UI y orden"*.
//
// La auditoría encontró la causa exacta, y no era el orden: era que **no había
// jerarquía**. La clase `text-[11px] uppercase tracking-[0.07em] text-text-tertiary`
// se usaba como encabezado en 17 archivos de `components/salud` más 3 veces en la
// página, y es también la que usan `SectionTitle` y `CollapsibleSection`. O sea que
// el título de la métrica más importante, el de "Cronotipo" y el de "Modelo de
// energía · experimental" **eran tipográficamente idénticos**. Y los números "hero"
// de arriba usaban la misma clase que un número secundario enterrado tras dos clics.
//
// Nada le decía al ojo qué importaba más. Con todo al mismo peso, el ojo no
// jerarquiza: promedia. Y una pantalla promediada se lee como ruido.
//
// Tres niveles, y la regla de cuándo usar cada uno:
//
//   'seccion'  — lo que uno VIENE A VER. Pocos por pantalla (2 o 3). Grande, sin
//                mayúsculas, con el color del texto normal. Ej. "Tu medicación de hoy".
//   'tarjeta'  — el título de una tarjeta dentro de una sección. Ej. "Deuda de sueño".
//   'etiqueta' — el DEFAULT y lo que había antes: una etiqueta de dato, no un
//                título. Chico, en mayúsculas, gris. Ej. "ENERGÍA" sobre un número.
//
// El default se deja en 'etiqueta' a propósito: así los ~20 usos existentes no
// cambian de look, y el nivel se sube donde de verdad corresponde. Subir todo
// habría sido volver al mismo problema con otra letra.

import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

export type SectionTitleLevel = 'seccion' | 'tarjeta' | 'etiqueta'

interface SectionTitleProps {
  icon: LucideIcon
  label: string
  count?: number | string
  /** Ver el bloque de arriba. Default 'etiqueta' (el look histórico). */
  level?: SectionTitleLevel
  className?: string
}

const ESTILO: Record<SectionTitleLevel, { texto: string; icono: number; color: string; gap: string }> = {
  seccion: { texto: 'text-base font-semibold tracking-tight', icono: 17, color: 'text-brand', gap: 'mb-3' },
  tarjeta: { texto: 'text-sm font-semibold tracking-tight', icono: 15, color: 'text-muted-foreground', gap: 'mb-3' },
  etiqueta: { texto: 'text-[11px] uppercase tracking-[0.07em] text-text-tertiary font-sans', icono: 13, color: 'text-text-tertiary', gap: 'mb-4' },
}

export function SectionTitle({ icon: Icon, label, count, level = 'etiqueta', className }: SectionTitleProps) {
  const e = ESTILO[level]
  return (
    <div className={cn('flex items-center gap-2', e.gap, className)}>
      <Icon size={e.icono} strokeWidth={level === 'etiqueta' ? 1.75 : 2} className={e.color} aria-hidden="true" />
      {/* Heading semántico (a11y U2): navegable por lector de pantalla. */}
      <h2 className={e.texto}>{label}</h2>
      {count !== undefined && (
        <span className="text-[11px] font-mono tabular-nums text-text-tertiary ml-auto">{count}</span>
      )}
    </div>
  )
}
