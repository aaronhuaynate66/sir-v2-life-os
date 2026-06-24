'use client'
// SIR V2 — Navigation
// Sidebar moderno con iconos lucide y active state en acento coral.
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Brain, Users, Target, DollarSign, Bell, Archive, History, Network, Camera, CalendarRange, Clock, LineChart, LogOut, Activity, Heart, Building2, Sparkles, Calculator, Handshake, CalendarDays, Pill, Gauge } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'

interface NavItem {
  href: string
  label: string
  Icon: LucideIcon
}

interface NavGroup {
  title: string
  items: readonly NavItem[]
}

// Agrupado en 5 secciones (antes 16 ítems planos). /agenda y /buscar ya no
// figuran: se fusionaron en /horario y /memoria respectivamente (redirigen).
const NAV_GROUPS: readonly NavGroup[] = [
  {
    title: 'Hoy',
    items: [
      { href: '/panel', label: 'Mission Control', Icon: LayoutDashboard },
      { href: '/sir', label: 'Preguntá a SIR', Icon: Sparkles },
      { href: '/horario', label: 'Horario', Icon: Clock },
      { href: '/dia', label: 'Qué pasó el día', Icon: CalendarDays },
    ],
  },
  {
    title: 'Yo',
    items: [
      { href: '/yo', label: 'Yo', Icon: Brain },
      { href: '/salud', label: 'Salud', Icon: Heart },
      { href: '/habitos', label: 'Hábitos', Icon: Activity },
      { href: '/medicacion', label: 'Medicación', Icon: Pill },
      { href: '/finanzas', label: 'Finanzas', Icon: DollarSign },
      { href: '/scores', label: 'Cómo se calcula', Icon: Calculator },
    ],
  },
  {
    title: 'Gente',
    items: [
      { href: '/relaciones', label: 'Relaciones', Icon: Users },
      { href: '/empresas', label: 'Empresas', Icon: Building2 },
      { href: '/red', label: 'Red', Icon: Network },
    ],
  },
  {
    title: 'Crecimiento',
    items: [
      { href: '/objetivos', label: 'Objetivos', Icon: Target },
      { href: '/oportunidades', label: 'Oportunidades', Icon: Handshake },
      { href: '/seguimiento', label: 'Seguimiento', Icon: LineChart },
      { href: '/senales', label: 'Señales', Icon: Bell },
    ],
  },
  {
    title: 'Archivo',
    items: [
      { href: '/captura', label: 'Captura', Icon: Camera },
      { href: '/memoria', label: 'Memoria', Icon: Archive },
      { href: '/historial', label: 'Historial', Icon: History },
      { href: '/resumen', label: 'Resumen', Icon: CalendarRange },
      { href: '/consumo', label: 'Consumo IA', Icon: Gauge },
    ],
  },
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
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-brand" aria-hidden="true" />
          <span className="text-sm font-semibold tracking-tight text-foreground">SIR V2</span>
        </div>
        <div className="text-xs text-muted-foreground font-sans mt-1 pl-4">Life OS</div>
      </div>

      <div className="flex-1 py-3 px-2 flex flex-col gap-0.5 overflow-y-auto">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="mb-1">
            <div className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-[0.1em] text-muted-foreground/50 font-sans select-none">
              {group.title}
            </div>
            {group.items.map(({ href, label, Icon }) => {
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
                      ? 'bg-secondary text-foreground border-l-brand'
                      : 'text-muted-foreground border-l-transparent hover:text-foreground hover:bg-secondary/60',
                  )}
                >
                  <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
                  <span>{label}</span>
                </Link>
              )
            })}
          </div>
        ))}
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
          className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-bad hover:bg-bad-soft transition-colors"
        >
          <LogOut size={16} strokeWidth={1.75} aria-hidden="true" />
          <span>Cerrar sesión</span>
        </button>
      </div>
    </nav>
  )
}
