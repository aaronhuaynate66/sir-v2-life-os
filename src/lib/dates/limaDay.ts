// SIR V2 — Día calendario en Lima (UTC-5 fijo) a partir de un instante ISO.
//
// POR QUÉ: los registros (self-metrics, capturas) guardan un timestamp ISO en
// UTC. Derivar el "día" con slice(0,10) toma la fecha UTC → un registro hecho
// a las 22:28 de Lima cae en el día SIGUIENTE (03:28 UTC). Para agrupar/mostrar
// por día hay que convertir a la fecha de PARED de Lima. Determinístico, sin Intl.

import { LIMA_UTC_OFFSET_HOURS } from '@/lib/calendar/tz'

const HOUR_MS = 3_600_000

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * Día calendario de Lima ('YYYY-MM-DD') para un ISO dado.
 *  - Si el ISO trae hora (contiene 'T') → es un INSTANTE: lo corremos −5h y
 *    tomamos la fecha de pared de Lima.
 *  - Si es date-only ('YYYY-MM-DD') → ya es una fecha local, se devuelve igual
 *    (NO restar offset: no tiene hora, restar la mandaría al día anterior).
 *  null si no se puede parsear.
 */
export function limaDayKey(iso: string | null | undefined): string | null {
  if (!iso) return null
  if (iso.includes('T')) {
    const t = Date.parse(iso)
    if (Number.isFinite(t)) {
      const lima = new Date(t - LIMA_UTC_OFFSET_HOURS * HOUR_MS)
      return `${lima.getUTCFullYear()}-${pad2(lima.getUTCMonth() + 1)}-${pad2(lima.getUTCDate())}`
    }
  }
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

/** Día de HOY en Lima ('YYYY-MM-DD'). `nowMs` inyectable para tests. */
export function todayLimaKey(nowMs: number = Date.now()): string {
  return limaDayKey(new Date(nowMs).toISOString())!
}
