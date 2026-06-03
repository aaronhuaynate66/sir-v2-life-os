'use client'

// SIR V2 — /agenda (Feature 1: Agenda "Próximo", vista completa).
//
// Misma agregación determinística que el panel de Mission Control, sin
// recorte: toda la lista accionable ordenada por urgencia/cercanía.

import { useState } from 'react'
import { motion } from 'framer-motion'

import { AppShell } from '@/components/layout/AppShell'
import { ProximoPanel } from '@/components/agenda/ProximoPanel'
import { CalendarPanel } from '@/components/agenda/CalendarPanel'
import { CalendarConnections } from '@/components/agenda/CalendarConnections'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { RouteSkeleton } from '@/components/skeletons/RouteSkeleton'

export default function AgendaPage() {
  const hydrated = useHasHydrated()
  const [calReload, setCalReload] = useState(0)
  if (!hydrated) return <RouteSkeleton cards={2} />

  return (
    <AppShell>
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-6 sm:mb-8"
      >
        <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary font-sans mb-1">
          SIR V2 &mdash; Agenda
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Próximo</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Todo lo accionable, ordenado por urgencia. El calendario queda abajo, como contexto.
        </p>
      </motion.div>

      {/* PRIMARIO: lo accionable (motor proactivo) manda la página. */}
      <ProximoPanel title="Lo que importa ahora" />

      {/* SECUNDARIO: calendario externo con los recurrentes plegados. La vista
          completa de tiempo vive en /horario. */}
      <CalendarPanel reloadKey={calReload} />

      {/* Gestión de calendarios conectados (agregar/editar/eliminar/toggle). */}
      <CalendarConnections onChange={() => setCalReload((k) => k + 1)} />
    </AppShell>
  )
}
