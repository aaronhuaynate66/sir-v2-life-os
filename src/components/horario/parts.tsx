'use client'

// SIR V2 — /horario: piezas compartidas entre las vistas Día/Semana/Mes.
//
// Formatters de hora/countdown (TZ Lima) y filas/tarjetas reutilizables para
// tareas OKR, fechas de la red, hitos del mes, focos y estado físico. La UI
// sólo pinta: toda la lógica vive en lib/horario/*.

import Link from 'next/link'
import {
  AlertCircle,
  CalendarHeart,
  Cake,
  ChevronRight,
  Clock,
  Gift,
  HeartPulse,
  ListChecks,
  Lock,
  Moon,
  Scale,
  Settings2,
  Target,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type {
  CockpitDate,
  CockpitMilestone,
  CockpitTask,
  FocusKR,
} from '@/lib/horario/cockpit'
import type { PhysicalState } from '@/lib/horario/physical'

const LIMA_TZ = 'America/Lima'

export function limaTime(iso: string): string {
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: LIMA_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

/** Igual que limaTime pero desde un timestamp en ms (para filas del plan del día). */
export function limaTimeMs(ms: number): string {
  return limaTime(new Date(ms).toISOString())
}

/** Duración de un hueco libre en formato corto ("2h", "1h 30m", "45m"). */
export function formatGapDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

/** ms → "2h 05m" o "05m 12s" (countdowns cortos). */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return 'ahora'
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`
  return `${s}s`
}

/** Etiqueta de día Lima ("hoy", "mañana", o "lun 03 jun"). */
export function dayLabel(dateKey: string, offset: number): string {
  if (offset === 0) return 'Hoy'
  if (offset === 1) return 'Mañana'
  // dateKey 'YYYY-MM-DD' → parse a mediodía UTC para evitar shift al formatear.
  const d = new Date(`${dateKey}T12:00:00Z`)
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: LIMA_TZ,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(d)
}

// ─── Filas ─────────────────────────────────────────────────────────────

/** Color del countdown según urgencia (vencido → bad, hoy/mañana → warn). */
function urgencyClass(daysUntil: number): string {
  if (daysUntil < 0) return 'text-bad'
  if (daysUntil <= 1) return 'text-warn'
  return 'text-muted-foreground'
}

function phraseFor(daysUntil: number, overdue: boolean): string {
  if (overdue) {
    const n = Math.abs(daysUntil)
    return `vencida hace ${n} día${n === 1 ? '' : 's'}`
  }
  if (daysUntil === 0) return 'hoy'
  if (daysUntil === 1) return 'mañana'
  return `en ${daysUntil} días`
}

export function TaskRow({ task, showObjective = true }: { task: CockpitTask; showObjective?: boolean }) {
  // Bloqueada (urgencia/bloqueo) gana el ícono y color; si no, vencida=bad, ok si no.
  const Icon = task.blocked ? Lock : ListChecks
  const iconCls = task.blocked || task.overdue ? 'text-bad' : 'text-ok'
  return (
    <Link
      href={task.href}
      className="flex items-center gap-3 rounded-md px-2 py-2 -mx-2 hover:bg-accent/10 transition-colors group"
    >
      <Icon size={15} strokeWidth={1.75} className={cn('shrink-0', iconCls)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          {task.priority === 'high' && (
            <span className="text-brand-soft-foreground text-[10px]" title="Prioridad alta" aria-hidden="true">
              ●
            </span>
          )}
          <span className="text-sm text-foreground truncate">{task.title}</span>
        </div>
        <div className="text-[11px] text-muted-foreground truncate">
          {showObjective ? `${task.objectiveTitle} · ` : ''}
          <span className={urgencyClass(task.daysUntil)}>{phraseFor(task.daysUntil, task.overdue)}</span>
          {task.blocked && <span className="text-bad"> · bloqueada</span>}
        </div>
      </div>
    </Link>
  )
}

const DATE_ICON: Record<CockpitDate['kind'], LucideIcon> = {
  birthday: Cake,
  special_date: CalendarHeart,
}

export function DateRow({ date }: { date: CockpitDate }) {
  const Icon = DATE_ICON[date.kind]
  return (
    <Link
      href={date.href}
      className="flex items-start gap-3 rounded-md px-2 py-2 -mx-2 hover:bg-accent/10 transition-colors group"
    >
      <Icon size={15} strokeWidth={1.75} className="shrink-0 mt-0.5 text-brand-soft-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="text-sm text-foreground truncate">{date.title}</div>
        <div className="text-[11px] text-muted-foreground truncate">{date.detail}</div>
        <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-brand-soft-foreground">
          <Gift size={11} strokeWidth={1.75} aria-hidden="true" />
          {date.nudge}
        </div>
      </div>
      <span className={cn('text-[11px] font-mono tabular-nums shrink-0', urgencyClass(date.daysUntil))}>
        {date.daysUntil === 0 ? 'hoy' : `${date.daysUntil}d`}
      </span>
    </Link>
  )
}

const MILESTONE_ICON: Record<CockpitMilestone['kind'], LucideIcon> = {
  goal_target: Target,
  step_deadline: ListChecks,
  date: CalendarHeart,
}

const MILESTONE_ACCENT: Record<CockpitMilestone['kind'], string> = {
  goal_target: 'text-brand-soft-foreground',
  step_deadline: 'text-ok',
  date: 'text-brand-soft-foreground',
}

export function MilestoneRow({ milestone }: { milestone: CockpitMilestone }) {
  const Icon = MILESTONE_ICON[milestone.kind]
  return (
    <Link
      href={milestone.href}
      className="flex items-center gap-3 rounded-md px-2 py-2 -mx-2 hover:bg-accent/10 transition-colors group"
    >
      <Icon
        size={15}
        strokeWidth={1.75}
        className={cn('shrink-0', milestone.overdue ? 'text-bad' : MILESTONE_ACCENT[milestone.kind])}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm text-foreground truncate">{milestone.title}</div>
        <div className="text-[11px] text-muted-foreground truncate">{milestone.detail}</div>
      </div>
      <span className={cn('text-[11px] font-mono tabular-nums shrink-0', urgencyClass(milestone.daysUntil))}>
        {milestone.daysUntil < 0 ? `−${Math.abs(milestone.daysUntil)}d` : milestone.daysUntil === 0 ? 'hoy' : `${milestone.daysUntil}d`}
      </span>
    </Link>
  )
}

export function FocusRow({ kr }: { kr: FocusKR }) {
  const phrase =
    kr.daysUntil == null
      ? 'sin fecha'
      : kr.daysUntil < 0
        ? `vencido hace ${Math.abs(kr.daysUntil)}d`
        : kr.daysUntil === 0
          ? 'vence hoy'
          : `en ${kr.daysUntil} días`
  return (
    <Link
      href={kr.href}
      className="flex items-center gap-3 rounded-md px-2 py-2 -mx-2 hover:bg-accent/10 transition-colors group"
    >
      <Target size={15} strokeWidth={1.75} className="shrink-0 text-brand" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="text-sm text-foreground truncate">{kr.title}</div>
        <div className="text-[11px] text-muted-foreground truncate">
          {kr.objectiveTitle} ·{' '}
          <span className={kr.daysUntil != null ? urgencyClass(kr.daysUntil) : undefined}>{phrase}</span>
        </div>
      </div>
      <span className="text-[11px] font-mono tabular-nums text-muted-foreground shrink-0">{kr.progressPct}%</span>
    </Link>
  )
}

// ─── Estado físico (Día) ─────────────────────────────────────────────────

function fmtDate(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso.length <= 10 ? `${iso.slice(0, 10)}T12:00:00Z` : iso)
  return new Intl.DateTimeFormat('es-PE', { timeZone: LIMA_TZ, day: '2-digit', month: 'short' }).format(d)
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon size={16} strokeWidth={1.75} className="text-muted-foreground/70 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary leading-none">{label}</div>
        <div className="text-sm text-foreground mt-0.5 font-mono tabular-nums">
          {value}
          {hint && <span className="text-[11px] text-muted-foreground/60 ml-1.5 font-sans">{hint}</span>}
        </div>
      </div>
    </div>
  )
}

/** Grid de stats físicos (sueño/energía/peso/FC). Reusado por la tarjeta y por
 *  el strip plegado de contexto. */
function PhysicalStats({ state }: { state: PhysicalState }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
      {state.sleepHours != null && (
        <Stat
          icon={Moon}
          label="Sueño"
          value={`${state.sleepHours} h`}
          hint={state.sleepQuality != null ? `calidad ${state.sleepQuality}/10` : undefined}
        />
      )}
      {state.energy != null && <Stat icon={Zap} label="Energía" value={`${state.energy}/10`} />}
      {state.weightKg != null && (
        <Stat icon={Scale} label="Peso" value={`${state.weightKg} kg`} hint={fmtDate(state.weightAt)} />
      )}
      {state.heartRate != null && (
        <Stat icon={HeartPulse} label="FC" value={`${state.heartRate} lpm`} hint={fmtDate(state.heartRateAt)} />
      )}
    </div>
  )
}

export function PhysicalStateCard({ state }: { state: PhysicalState }) {
  if (state.empty) return null
  return (
    <Card className="shadow-none">
      <CardContent className="p-4 sm:p-5">
        <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary mb-3">Estado del día</div>
        <PhysicalStats state={state} />
      </CardContent>
    </Card>
  )
}

/**
 * Contexto físico del día PLEGADO y al FINAL: /horario cuenta la historia del
 * TIEMPO, no la biológica. El peso/sueño/energía viven en /yo; acá quedan como
 * contexto opcional, cerrado por default, para no abrir la página con ellos.
 */
export function DayContextStrip({ state }: { state: PhysicalState }) {
  if (state.empty) return null
  return (
    <details className="group rounded-md border border-border/60 bg-muted/15">
      <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer list-none text-sm text-muted-foreground hover:text-foreground transition-colors">
        <HeartPulse size={13} strokeWidth={1.75} className="shrink-0 text-muted-foreground/70" aria-hidden="true" />
        <span className="flex-1">Contexto del día</span>
        <ChevronRight
          size={14}
          strokeWidth={2}
          className="shrink-0 text-muted-foreground/60 transition-transform group-open:rotate-90"
          aria-hidden="true"
        />
      </summary>
      <div className="px-3 pb-3 pt-1">
        <PhysicalStats state={state} />
        <p className="mt-3 text-[11px] text-muted-foreground/60">
          Tu estado físico completo (peso, sueño, salud) vive en{' '}
          <Link href="/salud" className="underline underline-offset-2 hover:text-foreground">
            /salud
          </Link>
          .
        </p>
      </div>
    </details>
  )
}

// ─── Notas / hints ───────────────────────────────────────────────────────

export function CalendarHint({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70 px-2 py-1.5">
        <Settings2 size={12} strokeWidth={1.75} aria-hidden="true" />
        Conectá tu calendario en{' '}
        <Link href="/agenda" className="text-primary hover:underline">
          /agenda
        </Link>{' '}
        para ver tus eventos acá.
      </div>
    )
  }
  return (
    <Card className="shadow-none">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-1.5">
          <Settings2 size={15} strokeWidth={1.75} className="text-muted-foreground" aria-hidden="true" />
          <span className="text-sm font-medium text-foreground/90">Conectá tu calendario</span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Los eventos (reuniones, citas) salen de tu calendario. Conectalo desde{' '}
          <Link href="/agenda" className="text-primary hover:underline">
            /agenda
          </Link>{' '}
          o seteá <span className="font-mono text-foreground/80">OUTLOOK_ICS_URL</span>. Mientras tanto, abajo ves
          igual tus objetivos y fechas.
        </p>
      </CardContent>
    </Card>
  )
}

export function EmptyNote({ tone = 'muted', children }: { tone?: 'warn' | 'muted'; children: React.ReactNode }) {
  const Icon = tone === 'warn' ? AlertCircle : Clock
  const color = tone === 'warn' ? 'text-warn' : 'text-muted-foreground/60'
  return (
    <Card className="shadow-none">
      <CardContent className="p-8 text-center">
        <Icon size={22} strokeWidth={1.5} className={cn('mx-auto mb-2', color)} aria-hidden="true" />
        <p className="text-sm text-muted-foreground">{children}</p>
      </CardContent>
    </Card>
  )
}
