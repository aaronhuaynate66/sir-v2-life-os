// SIR V2 — Pipeline comercial: leads sacados de tus vínculos.
// Una persona es LEAD si sus tags incluyen 'comercial' o 'marlab'. El pipeline
// los ordena por ENFRIAMIENTO (días sin contacto, más frío primero) para que
// una oportunidad con monto no se te muera por no responder a tiempo.
// Determinístico, sin IA.

import type { Person } from '@/types'

export interface CommercialLead {
  id: string
  name: string
  slug: string | null
  /** Días desde el último contacto (null si nunca). */
  daysSinceContact: number | null
  /** Última línea de notas (contexto de la oportunidad), si hay. */
  lastNote: string | null
  /** true si el lead se está enfriando (>7 días sin contacto, o sin contacto). */
  cooling: boolean
}

const LEAD_TAGS = ['comercial', 'marlab', 'lead', 'cliente', 'prospecto']
const COOL_DAYS = 7
const DAY = 86_400_000

export function isCommercialLead(p: Person): boolean {
  const tags = (p.tags ?? []).map((t) => t.toLowerCase())
  return LEAD_TAGS.some((t) => tags.includes(t))
}

function daysSince(iso: string | undefined, now: Date): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  return Math.floor((now.getTime() - t) / DAY)
}

function lastNoteLine(notes: string | undefined): string | null {
  if (!notes) return null
  const lines = notes.split('\n').map((l) => l.trim()).filter(Boolean)
  return lines.length ? lines[lines.length - 1].slice(0, 120) : null
}

/** Leads ordenados por enfriamiento (más frío primero). */
export function buildCommercialPipeline(people: Person[], now: Date = new Date()): CommercialLead[] {
  return people
    .filter(isCommercialLead)
    .map((p) => {
      const d = daysSince(p.lastContact, now)
      return {
        id: p.id,
        name: p.name,
        slug: p.slug ?? null,
        daysSinceContact: d,
        lastNote: lastNoteLine(p.notes),
        cooling: d === null || d > COOL_DAYS,
      }
    })
    .sort((a, b) => {
      // null (nunca) = lo más frío; luego por más días.
      const da = a.daysSinceContact ?? Number.MAX_SAFE_INTEGER
      const db = b.daysSinceContact ?? Number.MAX_SAFE_INTEGER
      return db - da
    })
}
