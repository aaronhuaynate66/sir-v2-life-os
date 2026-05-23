// SIR V2 — AppShell
// Wrapper de layout con sidebar Nav
import type { ReactNode } from 'react'
import { Nav } from './Nav'

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[#0a0a0a]">
      <Nav />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-8">
          {children}
        </div>
      </main>
    </div>
  )
}
