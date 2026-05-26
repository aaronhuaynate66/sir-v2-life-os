'use client'

// SIR V2 — RouteSkeleton (Sesion 12)
// Placeholder generico para rutas que consumen stores persistidos.
// Se renderiza mientras useHasHydrated() === false para evitar valores
// stale visibles al primer mount.

interface RouteSkeletonProps {
  /** Numero de cards a renderizar como placeholder. Default: 3. */
  cards?: number
  /** Muestra placeholder de header (titulo + subtitulo). Default: true. */
  header?: boolean
}

export function RouteSkeleton({ cards = 3, header = true }: RouteSkeletonProps) {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5]">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {header && (
          <div className="space-y-2">
            <div className="h-8 w-64 bg-[#1a1a1a] rounded animate-pulse" />
            <div className="h-4 w-40 bg-[#111] rounded animate-pulse" />
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: cards }).map((_, i) => (
            <div
              key={i}
              className="border border-[#1a1a1a] bg-[#111] rounded-lg p-6 space-y-3 animate-pulse"
            >
              <div className="h-3 w-24 bg-[#1a1a1a] rounded" />
              <div className="h-6 w-32 bg-[#0a0a0a] rounded" />
              <div className="h-3 w-full bg-[#0a0a0a] rounded" />
              <div className="h-3 w-3/4 bg-[#0a0a0a] rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
