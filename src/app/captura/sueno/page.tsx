'use client'
// SIR V2 — /captura/sueno
// Captura de una noche desde una foto del panel de sueño vía Claude Vision.
// Ruta protegida por el middleware. AppShell + hydration gate estándar.

import Link from 'next/link'
import { ArrowLeft, Moon } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { SleepCaptureFlow } from '@/components/capture/sleep/SleepCaptureFlow'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { RouteSkeleton } from '@/components/skeletons/RouteSkeleton'

export default function CaptureSleepPage() {
  const hydrated = useHasHydrated()
  if (!hydrated) return <RouteSkeleton cards={1} />
  return <CaptureSleepContent />
}

function CaptureSleepContent() {
  return (
    <AppShell>
      <Link
        href="/yo"
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
          <Moon size={20} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Captura sueño</h1>
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground mt-2 max-w-2xl leading-relaxed">
          Subí una foto del panel de tu app de sueño (Huawei Health, Apple Health,
          Samsung Health, Fitbit, etc.). Claude Vision extrae duración, horario,
          fases y puntuación; vos los revisás y confirmás. Se guarda como tu noche
          en Self.
        </p>
      </header>

      <SleepCaptureFlow />
    </AppShell>
  )
}
