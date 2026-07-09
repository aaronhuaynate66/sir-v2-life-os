// SIR V2 — Fase 3d: DTO de lecciones (learnings, mig 0140). Mapeo puro.

export type LearningKind = 'preference' | 'pattern' | 'principle' | 'fact'
export type LearningConfidence = 'high' | 'medium' | 'low'

export interface LearningDto {
  id: string
  text: string
  kind: LearningKind
  source: string
  confidence: LearningConfidence
  isActive: boolean
  reinforcedCount: number
  createdAt: string
}

export interface LearningDbRow {
  id: string
  text: string
  kind: string | null
  source: string | null
  confidence: string | null
  is_active: boolean | null
  reinforced_count: number | null
  created_at: string | null
}

const VALID_KIND = new Set<LearningKind>(['preference', 'pattern', 'principle', 'fact'])
const VALID_CONF = new Set<LearningConfidence>(['high', 'medium', 'low'])

export function normalizeLearningKind(raw: unknown): LearningKind {
  return VALID_KIND.has(raw as LearningKind) ? (raw as LearningKind) : 'pattern'
}
export function normalizeLearningConfidence(raw: unknown): LearningConfidence {
  return VALID_CONF.has(raw as LearningConfidence) ? (raw as LearningConfidence) : 'medium'
}

export function learningRowToDto(row: LearningDbRow): LearningDto {
  return {
    id: row.id,
    text: (row.text ?? '').trim(),
    kind: normalizeLearningKind(row.kind),
    source: row.source ?? 'relato',
    confidence: normalizeLearningConfidence(row.confidence),
    isActive: row.is_active ?? true,
    reinforcedCount: Math.max(1, row.reinforced_count ?? 1),
    createdAt: row.created_at ?? '',
  }
}

export const LEARNING_KIND_LABEL: Record<LearningKind, string> = {
  preference: 'Preferencia',
  pattern: 'Patrón',
  principle: 'Principio',
  fact: 'Hecho',
}
