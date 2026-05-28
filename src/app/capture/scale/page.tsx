'use client'
// SIR V2 — /capture/scale
// Captura de mediciones desde foto de báscula via Claude Vision.
// Ruta protegida por el middleware. AppShell + hydration gate estándar.

import Link from 'next/link'
import { ArrowLeft, Scale } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { ScaleCaptureFlow } from '@/components/capture/scale/ScaleCaptureFlow'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { RouteSkeleton } from '@/components/skeletons/RouteSkeleton'

export default function CaptureScalePage() {
  const hydrated = useHasHydrated()
  if (!hydrated) return <RouteSkeleton cards={1} />
  return <CaptureScaleContent />
}

function CaptureScaleContent() {
  return (
    <AppShell>
      <Link
        href="/self"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4"
      >
        <ArrowLeft size={13} strokeWidth={1.75} aria-hidden="true" />
        Volver a Self
      </Link>

      <header className="mb-6 sm:mb-8">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-sans mb-1">
          SIR V2 &mdash; Captura inteligente
        </div>
        <div className="flex items-center gap-3">
          <Scale size={20} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Captura báscula</h1>
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground mt-2 max-w-2xl leading-relaxed">
          Subí una foto del panel de tu báscula inteligente (Mi Scale, Renpho, Garmin, etc.).
          Claude Vision extrae las 13 métricas, vos las revisás y confirmás.
          La imagen queda archivada en tu bucket privado.
        </p>
      </header>

      <ScaleCaptureFlow />
    </AppShell>
  )
}
