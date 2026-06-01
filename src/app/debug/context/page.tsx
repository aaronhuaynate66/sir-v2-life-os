'use client'
// SIR V2 — /debug/context
// Acceso on-demand al RichContextDebugPanel. Sacado del /dashboard para
// mantener la vista de produccion limpia. Ruta protegida por el middleware
// global (requiere sesion).

import { Bug } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { RichContextDebugPanel } from '@/components/context/RichContextDebugPanel'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { RouteSkeleton } from '@/components/skeletons/RouteSkeleton'

export default function DebugContextPage() {
  const hydrated = useHasHydrated()
  if (!hydrated) return <RouteSkeleton cards={1} wide />
  return <DebugContextContent />
}

function DebugContextContent() {
  return (
    <AppShell wide>
      <header className="mb-6 sm:mb-8">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/30">
            DEBUG
          </span>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-sans">
            SIR V2 &mdash; Diagnostico interno
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Bug size={20} strokeWidth={1.75} className="text-muted-foreground/70" />
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            Debug &middot; Context
          </h1>
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground mt-2 max-w-2xl leading-relaxed">
          Diagnostico interno del motor de contexto. Muestra el snapshot actual,
          el historial de capturas y permite forzar una captura manual. Solo para
          uso tecnico ocasional &mdash; no es parte del flujo de produccion.
        </p>
      </header>

      <RichContextDebugPanel />
    </AppShell>
  )
}
