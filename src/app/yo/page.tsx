'use client'
// SIR V2 — /yo: IDENTIDAD (quién sos, anclas, autodiagnóstico). La salud y las
// métricas viven en /salud (su propia página). Acá solo lo personal/identidad.
import { Brain, ArrowRight, Heart } from 'lucide-react'
import Link from 'next/link'
import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { RouteSkeleton } from '@/components/skeletons/RouteSkeleton'
import { IdentityProfilePanel } from '@/components/yo/IdentityProfilePanel'
import { RetratoPanel } from '@/components/yo/RetratoPanel'
import dynamic from 'next/dynamic'
// /yo tiene 10 paneles apilados; solo Retrato + IdentityProfile viven above the
// fold. Los otros 7 son below fold, mayormente engines pesados (LifeThread hace
// IA, PreMortem tambien, EspejoSemanal, Arquetipo). Dynamic + ssr:false los
// saca del First Load JS del route inicial (era 254 KB, la 6ta ruta mas pesada).
const dynSkeleton = () => <div className="h-32 rounded-lg border border-border animate-pulse" />
const EspejoSemanalPanel = dynamic(() => import('@/components/yo/EspejoSemanalPanel').then((m) => ({ default: m.EspejoSemanalPanel })), { ssr: false, loading: dynSkeleton })
const ExperimentosLoopPanel = dynamic(() => import('@/components/yo/ExperimentosLoopPanel').then((m) => ({ default: m.ExperimentosLoopPanel })), { ssr: false, loading: dynSkeleton })
const PreMortemPanel = dynamic(() => import('@/components/yo/PreMortemPanel').then((m) => ({ default: m.PreMortemPanel })), { ssr: false, loading: dynSkeleton })
const NorteDriftPanel = dynamic(() => import('@/components/yo/NorteDriftPanel').then((m) => ({ default: m.NorteDriftPanel })), { ssr: false, loading: dynSkeleton })
const LifeThreadPanel = dynamic(() => import('@/components/yo/LifeThreadPanel').then((m) => ({ default: m.LifeThreadPanel })), { ssr: false, loading: dynSkeleton })
const ArquetipoPanel = dynamic(() => import('@/components/yo/ArquetipoPanel').then((m) => ({ default: m.ArquetipoPanel })), { ssr: false, loading: dynSkeleton })
const SelfDiagnosisPanel = dynamic(() => import('@/components/yo/SelfDiagnosisPanel').then((m) => ({ default: m.SelfDiagnosisPanel })), { ssr: false, loading: dynSkeleton })
const NotificationsCard = dynamic(() => import('@/components/system/NotificationsCard').then((m) => ({ default: m.NotificationsCard })), { ssr: false, loading: dynSkeleton })

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
        <RetratoPanel />
        <IdentityProfilePanel />
        <EspejoSemanalPanel />
        <ExperimentosLoopPanel />
        <PreMortemPanel />
        <NorteDriftPanel />
        <LifeThreadPanel />
        <ArquetipoPanel />
        <NotificationsCard />
        <SelfDiagnosisPanel />
      </div>
    </AppShell>
  )
}
