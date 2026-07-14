'use client'
// SIR V2 — SIRPulseWidget: resumen expandible de 3 celdas para /panel.
//
// Estado normal: 3 celdas compactas (peace, urgente, novedad) con navegación
// directa a la vista relevante.
//
// Al click en el ícono ▾ de cualquiera → expande in-place con detalle:
//   - Peace: top 3 personas en riesgo con mini info (equivale a Empezá por acá).
//   - Urgente: top 3 personas con el título del pendiente + delta días.
//   - Novedad: últimas 3 alertas con from → to y persona.
//
// Los datos ya vienen del mismo fetch — solo mostramos más elementos.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { Activity, AlertCircle, ChevronDown, ChevronRight, Sparkles } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface Persona {
  personId: string
  personName: string
  personSlug: string | null
  reason: 'overdue' | 'multiple' | 'due_soon' | 'low_tone'
  overdueCount: number
  dueSoonCount: number
  toneAvg: number | null
  mostUrgentTitle: string | null
  mostUrgentDaysDelta: number | null
}

interface Alert {
  id: string
  person_id: string
  person_name: string
  person_slug: string | null
  from_label: string
  to_label: string
  message: string
  created_at: string
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

type ExpandedKey = 'peace' | 'urgent' | 'flash' | null

function daysLabel(n: number | null | undefined): string {
  if (n == null) return ''
  if (n < 0) return `hace ${Math.abs(n)}d`
  if (n === 0) return 'hoy'
  if (n === 1) return 'mañana'
  return `en ${n}d`
}

export function SIRPulseWidget({ peaceScore, peaceLevel }: Props) {
  const [personas, setPersonas] = useState<Persona[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [expanded, setExpanded] = useState<ExpandedKey>(null)

  useEffect(() => {
    let cancel = false
    void fetch('/api/panel/personas-en-riesgo').then(async (r) => {
      if (cancel || !r.ok) return
      const j = (await r.json()) as { personas?: Persona[] }
      setPersonas(j.personas ?? [])
    }).catch(() => {})
    void fetch('/api/person-status-alerts').then(async (r) => {
      if (cancel || !r.ok) return
      const j = (await r.json()) as { alerts?: Alert[] }
      setAlerts(j.alerts ?? [])
    }).catch(() => {})
    return () => { cancel = true }
  }, [])

  const topPersona = personas[0] ?? null
  const newAlert = alerts[0] ?? null

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
        // Antes: '/panel' (la misma página → el clic no hacía nada visible).
        // Ahora navega a la ficha de la persona con el cambio de estado, igual
        // que 'Atendé primero'. Fallback al listado si falta el slug.
        href: newAlert.person_slug ? `/relaciones/${newAlert.person_slug}` : '/relaciones',
        class: LEVEL_CLASS.warn,
      }
    : { label: 'Novedad', value: 'Sin cambios', sub: 'nada nuevo hoy', href: '/panel', class: 'text-muted-foreground border-border bg-muted/30' }

  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="mb-4 space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <PulseCell
          {...peaceCell}
          icon={<Activity size={13} strokeWidth={1.75} className="opacity-70" />}
          isExpanded={expanded === 'peace'}
          onExpand={() => setExpanded((e) => e === 'peace' ? null : 'peace')}
          canExpand={personas.length > 0}
        />
        <PulseCell
          {...urgentCell}
          icon={<AlertCircle size={13} strokeWidth={1.75} className="opacity-70" />}
          isExpanded={expanded === 'urgent'}
          onExpand={() => setExpanded((e) => e === 'urgent' ? null : 'urgent')}
          canExpand={personas.length > 1}
        />
        <PulseCell
          {...flashCell}
          icon={<Sparkles size={13} strokeWidth={1.75} className="opacity-70" />}
          isExpanded={expanded === 'flash'}
          onExpand={() => setExpanded((e) => e === 'flash' ? null : 'flash')}
          canExpand={alerts.length > 0}
        />
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <Card className="shadow-none border-border/60 bg-muted/10">
              <CardContent className="p-3">
                {expanded === 'peace' && <PeaceDetail personas={personas} peaceScore={peaceScore} />}
                {expanded === 'urgent' && <UrgentDetail personas={personas} />}
                {expanded === 'flash' && <FlashDetail alerts={alerts} />}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function PulseCell({
  label, value, sub, href, class: className, icon, isExpanded, onExpand, canExpand,
}: {
  label: string; value: string; sub: string; href: string; class: string; icon: React.ReactNode
  isExpanded: boolean; onExpand: () => void; canExpand: boolean
}) {
  return (
    <div className="relative">
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
      {canExpand && (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onExpand() }}
          className="absolute top-1 right-1 rounded p-0.5 text-current opacity-50 hover:opacity-100 hover:bg-black/10"
          aria-label={isExpanded ? 'Colapsar' : 'Expandir'}
          title={isExpanded ? 'Colapsar' : 'Ver detalle'}
        >
          <ChevronDown size={11} className={cn('transition-transform', isExpanded && 'rotate-180')} />
        </button>
      )}
    </div>
  )
}

// ─── Detalles expandidos ─────────────────────────────────────────────

function PeaceDetail({ personas, peaceScore }: { personas: Persona[]; peaceScore: number | null }) {
  const risky = personas.slice(0, 5)
  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
        Peace score {peaceScore ?? '—'} · {risky.length} vínculos en riesgo
      </div>
      {risky.length === 0 ? (
        <p className="text-xs text-muted-foreground">Tu red está tranquila.</p>
      ) : (
        <ul className="space-y-1">
          {risky.map((p) => (
            <li key={p.personId}>
              <Link
                href={p.personSlug ? `/relaciones/${p.personSlug}` : '/relaciones'}
                className="flex items-center gap-2 text-xs px-2 py-1 rounded hover:bg-muted/40"
              >
                <span className="font-medium text-foreground min-w-0 flex-1 truncate">{p.personName}</span>
                {p.overdueCount > 0 && <span className="text-[10px] text-bad">{p.overdueCount} vencido{p.overdueCount === 1 ? '' : 's'}</span>}
                {p.toneAvg != null && <span className="text-[10px] text-muted-foreground font-mono">{p.toneAvg}/5</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function UrgentDetail({ personas }: { personas: Persona[] }) {
  const top = personas.slice(0, 5)
  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
        Top {top.length} vínculos con algo abierto
      </div>
      <ul className="space-y-1.5">
        {top.map((p) => (
          <li key={p.personId}>
            <Link
              href={p.personSlug ? `/relaciones/${p.personSlug}` : '/relaciones'}
              className="flex items-start gap-2 text-xs px-2 py-1 rounded hover:bg-muted/40"
            >
              <span className="font-medium text-foreground min-w-0 flex-1">
                {p.personName.split(' ')[0]}
                <span className="block text-[10px] text-muted-foreground font-normal mt-0.5 leading-relaxed">
                  {p.mostUrgentTitle ?? '(sin título)'}{p.mostUrgentDaysDelta != null && ` · ${daysLabel(p.mostUrgentDaysDelta)}`}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function FlashDetail({ alerts }: { alerts: Alert[] }) {
  const top = alerts.slice(0, 5)
  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {top.length} alerta{top.length === 1 ? '' : 's'} activa{top.length === 1 ? '' : 's'}
      </div>
      <ul className="space-y-1.5">
        {top.map((a) => (
          <li key={a.id}>
            <Link
              href={a.person_slug ? `/relaciones/${a.person_slug}` : '/panel'}
              className="flex items-start gap-2 text-xs px-2 py-1 rounded hover:bg-muted/40"
            >
              <span className="font-medium text-foreground min-w-0 flex-1">
                {a.person_name.split(' ')[0]}
                <span className="block text-[10px] text-muted-foreground font-normal mt-0.5">
                  {a.from_label} → <span className="font-medium">{a.to_label}</span>
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
