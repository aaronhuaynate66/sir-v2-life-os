'use client'
// SIR V2 — AppShell
// Wrapper de layout responsive: sidebar fijo en lg+, drawer mobile en <lg.
import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
import { Nav } from './Nav'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

interface AppShellProps {
  children: ReactNode
  /** Si true usa max-w-5xl (para /dashboard, layout mas denso). Default: max-w-4xl. */
  wide?: boolean
}

export function AppShell({ children, wide = false }: AppShellProps) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Auto-cerrar el drawer al navegar (cuando cambia el path).
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Mobile top bar (oculto en lg+) */}
      <header className="lg:hidden sticky top-0 z-40 flex items-center justify-between border-b border-border bg-background px-3 sm:px-4 h-14">
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
            <Nav onItemClick={() => setOpen(false)} />
          </SheetContent>
        </Sheet>

        <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-sans">SIR V2</div>

        <div className="w-9" aria-hidden="true" />
      </header>

      {/* Desktop sidebar (oculto en <lg) */}
      <aside className="hidden lg:block fixed left-0 top-0 bottom-0 w-60 border-r border-border">
        <Nav />
      </aside>

      {/* Main content */}
      <main className="lg:ml-60">
        <div className={cn('mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8', wide ? 'max-w-5xl' : 'max-w-4xl')}>
          {children}
        </div>
      </main>
    </div>
  )
}
