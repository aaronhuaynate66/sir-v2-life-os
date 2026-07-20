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
  /** IDs de TODAS las personas involucradas (primaria + participantes).
   *  Lo llena la API (no la fila cruda). Undefined = legacy/no resuelto. */
  participantIds?: string[]
  /** Cruce chat→tema (#845): el cron `moment-scan` marca si el chat reciente ya
   *  parece haber resuelto este tema, con la frase de evidencia. Sirve para
   *  mostrar la sugerencia al instante (sin re-llamar al LLM). */
  resolutionSuggested?: boolean
  resolutionEvidence?: string | null
  resolutionConfidence?: string | null
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
  resolution_suggested?: boolean | null
  resolution_evidence?: string | null
  resolution_confidence?: string | null
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
    resolutionSuggested: r.resolution_suggested === true,
    resolutionEvidence: r.resolution_evidence ?? null,
    resolutionConfidence: r.resolution_confidence ?? null,
  }
}
