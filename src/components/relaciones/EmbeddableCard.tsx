// SIR V2 — EmbeddableCard: una card que puede renderizarse como Card propia o,
// con `embedded`, como una SECCIÓN dentro de otra card (sin borde propio, con un
// separador superior). Sirve para fusionar varias señales relacionadas en una
// sola card "Estado del vínculo" (Opción 2 de consolidación de la ficha) sin
// duplicar la lógica de cada motor: cada uno conserva su render y su
// auto-ocultado; solo cambia el envoltorio.

import type { ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export function EmbeddableCard({
  embedded = false,
  className,
  contentClassName,
  children,
}: {
  embedded?: boolean
  /** Clases del contenedor externo (Card) — ej. tono/color del estado. */
  className?: string
  /** Clases del contenido interno (ej. space-y-2). */
  contentClassName?: string
  children: ReactNode
}) {
  if (embedded) {
    // Sección dentro de la card contenedora: separador arriba (salvo la primera
    // sección visible — los componentes ocultos retornan null y no cuentan como
    // hijo, así que first-child es la primera sección realmente renderizada).
    return (
      <div className={cn('px-4 py-4 sm:px-5 border-t border-border/60 first:border-t-0', contentClassName, className)}>
        {children}
      </div>
    )
  }
  return (
    <Card className={cn('shadow-none mb-4', className)}>
      <CardContent className={cn('p-4 sm:p-5', contentClassName)}>{children}</CardContent>
    </Card>
  )
}
