'use client'
// SIR V2 — Navigation
// Sidebar moderno con iconos lucide y active state en acento coral.
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Brain, Users, Target, DollarSign, Bell, Archive } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavItem {
  href: string
  label: string
  Icon: LucideIcon
}

const NAV_ITEMS: readonly NavItem[] = [
  { href: '/dashboard', label: 'Mission Control', Icon: LayoutDashboard },
  { href: '/self', label: 'Self', Icon: Brain },
  { href: '/relationships', label: 'Relaciones', Icon: Users },
  { href: '/goals', label: 'Objetivos', Icon: Target },
  { href: '/finance', label: 'Finanzas', Icon: DollarSign },
  { href: '/signals', label: 'Senales', Icon: Bell },
  { href: '/memory', label: 'Memoria', Icon: Archive },
] as const

interface NavProps {
  /** Llamado al click en un item. Util para cerrar el drawer mobile al navegar. */
  onItemClick?: () => void
}

export function Nav({ onItemClick }: NavProps = {}) {
  const pathname = usePathname()

  return (
    <nav className="w-full h-full bg-background flex flex-col">
      <div className="px-5 py-5 border-b border-border">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70 font-sans">SIR V2</div>
        <div className="text-xs text-muted-foreground font-sans mt-0.5">Life OS</div>
      </div>

      <div className="flex-1 py-3 px-2 flex flex-col gap-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              onClick={onItemClick}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                'border-l-2',
                active
                  ? 'bg-accent/15 text-foreground border-l-primary'
                  : 'text-muted-foreground border-l-transparent hover:text-foreground hover:bg-accent/10',
              )}
            >
              <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          )
        })}
      </div>

      <div className="px-5 py-4 border-t border-border">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground/40 font-mono">datos &rarr; paz</div>
      </div>
    </nav>
  )
}
