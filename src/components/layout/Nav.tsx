'use client'
// SIR V2 — Navigation
// Sidebar moderno con iconos lucide y active state en acento coral.
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Brain, Users, Target, DollarSign, Bell, Archive, History, Network, Camera, Search, CalendarRange, CalendarClock, Clock, LogOut } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'

interface NavItem {
  href: string
  label: string
  Icon: LucideIcon
}

const NAV_ITEMS: readonly NavItem[] = [
  { href: '/panel', label: 'Mission Control', Icon: LayoutDashboard },
  { href: '/agenda', label: 'Agenda', Icon: CalendarClock },
  { href: '/horario', label: 'Horario', Icon: Clock },
  { href: '/yo', label: 'Yo', Icon: Brain },
  { href: '/relaciones', label: 'Relaciones', Icon: Users },
  { href: '/captura', label: 'Captura', Icon: Camera },
  { href: '/objetivos', label: 'Objetivos', Icon: Target },
  { href: '/finanzas', label: 'Finanzas', Icon: DollarSign },
  { href: '/senales', label: 'Señales', Icon: Bell },
  { href: '/memoria', label: 'Memoria', Icon: Archive },
  { href: '/buscar', label: 'Buscar', Icon: Search },
  { href: '/resumen', label: 'Resumen', Icon: CalendarRange },
  { href: '/historial', label: 'Historial', Icon: History },
  { href: '/red', label: 'Red', Icon: Network },
] as const

interface NavProps {
  /** Llamado al click en un item. Util para cerrar el drawer mobile al navegar. */
  onItemClick?: () => void
}

export function Nav({ onItemClick }: NavProps = {}) {
  const pathname = usePathname()
  const { user, signOut } = useAuth()

  async function handleSignOut() {
    onItemClick?.()
    await signOut()
  }

  return (
    <nav className="w-full h-full bg-background flex flex-col">
      <div className="px-5 py-5 border-b border-border">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70 font-sans">SIR V2</div>
        <div className="text-xs text-muted-foreground font-sans mt-0.5">Life OS</div>
      </div>

      <div className="flex-1 py-3 px-2 flex flex-col gap-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const active = pathname === href || (href !== '/panel' && pathname.startsWith(href))
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

      <div className="px-3 py-3 border-t border-border space-y-2">
        {user?.email && (
          <div className="px-2 truncate">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-sans mb-0.5">Sesión</div>
            <div className="text-xs text-foreground font-mono truncate" title={user.email}>{user.email}</div>
          </div>
        )}
        <button
          type="button"
          onClick={handleSignOut}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-red-400 hover:bg-red-500/5 transition-colors"
        >
          <LogOut size={16} strokeWidth={1.75} aria-hidden="true" />
          <span>Cerrar sesión</span>
        </button>
      </div>
    </nav>
  )
}
