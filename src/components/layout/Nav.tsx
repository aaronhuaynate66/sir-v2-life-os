'use client'
// SIR V2 — Navigation Component
// Sidebar sobria y dark. Mission Control.
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Mission Control', short: 'MC' },
  { href: '/self', label: 'Self', short: 'SE' },
  { href: '/relationships', label: 'Relaciones', short: 'RE' },
  { href: '/goals', label: 'Objetivos', short: 'GO' },
  { href: '/finance', label: 'Finanzas', short: 'FI' },
  { href: '/signals', label: 'Senales', short: 'SG' },
] as const

export function Nav() {
  const pathname = usePathname()

  return (
    <nav className="w-48 min-h-screen bg-[#0a0a0a] border-r border-[#111] flex flex-col flex-shrink-0">
      <div className="px-4 py-5 border-b border-[#111]">
        <div className="text-[9px] font-mono text-[#222] uppercase tracking-widest mb-0.5">SIR V2</div>
        <div className="text-xs text-[#333] font-mono">Life OS</div>
      </div>
      <div className="flex-1 py-3">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 px-4 py-2.5 text-[11px] font-mono transition-colors ${
                active
                  ? 'text-[#f5f5f5] bg-[#111]'
                  : 'text-[#333] hover:text-[#666] hover:bg-[#0d0d0d]'
              }`}
            >
              <span className={`text-[9px] w-5 text-center ${active ? 'text-[#444]' : 'text-[#1e1e1e]'}`}>{item.short}</span>
              <span>{item.label}</span>
              {active && <span className="ml-auto w-0.5 h-3 bg-[#333] rounded-full" />}
            </Link>
          )
        })}
      </div>
      <div className="px-4 py-4 border-t border-[#111]">
        <div className="text-[9px] font-mono text-[#1e1e1e]">datos a paz</div>
      </div>
    </nav>
  )
}
