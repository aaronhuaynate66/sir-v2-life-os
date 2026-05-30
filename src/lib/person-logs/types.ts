// SIR V2 — Tipos compartidos para person_logs (Sesion 6).
//
// Storage Supabase-native (tabla `person_logs`, migration 0013) para
// dos features del detail page V1:
//   - #5 Registro rapido (mood / energy / sleep / pain).
//   - #14 Registrar interaccion (kind='interaction').
//
// La data alimenta correlaciones futuras (Fase 3c) — fase lunar, ciclo,
// engagement con la persona.

export type PersonLogKind =
  | 'mood'
  | 'energy'
  | 'sleep'
  | 'pain'
  | 'interaction'

/** Set inmutable usado tanto en validacion server como en UI selectors. */
export const PERSON_LOG_KINDS: readonly PersonLogKind[] = [
  'mood',
  'energy',
  'sleep',
  'pain',
  'interaction',
] as const

/** Row materializado en TypeScript (camelCase). */
export interface PersonLog {
  id: string
  userId: string
  personId: string
  kind: PersonLogKind
  /** Escala 1-5. CHECK en DB lo enforza. */
  value: number
  /** Nota libre opcional. */
  note: string | null
  /** Cuando ocurrió la observación (mismo concepto que observed_at en
   *  observations: "cuándo paso", no "cuando se insertó"). */
  loggedAt: string
  createdAt: string
}
