// SIR V2 — AppShell
// Wrapper de layout con sidebar Nav.
import type { ReactNode } from 'react'
import { Nav } from './Nav'
import { cn } from '@/lib/utils'

interface AppShellProps {
  children: ReactNode
  /** Si true usa max-w-5xl (para /dashboard, layout mas denso). Default: max-w-4xl. */
  wide?: boolean
}

export function AppShell({ children, wide = false }: AppShellProps) {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Nav />
      <main className="flex-1 overflow-y-auto">
        <div className={cn('mx-auto px-4 sm:px-6 py-8', wide ? 'max-w-5xl' : 'max-w-4xl')}>
          {children}
        </div>
      </main>
    </div>
  )
}
