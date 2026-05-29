// SIR V2 — Builder del grafo de relaciones.
// Pure function: convierte people + relationships + profile en GraphData.

import type { Person, Relationship } from '@/types'
import { CATEGORY_COLOR, CATEGORY_LABEL } from './colors'
import type { GraphCategory, GraphData, GraphEdge, GraphNode } from './types'

/**
 * Extrae 2 iniciales de un nombre. "Diana Carolina" -> "DC".
 * "Aarón Huaynate Espinoza" -> "AH". Fallback: primeros 2 chars.
 */
export function initialsFromName(name: string | null | undefined): string {
  if (!name || typeof name !== 'string') return '?'
  const trimmed = name.trim()
  if (!trimmed) return '?'
  const parts = trimmed
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase()
}

/** Build label del nodo central a partir de profile.full_name o email. */
export function buildSelfLabel(
  selfFullName: string | null,
  selfEmail: string,
): string {
  if (selfFullName && selfFullName.trim()) {
    return initialsFromName(selfFullName)
  }
  // Fallback: iniciales del local part del email.
  const local = selfEmail.split('@')[0] ?? selfEmail
  if (local.length > 10) {
    // Email username muy largo — usar fallback amigable.
    return 'TÚ'
  }
  return initialsFromName(local) || 'TÚ'
}

/**
 * Mapea Person + Relationship + tags a una GraphCategory.
 * Reglas (en orden de precedencia):
 *  1. tag 'estrategico' o 'desarrollo' -> override directo (opt-in)
 *  2. relationship='family' -> familia
 *  3. relationship in {professional, mentor, mentee} -> profesional
 *  4. relationship in {friend, romantic} + category in {inner_circle, close} -> personal
 *  5. resto -> networking
 */
export function categoryForPerson(person: Person): GraphCategory {
  const tags = person.tags ?? []
  if (tags.includes('estrategico')) return 'estrategico'
  if (tags.includes('desarrollo')) return 'desarrollo'

  switch (person.relationship) {
    case 'family':
      return 'familia'
    case 'professional':
    case 'mentor':
    case 'mentee':
      return 'profesional'
    case 'friend':
    case 'romantic':
      return person.category === 'inner_circle' || person.category === 'close'
        ? 'personal'
        : 'networking'
    case 'acquaintance':
    default:
      return 'networking'
  }
}

/**
 * Deriva healthScore 0-100 de Relationship.depth + reciprocity.
 * Si no hay relationship row para esta person, default 50 (neutral).
 */
function healthScoreFor(rel: Relationship | undefined): number {
  if (!rel) return 50
  const depth = Number(rel.depth) || 5
  const reciprocity = Number(rel.reciprocity) || 5
  // Cada uno 1-10 -> sum 2-20 -> normalizamos a 10-100.
  return Math.round(((depth + reciprocity) / 20) * 100)
}

/** Cuenta items de history (si la relationship existe). */
function interactionCountFor(rel: Relationship | undefined): number {
  if (!rel || !Array.isArray(rel.history)) return 0
  return rel.history.length
}

/** Args del builder. */
export interface BuildGraphArgs {
  people: Person[]
  relationships: Relationship[]
  selfFullName: string | null
  selfEmail: string
}

/**
 * Construye el GraphData completo a partir de la data del store.
 * Pura — sin side effects, memoizable.
 */
export function buildGraphData({
  people,
  relationships,
  selfFullName,
  selfEmail,
}: BuildGraphArgs): GraphData {
  const relByPerson = new Map<string, Relationship>()
  for (const r of relationships) {
    // Conservar la primera relationship por person (suele haber solo una).
    if (!relByPerson.has(r.personId)) relByPerson.set(r.personId, r)
  }

  // Self node — center fijo en (0,0).
  const selfNode: GraphNode = {
    id: 'self',
    label: buildSelfLabel(selfFullName, selfEmail),
    fullName: selfFullName?.trim() || selfEmail,
    category: 'self',
    healthScore: 100,
    interactionCount: 0,
    isSelf: true,
    fx: 0,
    fy: 0,
  }

  const personNodes: GraphNode[] = []
  const edges: GraphEdge[] = []

  for (const p of people) {
    const id = p.slug?.trim() || p.id
    const rel = relByPerson.get(p.id)
    const category = categoryForPerson(p)
    personNodes.push({
      id,
      label: initialsFromName(p.alias?.trim() || p.name),
      fullName: p.alias?.trim() || p.name,
      category,
      healthScore: healthScoreFor(rel),
      interactionCount: interactionCountFor(rel),
    })
    edges.push({
      source: 'self',
      target: id,
      category,
      label: CATEGORY_LABEL[category],
      color: CATEGORY_COLOR[category],
    })
  }

  return {
    nodes: [selfNode, ...personNodes],
    edges,
  }
}
