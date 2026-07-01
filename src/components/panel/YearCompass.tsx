// SIR V2 — "TU AÑO": brújula anual sobre Mission Control.
//
// Tres niveles de jerarquía (mockup v3 aprobado por Aaron):
//   1. LÍNEA DEL AÑO — ENE…DIC con "ESTÁS AQUÍ ▼" sobre el mes actual;
//      puntos en los meses con hito; anillo en el mes del ANCLA.
//   2. PRÓXIMOS — los siguientes hitos del año, atenuándose con la distancia.
//   3. EL ANCLA — el norte del año, con énfasis máximo al final.
//
// Estética monocromática dark + monospace + mucho aire. Esta es una EXCEPCIÓN
// deliberada a la paleta canónica de tokens (como el grafo y el dossier de
// print): los grises exactos del mockup definen la jerarquía visual y se usan
// como valores arbitrarios a propósito.
//
// Mount-safe: depende de "hoy" → diferimos el cómputo a post-mount (igual que
// ProximoPanel / /panel) para no romper la hidratación.
//
// Interacción: tocar un próximo o el ancla navega a ese objetivo en /objetivos
// (deep-link ?goal=<id>).

'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { useGoalStore } from '@/stores/useGoalStore'
import { buildYearCompass, type YearCompass } from '@/lib/year-compass/build'
import { computeNorteDrift, type NorteDrift } from '@/lib/self/norteDrift'
import { track, EVENTS } from '@/lib/analytics/track'
import { cn } from '@/lib/utils'

// Grises exactos del mockup (monocromático).
const C_PAST = '#3E3E42'   // meses pasados — gris apagado
const C_FUTURE = '#E4E4E6' // meses futuros — gris claro
const C_DOT = '#8A8A8E'    // punto de hito — gris medio
// Atenuación de "próximos" según se alejan (el más cercano primero).
const UPCOMING_COLORS = ['#8A8A8E', '#6E6E72', '#56565A']

export function YearCompass() {
  const goals = useGoalStore((s) => s.goals)

  // Mount-safe: buildYearCompass depende de Date.now().
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
  }, [])

  const compass: YearCompass | null = now ? buildYearCompass(goals, now) : null
  const drift: NorteDrift | null = now ? computeNorteDrift(goals, now) : null

  return (
    <section
      aria-label="Tu año"
      className="mb-8 sm:mb-10 select-none"
    >
      {compass == null ? (
        <CompassSkeleton />
      ) : (
        <>
          <YearLine compass={compass} />
          <UpcomingList compass={compass} />
          <Anchor compass={compass} drift={drift} />
        </>
      )}
    </section>
  )
}

// ─── 1. Línea del año ─────────────────────────────────────────────────
function YearLine({ compass }: { compass: YearCompass }) {
  const { months, currentMonthIndex } = compass
  // Posición horizontal del marcador "ESTÁS AQUÍ" sobre el centro del mes actual.
  const markerLeft = `${((currentMonthIndex + 0.5) / 12) * 100}%`

  return (
    <div className="relative pt-7">
      {/* Marcador ESTÁS AQUÍ ▼ */}
      <div
        className="absolute top-0 flex flex-col items-center"
        style={{ left: markerLeft, transform: 'translateX(-50%)' }}
      >
        <span className="text-[9px] tracking-[0.2em] font-mono text-white/80 whitespace-nowrap">
          ESTÁS AQUÍ
        </span>
        <span className="text-white text-[10px] leading-none mt-0.5" aria-hidden="true">
          ▼
        </span>
      </div>

      {/* Meses */}
      <div className="grid grid-cols-12 gap-0">
        {months.map((m) => (
          <span
            key={m.index}
            className={cn(
              'text-center font-mono text-[9px] sm:text-[11px] tracking-wider',
              m.isCurrent && 'text-white font-bold',
              m.isAnchorMonth && !m.isCurrent && 'text-white font-bold',
            )}
            style={
              m.isCurrent || m.isAnchorMonth
                ? undefined
                : { color: m.isPast ? C_PAST : C_FUTURE }
            }
          >
            {m.label}
          </span>
        ))}
      </div>

      {/* Puntos de hito */}
      <div className="grid grid-cols-12 gap-0 mt-2">
        {months.map((m) => (
          <span key={m.index} className="flex justify-center h-2.5 items-center">
            {m.isAnchorMonth ? (
              // Mes del ancla: punto blanco con anillo.
              <span
                className="block w-1.5 h-1.5 rounded-full bg-white ring-1 ring-offset-1 ring-white/60 ring-offset-transparent"
                aria-hidden="true"
              />
            ) : m.hasMilestone ? (
              <span
                className="block w-1 h-1 rounded-full"
                style={{ backgroundColor: C_DOT }}
                aria-hidden="true"
              />
            ) : null}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── 2. Próximos ──────────────────────────────────────────────────────
function UpcomingList({ compass }: { compass: YearCompass }) {
  if (compass.upcoming.length === 0) return null
  return (
    <div className="mt-7 space-y-1.5">
      {compass.upcoming.map((m, i) => {
        const color = UPCOMING_COLORS[i] ?? UPCOMING_COLORS[UPCOMING_COLORS.length - 1]
        return (
          <Link
            key={m.id}
            href={`/objetivos?goal=${m.id}`}
            onClick={() => track(EVENTS.yearCompassClick, { role: 'upcoming', position: i })}
            className="block font-mono text-[11px] sm:text-xs tracking-wide transition-opacity hover:opacity-100"
            style={{ color }}
          >
            <span className="truncate">{m.title}</span>
            <span className="mx-1.5 opacity-60" aria-hidden="true">·</span>
            <span>{m.monthLabel}</span>
            <span className="mx-1.5 opacity-60" aria-hidden="true">·</span>
            <span className="tabular-nums">{m.daysUntil}d</span>
          </Link>
        )
      })}
    </div>
  )
}

// ─── 3. El ancla ──────────────────────────────────────────────────────
function Anchor({ compass, drift }: { compass: YearCompass; drift: NorteDrift | null }) {
  const a = compass.anchor
  if (!a) return null

  const DRIFT_COLOR: Record<string, string> = { enfocado: '#2dd4a7', a_medias: '#e0a93b', disperso: '#e5564c', estancado: '#e5564c', sin_norte: '#8A8A8E' }
  const DRIFT_LABEL: Record<string, string> = { enfocado: 'ENFOCADO', a_medias: 'A MEDIAS', disperso: 'DISPERSO', estancado: 'ESTANCADO', sin_norte: '' }

  return (
    <Link
      href={`/objetivos?goal=${a.id}`}
      onClick={() => track(EVENTS.yearCompassClick, { role: 'anchor' })}
      className="mt-10 block group"
    >
      <div className="font-mono text-[9px] tracking-[0.25em] mb-2" style={{ color: C_DOT }}>
        TU NORTE
      </div>
      <h2 className="font-mono font-bold text-white text-2xl sm:text-3xl lg:text-4xl tracking-tight leading-none uppercase group-hover:opacity-90 transition-opacity">
        {a.title}
      </h2>
      {a.subtitle && (
        <p className="mt-2 text-sm" style={{ color: C_DOT }}>
          {a.subtitle}
        </p>
      )}
      {a.monthLabel && a.daysUntil != null && (
        <div className="mt-3 font-mono text-xs sm:text-sm text-white tracking-[0.15em]">
          {a.monthLabel}
          <span className="mx-2 text-white/50" aria-hidden="true">·</span>
          {a.daysUntil >= 0 ? `EN ${a.daysUntil} DÍAS` : `HACE ${Math.abs(a.daysUntil)} DÍAS`}
        </div>
      )}
      {!a.monthLabel && (
        <div className="mt-3 font-mono text-xs tracking-[0.15em]" style={{ color: C_DOT }}>
          SIN FECHA OBJETIVO
        </div>
      )}
      {drift && drift.state !== 'sin_norte' && (
        <div className="mt-3 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: DRIFT_COLOR[drift.state] }} />
          <span className="font-mono text-[10px] tracking-[0.2em]" style={{ color: DRIFT_COLOR[drift.state] }}>
            {DRIFT_LABEL[drift.state]}
          </span>
          {drift.daysSinceTouch != null && (
            <span className="font-mono text-[10px] tracking-[0.15em] text-white/40">
              · ÚLTIMO AVANCE HACE {drift.daysSinceTouch}D
            </span>
          )}
        </div>
      )}
    </Link>
  )
}

/** Placeholder estable pre-mount (evita salto de layout y mismatch de hidratación). */
function CompassSkeleton() {
  return (
    <div className="pt-7" aria-hidden="true">
      <div className="grid grid-cols-12 gap-0">
        {Array.from({ length: 12 }).map((_, i) => (
          <span key={i} className="text-center font-mono text-[9px] sm:text-[11px] tracking-wider" style={{ color: C_PAST }}>
            {['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'][i]}
          </span>
        ))}
      </div>
      <div className="mt-10 h-10" />
    </div>
  )
}
