'use client'
// SIR V2 — /yo: IDENTIDAD (quién sos, anclas, autodiagnóstico). La salud y las
// métricas viven en /salud (su propia página). Acá solo lo personal/identidad.
import { Brain, MessageSquare, ArrowRight, Heart } from 'lucide-react'
import Link from 'next/link'
import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { RouteSkeleton } from '@/components/skeletons/RouteSkeleton'
import { SelfDiagnosisPanel } from '@/components/yo/SelfDiagnosisPanel'
import { LifeThreadPanel } from '@/components/yo/LifeThreadPanel'
import { IdentityProfilePanel } from '@/components/yo/IdentityProfilePanel'
import { ContaleASir } from '@/components/yo/ContaleASir'

const cardClass = 'transition-colors duration-200 hover:border-border-strong'

export default function SelfPage() {
  const hydrated = useHasHydrated()
  if (!hydrated) return <RouteSkeleton cards={3} />
  return (
    <AppShell>
      <div className="mb-8">
        <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary mb-1">SIR V2</div>
        <div className="flex items-center gap-3 mt-1">
          <Brain size={28} strokeWidth={1.5} className="text-muted-foreground" />
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Yo</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">Quién sos: identidad, anclas y autodiagnóstico</p>
      </div>

      {/* La salud vive en su propia página (/salud). Acceso directo. */}
      <Card className={cardClass}>
        <CardContent className="p-4 sm:p-5">
          <Link href="/salud" className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 text-foreground font-medium">
              <Heart size={16} strokeWidth={1.75} className="text-primary" aria-hidden="true" />
              Tu salud, métricas y capturas
            </span>
            <span className="flex items-center gap-1 text-muted-foreground whitespace-nowrap">
              en Salud <ArrowRight size={14} strokeWidth={1.75} aria-hidden="true" />
            </span>
          </Link>
        </CardContent>
      </Card>

      <div className="mt-6 space-y-4">
        {/* Identidad: primero contás quién sos (relato), luego el perfil que alimenta. */}
        <Card className={cardClass}>
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare size={16} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
              <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Contale a SIR quién sos</div>
            </div>
            <ContaleASir />
          </CardContent>
        </Card>
        <IdentityProfilePanel />
        <LifeThreadPanel />
        <SelfDiagnosisPanel />
      </div>
    </AppShell>
  )
}
