'use client'
// SIR V2 — SIRPulseWidget: resumen de 3 celdas para arriba del todo en /panel.
//
// Filosofía: cuando Aaron abre /panel a la mañana, en el primer segundo debe
// leer 3 cosas: cómo está su energía global (peace score), qué acción urgente
// hay HOY (moment overdue más caliente), y qué señal nueva apareció (alerta).
//
// Cero data nueva: cruza fuentes que YA existen:
//   - peace score → calculatePeaceScore(bio, fin, rel) ya lo usa /panel.
//   - urgencia → /api/panel/personas-en-riesgo (mismo que PersonasEnRiesgoCard).
//   - flash → /api/person-status-alerts (mismo que StatusAlertsCard).
//
// Se muestra SIEMPRE (aunque los 3 tengan estado neutral) porque es la
// brújula del día. La UX es 1 fila con 3 columnas responsive.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Activity, AlertCircle, ChevronRight, Sparkles } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface Persona {
  personId: string
  personName: string
  personSlug: string | null
  reason: 'overdue' | 'multiple' | 'due_soon' | 'low_tone'
  overdueCount: number
  mostUrgentTitle: string | null
  mostUrgentDaysDelta: number | null
}

interface Alert {
  id: string
  person_name: string
  from_label: string
  to_label: string
}

interface Props {
  peaceScore: number | null
  peaceLevel: 'ok' | 'warn' | 'bad' | null
}

const LEVEL_CLASS: Record<'ok' | 'warn' | 'bad', string> = {
  ok: 'text-ok border-ok/30 bg-ok-soft/40',
  warn: 'text-warn border-warn/30 bg-warn-soft/40',
  bad: 'text-bad border-bad/30 bg-bad-soft/40',
}

export function SIRPulseWidget({ peaceScore, peaceLevel }: Props) {
  const [topPersona, setTopPersona] = useState<Persona | null>(null)
  const [newAlert, setNewAlert] = useState<Alert | null>(null)

  useEffect(() => {
    let cancel = false
    void fetch('/api/panel/personas-en-riesgo').then(async (r) => {
      if (cancel || !r.ok) return
      const j = (await r.json()) as { personas?: Persona[] }
      setTopPersona((j.personas ?? [])[0] ?? null)
    }).catch(() => {})
    void fetch('/api/person-status-alerts').then(async (r) => {
      if (cancel || !r.ok) return
      const j = (await r.json()) as { alerts?: Alert[] }
      setNewAlert((j.alerts ?? [])[0] ?? null)
    }).catch(() => {})
    return () => { cancel = true }
  }, [])

  const peaceCell = peaceScore != null && peaceLevel
    ? { label: 'Estado', value: `${peaceScore}`, sub: 'peace score', href: '/scores', class: LEVEL_CLASS[peaceLevel] }
    : { label: 'Estado', value: '—', sub: 'sin data', href: '/panel', class: 'text-muted-foreground border-border bg-muted/30' }

  const urgentCell = topPersona
    ? {
        label: 'Atendé primero',
        value: topPersona.personName.split(' ')[0],
        sub: topPersona.mostUrgentTitle ?? (topPersona.reason === 'low_tone' ? 'tono bajo' : 'pendiente'),
        href: topPersona.personSlug ? `/relaciones/${topPersona.personSlug}` : '/relaciones',
        class: topPersona.overdueCount > 0 ? LEVEL_CLASS.bad : LEVEL_CLASS.warn,
      }
    : { label: 'Atendé primero', value: 'Todo tranquilo', sub: 'ningún pendiente urgente', href: '/relaciones', class: 'text-muted-foreground border-border bg-muted/30' }

  const flashCell = newAlert
    ? {
        label: 'Novedad',
        value: newAlert.person_name.split(' ')[0],
        sub: `${newAlert.from_label} → ${newAlert.to_label}`,
        href: '/panel',
        class: LEVEL_CLASS.warn,
      }
    : { label: 'Novedad', value: 'Sin cambios', sub: 'nada nuevo hoy', href: '/panel', class: 'text-muted-foreground border-border bg-muted/30' }

  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="mb-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <PulseCell {...peaceCell} icon={<Activity size={13} strokeWidth={1.75} className="opacity-70" />} />
        <PulseCell {...urgentCell} icon={<AlertCircle size={13} strokeWidth={1.75} className="opacity-70" />} />
        <PulseCell {...flashCell} icon={<Sparkles size={13} strokeWidth={1.75} className="opacity-70" />} />
      </div>
    </motion.div>
  )
}

function PulseCell({
  label, value, sub, href, class: className, icon,
}: {
  label: string; value: string; sub: string; href: string; class: string; icon: React.ReactNode
}) {
  return (
    <Link href={href}>
      <Card className={cn('shadow-none border transition-colors hover:opacity-90', className)}>
        <CardContent className="p-3 flex items-center gap-2">
          <div className="flex-shrink-0">{icon}</div>
          <div className="min-w-0 flex-1">
            <div className="text-[9px] uppercase tracking-widest opacity-70">{label}</div>
            <div className="text-sm font-semibold truncate">{value}</div>
            <div className="text-[10px] opacity-70 truncate">{sub}</div>
          </div>
          <ChevronRight size={12} className="flex-shrink-0 opacity-50" aria-hidden="true" />
        </CardContent>
      </Card>
    </Link>
  )
}
