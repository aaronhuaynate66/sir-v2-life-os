// SIR V2 — Momentos / Decisiones relacionales (tipos compartidos).
export type MomentStatus = 'abierto' | 'resuelto'

export interface RelationshipMoment {
  id: string
  personId: string
  title: string
  detail: string | null
  status: MomentStatus
  occurredOn: string        // YYYY-MM-DD
  followUpOn: string | null // YYYY-MM-DD
  resolution: string | null
  createdAt: string
  updatedAt: string
}

interface RawMomentRow {
  id: string
  person_id: string
  title: string
  detail: string | null
  status: string
  occurred_on: string
  follow_up_on: string | null
  resolution: string | null
  created_at: string
  updated_at: string
}

/** Normaliza una fila de DB → tipo de dominio. */
export function mapMomentRow(r: RawMomentRow): RelationshipMoment {
  return {
    id: r.id,
    personId: r.person_id,
    title: r.title,
    detail: r.detail,
    status: r.status === 'resuelto' ? 'resuelto' : 'abierto',
    occurredOn: (r.occurred_on || '').slice(0, 10),
    followUpOn: r.follow_up_on ? r.follow_up_on.slice(0, 10) : null,
    resolution: r.resolution,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}
