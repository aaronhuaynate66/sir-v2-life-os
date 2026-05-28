// SIR V2 — Timeline icons + colors (Fase 3a Issue #70)
// Mapa centralizado para que TimelineCard renderice el icon + tag de color
// adecuados sin un switch en cada componente.

import {
  BookOpen,
  Brain,
  Heart,
  Moon,
  Wallet,
  Bell,
  Target,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { TimelineEventType } from './types'

export interface TypeVisual {
  Icon: LucideIcon
  label: string
  /** Tailwind classes para el chip (bg + border + text). Pegado al theme. */
  chipClass: string
  /** Color del icono propio (solo text-*). */
  iconClass: string
}

export const TYPE_VISUALS: Record<TimelineEventType, TypeVisual> = {
  memory: {
    Icon: BookOpen,
    label: 'Memoria',
    chipClass: 'bg-violet-500/10 border-violet-500/30 text-violet-300',
    iconClass: 'text-violet-300',
  },
  self_metric: {
    Icon: Brain,
    label: 'Métrica',
    chipClass: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
    iconClass: 'text-emerald-300',
  },
  health: {
    Icon: Heart,
    label: 'Salud',
    chipClass: 'bg-rose-500/10 border-rose-500/30 text-rose-300',
    iconClass: 'text-rose-300',
  },
  sleep: {
    Icon: Moon,
    label: 'Sueño',
    chipClass: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300',
    iconClass: 'text-indigo-300',
  },
  finance: {
    Icon: Wallet,
    label: 'Finanzas',
    chipClass: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
    iconClass: 'text-amber-300',
  },
  signal: {
    Icon: Bell,
    label: 'Señal',
    chipClass: 'bg-sky-500/10 border-sky-500/30 text-sky-300',
    iconClass: 'text-sky-300',
  },
  goal_event: {
    Icon: Target,
    label: 'Objetivo',
    chipClass: 'bg-primary/10 border-primary/30 text-primary',
    iconClass: 'text-primary',
  },
  relational_event: {
    Icon: Users,
    label: 'Relación',
    chipClass: 'bg-blue-500/10 border-blue-500/30 text-blue-300',
    iconClass: 'text-blue-300',
  },
}
