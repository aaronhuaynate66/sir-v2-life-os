'use client'

import Link from 'next/link'
import { ArrowLeft, Upload } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { IntakeInteligente } from '@/components/relaciones/IntakeInteligente'

export default function IntakePage() {
  return (
    <AppShell>
      <Link
        href="/relaciones"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4"
      >
        <ArrowLeft size={13} strokeWidth={1.75} aria-hidden="true" />
        Volver a Relaciones
      </Link>

      <header className="mb-6">
        <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary mb-1">SIR V2 · Personas</div>
        <div className="flex items-center gap-3 mt-1">
          <Upload size={26} strokeWidth={1.5} className="text-muted-foreground" aria-hidden="true" />
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Intake inteligente</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-2 max-w-2xl leading-relaxed">
          Arrastrá los archivos de una persona y dejá que SIR la identifique y proponga la relación,
          en vez de cargar todo a mano.
        </p>
      </header>

      <IntakeInteligente />
    </AppShell>
  )
}
