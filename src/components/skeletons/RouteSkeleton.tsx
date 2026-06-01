'use client'

// SIR V2 — RouteSkeleton (Sesion 12 · ronda 3)
// Placeholder generico para rutas que consumen stores persistidos.
// Se renderiza mientras useHasHydrated() === false para evitar valores
// stale visibles al primer mount.
//
// Ronda 3: el skeleton ahora vive DENTRO del AppShell para que el sidebar
// (lg+) y el top-bar (mobile) no aparezcan recién al hidratar — antes el
// skeleton era full-screen y el contenido real "saltaba" al montar el shell.
// `SkeletonBlocks` expone el cuerpo sin shell para call-sites que ya están
// dentro de un AppShell (ej. el loading del fetch en /horario).

import { AppShell } from '@/components/layout/AppShell'

interface SkeletonBlocksProps {
  /** Numero de cards a renderizar como placeholder. Default: 3. */
  cards?: number
  /** Muestra placeholder de header (titulo + subtitulo). Default: true. */
  header?: boolean
}

/** Cuerpo del skeleton (sin shell). Usar cuando ya estás dentro de un AppShell. */
export function SkeletonBlocks({ cards = 3, header = true }: SkeletonBlocksProps) {
  return (
    <div className="space-y-6">
      {header && (
        <div className="space-y-2">
          <div className="h-8 w-64 max-w-[70%] bg-muted rounded animate-pulse" />
          <div className="h-4 w-40 bg-muted/50 rounded animate-pulse" />
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: cards }).map((_, i) => (
          <div
            key={i}
            className="border border-border bg-card rounded-lg p-6 space-y-3 animate-pulse"
          >
            <div className="h-3 w-24 bg-muted rounded" />
            <div className="h-6 w-32 bg-muted/60 rounded" />
            <div className="h-3 w-full bg-muted/40 rounded" />
            <div className="h-3 w-3/4 bg-muted/40 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}

interface RouteSkeletonProps extends SkeletonBlocksProps {
  /** Pasa al AppShell para coincidir con páginas de layout denso (/panel, /historial). */
  wide?: boolean
}

export function RouteSkeleton({ cards = 3, header = true, wide = false }: RouteSkeletonProps) {
  return (
    <AppShell wide={wide}>
      <SkeletonBlocks cards={cards} header={header} />
    </AppShell>
  )
}
