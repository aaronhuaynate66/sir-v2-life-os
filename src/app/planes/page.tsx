'use client'
// SIR V2 — /planes: agenda personal global.
//
// Vista de TODOS tus planes personales, donde marcás con quién es cada uno. Los
// que ligás a tu pareja caen solos en su línea del ciclo (la ficha los filtra).

import { CalendarDays } from 'lucide-react'

import { AppShell } from '@/components/layout/AppShell'
import { PersonalAgendaPanel } from '@/components/planes/PersonalAgendaPanel'

export default function PlanesPage() {
  return (
    <AppShell>
      <div className="mb-4 flex items-center gap-3">
        <CalendarDays size={22} strokeWidth={1.5} className="text-muted-foreground" />
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight leading-none">Planes</h1>
          <p className="text-[11px] text-muted-foreground mt-1">
            Tus planes personales. Marcá con quién es cada uno — si es con tu pareja, cae en su línea del ciclo.
          </p>
        </div>
      </div>
      <PersonalAgendaPanel />
    </AppShell>
  )
}
