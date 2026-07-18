// SIR V2 — Tipos de señales de timing relacional (contact_activity, mig 0150).

export type ContactSignalKind =
  | 'traveling'      // de viaje / escapada
  | 'busy'           // a full / con trabajo encima
  | 'away'           // fuera, desconectada/o
  | 'focus'          // modo concentración / no molestar
  | 'available'      // por acá, relajada/o (buen momento)
  | 'posting_burst'  // posteando seguido (activa/o ahora)
  | 'job_change'     // cambió de trabajo/headline
  | 'life_event'     // evento de vida grande (mudanza, viaje largo, etc.)
  | 'other'

export type ContactSignalSource = 'manual' | 'instagram' | 'linkedin' | 'whatsapp' | 'inferred'

export interface ContactSignal {
  id: string
  personId: string
  kind: ContactSignalKind
  detail: string | null
  source: ContactSignalSource
  /** ISO. */
  observedAt: string
  /** ISO o null (el motor usa TTL por tipo si es null). */
  expiresAt: string | null
}

/** Fila cruda de Supabase → ContactSignal. Tolerante a nulls. */
export function rowToContactSignal(r: Record<string, unknown>): ContactSignal {
  const kind = r.kind as ContactSignalKind
  return {
    id: String(r.id ?? ''),
    personId: String(r.person_id ?? ''),
    kind: (['traveling', 'busy', 'away', 'focus', 'available', 'posting_burst', 'job_change', 'life_event', 'other'] as const).includes(kind) ? kind : 'other',
    detail: (r.detail as string | null) ?? null,
    source: (['manual', 'instagram', 'linkedin', 'whatsapp', 'inferred'] as const).includes(r.source as ContactSignalSource) ? (r.source as ContactSignalSource) : 'manual',
    observedAt: String(r.observed_at ?? ''),
    expiresAt: (r.expires_at as string | null) ?? null,
  }
}
