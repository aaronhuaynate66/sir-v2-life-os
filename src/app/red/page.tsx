'use client'
// SIR V2 — /red (landing)
// Punto de entrada a las vistas de tu red personal. Por ahora un link
// al grafo; en el futuro acomoda /red/lista, /red/insights, etc.

import Link from 'next/link'
import { Network, ArrowRight, Users } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { RouteSkeleton } from '@/components/skeletons/RouteSkeleton'
import { useRelationshipStore } from '@/stores/useRelationshipStore'

export default function RedPage() {
  const hydrated = useHasHydrated()
  if (!hydrated) return <RouteSkeleton cards={2} />
  return <RedContent />
}

function RedContent() {
  const { people } = useRelationshipStore()

  return (
    <AppShell>
      <header className="mb-6 sm:mb-8">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-sans mb-1">
          SIR V2 &mdash; Tu red personal
        </div>
        <div className="flex items-center gap-3">
          <Network size={20} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Red</h1>
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground mt-2 max-w-2xl leading-relaxed">
          Vista macro de las personas en tu vida y la calidad de tus relaciones con ellas.
        </p>
      </header>

      <Card className="shadow-none mb-4">
        <CardContent className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex-shrink-0 w-10 h-10 rounded-md bg-primary/10 border border-primary/30 flex items-center justify-center">
              <Network size={18} strokeWidth={1.75} className="text-primary" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground">Grafo de relaciones</div>
              <div className="text-xs text-muted-foreground leading-snug">
                {people.length === 0
                  ? 'Visualizá tu red cuando agregues personas en /relaciones.'
                  : `${people.length} ${people.length === 1 ? 'persona' : 'personas'} en tu red, conectadas por categoría y salud.`}
              </div>
            </div>
          </div>
          <Button size="sm" asChild className="flex-shrink-0">
            <Link href="/red/grafo" className="inline-flex items-center gap-1.5">
              Abrir grafo
              <ArrowRight size={13} strokeWidth={1.75} aria-hidden="true" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardContent className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex-shrink-0 w-10 h-10 rounded-md bg-muted/40 border border-border flex items-center justify-center">
              <Users size={18} strokeWidth={1.75} className="text-muted-foreground" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground">Lista de personas</div>
              <div className="text-xs text-muted-foreground leading-snug">
                Vista tabular completa con edición inline.
              </div>
            </div>
          </div>
          <Button size="sm" variant="outline" asChild className="flex-shrink-0">
            <Link href="/relaciones" className="inline-flex items-center gap-1.5">
              Ir a /relaciones
              <ArrowRight size={13} strokeWidth={1.75} aria-hidden="true" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </AppShell>
  )
}
