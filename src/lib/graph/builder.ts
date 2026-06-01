// SIR V2 — Builder del grafo de relaciones.
// Pure function: convierte people + relationships + profile en GraphData.

import type { Person, Relationship, PersonLink } from '@/types'
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
 * Mapea Person -> GraphCategory para color/label del grafo.
 *
 * Se bucketea por TIPO DE RELACIÓN (la señal real de la naturaleza del
 * vínculo), NO por `category` (que es un tier de red: inner_circle/close/
 * network/peripheral y por defecto cae en 'network'). El bug que motivó este
 * cambio: una PAREJA (romantic) o un amigo con `category` por defecto ('network')
 * caía en 'networking' gris — semánticamente incorrecto. Tu pareja/amigos son
 * tu círculo PERSONAL, nunca "networking". El tier `category` se usa aparte
 * para la jerarquía (tamaño del nodo via importanceScore).
 *
 * Reglas (en orden de precedencia):
 *  1. tag 'estrategico' / 'desarrollo' -> override (opt-in)
 *  2. family -> familia
 *  3. romantic | friend -> personal   (pareja y amigos = círculo personal)
 *  4. professional | mentor | mentee -> profesional
 *  5. acquaintance / resto -> networking
 */
export function categoryForPerson(person: Person): GraphCategory {
  const tags = person.tags ?? []
  if (tags.includes('estrategico')) return 'estrategico'
  if (tags.includes('desarrollo')) return 'desarrollo'

  switch (person.relationship) {
    case 'family':
      return 'familia'
    case 'romantic':
    case 'friend':
      return 'personal'
    case 'professional':
    case 'mentor':
    case 'mentee':
      return 'profesional'
    case 'acquaintance':
    default:
      return 'networking'
  }
}

/** Primer nombre (token) de un nombre completo. "Diana Carolina" -> "Diana". */
export function firstName(name: string | null | undefined): string {
  if (!name || typeof name !== 'string') return ''
  const first = name.trim().split(/\s+/).filter(Boolean)[0]
  return first ?? ''
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
  /** Aristas de familia persona↔persona (migration 0035). Default []. */
  personLinks?: PersonLink[]
  /** IDs de personas con evidencia de interacción DIRECTA con self
   *  (observations curadas o person_logs). Un familiar-de-contacto que NO esté
   *  acá es de 2º grado: cuelga de su contacto, no del centro. Default []. */
  directContactIds?: string[]
  selfFullName: string | null
  selfEmail: string
}

/** Capitaliza el parentesco para el label del edge ("padre" → "Padre"). */
function kindLabel(kind: string): string {
  return kind ? kind.charAt(0).toUpperCase() + kind.slice(1) : 'Familia'
}

/**
 * Construye el GraphData completo a partir de la data del store.
 * Pura — sin side effects, memoizable.
 */
export function buildGraphData({
  people,
  relationships,
  personLinks = [],
  directContactIds = [],
  selfFullName,
  selfEmail,
}: BuildGraphArgs): GraphData {
  // 2º grado: persona que es TARGET de un vínculo de familia y NO tiene
  // interacción directa con self. Cuelga de su contacto (la arista person↔
  // person), no del centro. Un familiar que TAMBIÉN es contacto directo
  // (está en directContactIds) conserva su arista al centro.
  const directSet = new Set(directContactIds)
  const linkTargetIds = new Set(personLinks.map((l) => l.personBId))
  const isSecondDegree = (personId: string): boolean =>
    linkTargetIds.has(personId) && !directSet.has(personId)

  const relByPerson = new Map<string, Relationship>()
  for (const r of relationships) {
    // Conservar la primera relationship por person (suele haber solo una).
    if (!relByPerson.has(r.personId)) relByPerson.set(r.personId, r)
  }

  // Self node — center fijo en (0,0).
  const selfFull = selfFullName?.trim() || selfEmail
  const selfNode: GraphNode = {
    id: 'self',
    label: buildSelfLabel(selfFullName, selfEmail),
    shortName: firstName(selfFullName) || 'Yo',
    fullName: selfFull,
    category: 'self',
    healthScore: 100,
    interactionCount: 0,
    score: 10,
    isSelf: true,
    fx: 0,
    fy: 0,
  }

  const personNodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  // person.id → node id (slug || id). Para resolver las aristas de familia,
  // que se guardan por person.id pero los nodos usan slug.
  const nodeIdByPersonId = new Map<string, string>()

  for (const p of people) {
    const id = p.slug?.trim() || p.id
    nodeIdByPersonId.set(p.id, id)
    const rel = relByPerson.get(p.id)
    const category = categoryForPerson(p)
    const displayName = p.alias?.trim() || p.name
    const secondDegree = isSecondDegree(p.id)
    personNodes.push({
      id,
      label: initialsFromName(displayName),
      shortName: firstName(displayName) || initialsFromName(displayName),
      fullName: displayName,
      category,
      healthScore: healthScoreFor(rel),
      interactionCount: interactionCountFor(rel),
      score: Number.isFinite(p.importanceScore) ? p.importanceScore : 5,
      secondDegree,
    })
    // Los de 2º grado NO se conectan al centro: cuelgan de su contacto vía la
    // arista de familia (abajo). Los contactos directos sí van al centro.
    if (!secondDegree) {
      edges.push({
        source: 'self',
        target: id,
        category,
        label: CATEGORY_LABEL[category],
        color: CATEGORY_COLOR[category],
      })
    }
  }

  // Aristas de familia persona↔persona (migration 0035). Se dibujan en color
  // 'familia' con el parentesco como label. Se omiten si algún extremo no
  // resuelve a un nodo (persona borrada) o si apuntan a sí mismas.
  for (const link of personLinks) {
    const source = nodeIdByPersonId.get(link.personAId)
    const target = nodeIdByPersonId.get(link.personBId)
    if (!source || !target || source === target) continue
    edges.push({
      source,
      target,
      category: 'familia',
      label: kindLabel(link.kind),
      color: CATEGORY_COLOR.familia,
    })
  }

  return {
    nodes: [selfNode, ...personNodes],
    edges,
  }
}
