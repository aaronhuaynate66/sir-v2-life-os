'use client'
// SIR V2 — AppShell
// Wrapper de layout responsive: sidebar fijo en lg+, drawer mobile en <lg.
import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
import { Nav } from './Nav'
import { AiCreditBanner } from '@/components/system/AiCreditBanner'
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { trackPageView } from '@/lib/analytics/track'

interface AppShellProps {
  children: ReactNode
  /** Si true usa max-w-5xl (para /dashboard, layout mas denso). Default: max-w-4xl. */
  wide?: boolean
  /** Columna derecha sticky (2-col en desktop, colapsa debajo del contenido
   *  en mobile). Para pantallas densas: línea de tiempo de la ficha, etc.
   *  Cuando se provee, el shell ensancha el contenedor. Se oculta al imprimir. */
  rightRail?: ReactNode
}

export function AppShell({ children, wide = false, rightRail }: AppShellProps) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Auto-cerrar el drawer al navegar (cuando cambia el path).
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  // Pageview SPA: gtag('config') ya no manda page_view (send_page_view:false),
  // así que lo emitimos acá en cada cambio de ruta — incluido el mount inicial.
  useEffect(() => {
    if (pathname) trackPageView(pathname)
  }, [pathname])

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Mobile top bar (oculto en lg+ y al imprimir) */}
      <header className="lg:hidden print:hidden sticky top-0 z-40 flex items-center justify-between border-b border-border bg-background px-3 sm:px-4 h-14">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              aria-label="Abrir menu"
              className="-ml-1 p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/10 transition-colors"
            >
              <Menu size={20} strokeWidth={1.75} />
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0">
            <SheetTitle className="sr-only">Navegacion</SheetTitle>
            <SheetDescription className="sr-only">
              Enlaces principales del Life OS — Mission Control, Self, Relaciones, Captura, Objetivos y demás.
            </SheetDescription>
            <Nav onItemClick={() => setOpen(false)} />
          </SheetContent>
        </Sheet>

        <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-sans">SIR V2</div>

        <div className="w-9" aria-hidden="true" />
      </header>

      {/* Desktop sidebar (oculto en <lg y al imprimir) */}
      <aside className="hidden lg:block print:hidden fixed left-0 top-0 bottom-0 w-60 border-r border-border">
        <Nav />
      </aside>

      {/* Main content. Al imprimir: sin margen de sidebar ni padding/ancho. */}
      <main className="lg:ml-60 print:ml-0">
        <AiCreditBanner />
        <div
          className={cn(
            'mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 print:max-w-none print:p-0',
            rightRail ? 'max-w-6xl' : wide ? 'max-w-5xl' : 'max-w-4xl',
          )}
        >
          {rightRail ? (
            // 2 columnas en desktop: contenido (fluido) + rail sticky de ancho
            // fijo. En mobile/print colapsa a una columna (el rail baja).
            <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_clamp(300px,28vw,360px)] lg:gap-8 lg:items-start print:block">
              <div className="min-w-0">{children}</div>
              <aside className="mt-6 lg:mt-0 lg:sticky lg:top-8 print:hidden">
                {rightRail}
              </aside>
            </div>
          ) : (
            children
          )}
        </div>
      </main>
    </div>
  )
}
