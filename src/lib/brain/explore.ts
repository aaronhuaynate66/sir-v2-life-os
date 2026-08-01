// SIR V2 — Explorador de grafo (AF·F2, cluster auto-forense).
//
// Capa pura de presentación sobre el cerebro-grafo (F1-F4): traduce las filas de
// `describeGlow` (difusión desde una semilla) a algo legible — etiqueta humana
// del "por qué se conecta" y agrupación por tipo de nodo. "Muéstrame cómo se
// conecta todo esto" apuntado a TU propia vida (Pathfinder sano). El motor
// (diffuse/topActivated/describeGlow) ya existe y está testeado; esto es la
// traducción para la UI.

import type { EdgeKind, NodeType } from './types'
import type { GlowRow } from './surface'

/** "Por qué" legible de cada tipo de arista (la razón directa de la conexión). */
export const EDGE_REASON_LABEL: Record<EdgeKind, string> = {
  family: 'vínculo familiar / personal',
  moment_participant: 'participó en un episodio',
  moment_reference: 'mencionada en un episodio',
  goal_step: 'paso de un objetivo',
  goal_related_goal: 'objetivo relacionado',
  goal_related_person: 'atada a un objetivo',
  deal_contact: 'contacto de una oportunidad',
  deal_client_org: 'empresa de una oportunidad',
  deal_related: 'parte de una oportunidad',
  memory_person: 'aparece en tus memorias',
  observation_person: 'aparece en una captura',
  tracker_goal: 'seguimiento de un objetivo',
  tracker_step: 'seguimiento de un paso',
  money_person: 'registro de plata',
  goal_cost: 'costo de un objetivo',
  follows_org: 'sigue su página (interés en común)',
}

export const NODE_TYPE_LABEL: Record<NodeType, string> = {
  person: 'Personas',
  goal: 'Objetivos',
  org: 'Empresas',
  moment: 'Episodios',
  deal: 'Oportunidades',
  step: 'Tareas',
  tracker: 'Seguimientos',
}

/** Texto del "por qué" de una fila. Indirecto (hop ≥ 2) si no hay arista directa. */
export function reasonLabel(row: GlowRow): string {
  return row.reason ? EDGE_REASON_LABEL[row.reason] : 'conectado indirectamente'
}

export interface GlowGroup {
  type: NodeType
  label: string
  rows: GlowRow[]
}

/**
 * Agrupa las filas por tipo de nodo, preservando el orden de activación (las
 * filas ya vienen ordenadas desc). El orden de los grupos = primera aparición.
 */
export function groupGlowRows(rows: GlowRow[]): GlowGroup[] {
  const order: NodeType[] = []
  const byType = new Map<NodeType, GlowRow[]>()
  for (const r of rows) {
    if (!byType.has(r.type)) { byType.set(r.type, []); order.push(r.type) }
    byType.get(r.type)!.push(r)
  }
  return order.map((type) => ({ type, label: NODE_TYPE_LABEL[type], rows: byType.get(type)! }))
}
