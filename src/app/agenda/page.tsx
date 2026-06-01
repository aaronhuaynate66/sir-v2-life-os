'use client'

// SIR V2 — /agenda (Feature 1: Agenda "Próximo", vista completa).
//
// Misma agregación determinística que el panel de Mission Control, sin
// recorte: toda la lista accionable ordenada por urgencia/cercanía.

import { motion } from 'framer-motion'

import { AppShell } from '@/components/layout/AppShell'
import { ProximoPanel } from '@/components/agenda/ProximoPanel'
import { CalendarPanel } from '@/components/agenda/CalendarPanel'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { RouteSkeleton } from '@/components/skeletons/RouteSkeleton'

export default function AgendaPage() {
  const hydrated = useHasHydrated()
  if (!hydrated) return <RouteSkeleton cards={2} />

  return (
    <AppShell>
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-6 sm:mb-8"
      >
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-sans mb-1">
          SIR V2 &mdash; Agenda
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Próximo</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Todo lo accionable de tu red, ordenado por urgencia.
        </p>
      </motion.div>

      {/* Calendario externo (Outlook .ics) — degrada limpio si no está configurado. */}
      <CalendarPanel />

      <ProximoPanel title="Recordatorios" />
    </AppShell>
  )
}
