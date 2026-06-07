// SIR V2 — /horario · reloj Lima (helpers puros, sin React ni Intl).
//
// Conversión ms ↔ reloj de pared Lima usando el offset fijo UTC-5 (lib/tz),
// igual que dayPlan.ts. Vive aparte de components/horario/parts.tsx (que es un
// componente cliente) para poder usarse en libs puras y rutas de API sin
// arrastrar React al grafo del server.

import { LIMA_UTC_OFFSET_HOURS } from '@/lib/calendar/tz'

const MIN = 60_000

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** ms (UTC) → 'HH:MM' (24h, reloj Lima). Determinístico, sin Intl. */
export function msToLimaHHMM(ms: number): string {
  const d = new Date(ms - LIMA_UTC_OFFSET_HOURS * 60 * MIN)
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`
}

/** Duración en minutos → formato corto ("2h", "1h 30m", "45m"). */
export function formatDurationMin(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}
