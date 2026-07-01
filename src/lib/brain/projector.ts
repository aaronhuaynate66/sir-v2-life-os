// SIR V2 — Cerebro F1 · projector puro.
//
// Convierte un snapshot de las tablas existentes en un grafo tipado. Recibe
// los datos ya cargados (arrays con SOLO los campos que necesita) y devuelve
// nodos + aristas con peso base derivado. NO hace queries — la carga de datos
// vive en el debug page o en el endpoint que corresponda.
//
// La motivacion de que sea puro: F2 (difusion) y los tests pueden simular el
// grafo sin infra. Ademas F3 (Hebbian) va a componer sobre esta funcion.

import {
  BASE_WEIGHT,
  edgeKey,
  nodeKey,
  type EdgeKind,
  type Graph,
  type NodeType,
  type TypedEdge,
  type TypedNode,
} from './types'

// ── Shape minimo de cada fila de entrada ──────────────────────────────
export interface PersonRow {
  id: string
  name?: string | null
  full_name?: string | null
}
export interface GoalRow {
  id: string
  title?: string | null
  name?: string | null
}
export interface OrgRow {
  slug: string
  name?: string | null
}
export interface StepRow {
  id: string
  objective_id: string
  title?: string | null
}
export interface MomentRow {
  id: string
  person_id: string
  title?: string | null
}
export interface DealRow {
  id: string
  title?: string | null
  contact_person_id?: string | null
  client_org_slug?: string | null
  related_persons?: string[] | null
}
export interface PersonLinkRow {
  person_a_id: string
  person_b_id: string
  kind?: string | null
}
export interface MomentParticipantRow {
  moment_id: string
  person_id: string
}
export interface MomentReferenceRow {
  moment_id: string
  person_id: string
}
export interface MemoryRow {
  id: string
  person_id?: string | null
}
export interface ObservationRow {
  id: string
  person_id?: string | null
}
export interface TrackerRow {
  id: string
  objective_id?: string | null
  objective_step_id?: string | null
  title?: string | null
  name?: string | null
}
export interface PersonMoneyRow {
  id: string
  person_id: string
}
export interface GoalCostRow {
  id: string
  goal_id: string
  label?: string | null
}

export interface ProjectorInput {
  people?: PersonRow[]
  goals?: GoalRow[]
  orgs?: OrgRow[]
  steps?: StepRow[]
  moments?: MomentRow[]
  deals?: DealRow[]
  personLinks?: PersonLinkRow[]
  momentParticipants?: MomentParticipantRow[]
  momentReferences?: MomentReferenceRow[]
  memories?: MemoryRow[]
  observations?: ObservationRow[]
  trackers?: TrackerRow[]
  personMoney?: PersonMoneyRow[]
  goalCosts?: GoalCostRow[]
  /** Mapa de deltas aprendidos (edge_key → weight). Puede venir vacio. */
  learnedWeights?: Map<string, number>
}

// ── Helpers ───────────────────────────────────────────────────────────
function labelForPerson(p: PersonRow): string {
  return (p.name ?? p.full_name ?? p.id).trim() || p.id
}
function labelForGoal(g: GoalRow): string {
  return (g.title ?? g.name ?? g.id).trim() || g.id
}
function labelForOrg(o: OrgRow): string {
  return (o.name ?? o.slug).trim() || o.slug
}

function pushEdge(
  edges: TypedEdge[],
  learned: Map<string, number> | undefined,
  srcType: NodeType,
  srcId: string,
  dstType: NodeType,
  dstId: string,
  kind: EdgeKind,
): void {
  const key = edgeKey(srcType, srcId, dstType, dstId, kind)
  const derivedWeight = BASE_WEIGHT[kind]
  const learnedWeight = learned?.get(key) ?? 0
  const weight = Math.max(0, derivedWeight + learnedWeight)
  edges.push({ key, srcType, srcId, dstType, dstId, kind, derivedWeight, learnedWeight, weight })
}

function ensureNode(
  seen: Set<string>,
  nodes: TypedNode[],
  type: NodeType,
  id: string,
  label: string,
): void {
  const k = nodeKey(type, id)
  if (seen.has(k)) return
  seen.add(k)
  nodes.push({ type, id, label })
}

// ── Projector ─────────────────────────────────────────────────────────
export function projectGraph(input: ProjectorInput): Graph {
  const nodes: TypedNode[] = []
  const edges: TypedEdge[] = []
  const seen = new Set<string>()
  const learned = input.learnedWeights

  const personLabelById = new Map<string, string>()
  const goalLabelById = new Map<string, string>()
  const orgLabelBySlug = new Map<string, string>()

  for (const p of input.people ?? []) {
    const label = labelForPerson(p)
    personLabelById.set(p.id, label)
    ensureNode(seen, nodes, 'person', p.id, label)
  }
  for (const g of input.goals ?? []) {
    const label = labelForGoal(g)
    goalLabelById.set(g.id, label)
    ensureNode(seen, nodes, 'goal', g.id, label)
  }
  for (const o of input.orgs ?? []) {
    const label = labelForOrg(o)
    orgLabelBySlug.set(o.slug, label)
    ensureNode(seen, nodes, 'org', o.slug, label)
  }

  // Steps: nodo + arista al goal.
  for (const s of input.steps ?? []) {
    ensureNode(seen, nodes, 'step', s.id, (s.title ?? s.id).trim() || s.id)
    // Solo emite arista si el goal existe (evita nodos fantasma).
    if (goalLabelById.has(s.objective_id)) {
      pushEdge(edges, learned, 'goal', s.objective_id, 'step', s.id, 'goal_step')
    }
  }

  // Moments: nodo + arista a la persona primaria.
  for (const m of input.moments ?? []) {
    ensureNode(seen, nodes, 'moment', m.id, (m.title ?? m.id).trim() || m.id)
    if (personLabelById.has(m.person_id)) {
      pushEdge(edges, learned, 'moment', m.id, 'person', m.person_id, 'moment_participant')
    }
  }

  // Moment participants extra (los que no son la primaria).
  for (const mp of input.momentParticipants ?? []) {
    if (personLabelById.has(mp.person_id)) {
      pushEdge(edges, learned, 'moment', mp.moment_id, 'person', mp.person_id, 'moment_participant')
    }
  }

  // Moment references.
  for (const mr of input.momentReferences ?? []) {
    if (personLabelById.has(mr.person_id)) {
      pushEdge(edges, learned, 'moment', mr.moment_id, 'person', mr.person_id, 'moment_reference')
    }
  }

  // Deals: nodo + aristas a contact, org, related.
  for (const d of input.deals ?? []) {
    ensureNode(seen, nodes, 'deal', d.id, (d.title ?? d.id).trim() || d.id)
    if (d.contact_person_id && personLabelById.has(d.contact_person_id)) {
      pushEdge(edges, learned, 'deal', d.id, 'person', d.contact_person_id, 'deal_contact')
    }
    if (d.client_org_slug && orgLabelBySlug.has(d.client_org_slug)) {
      pushEdge(edges, learned, 'deal', d.id, 'org', d.client_org_slug, 'deal_client_org')
    }
    for (const rid of d.related_persons ?? []) {
      if (personLabelById.has(rid) && rid !== d.contact_person_id) {
        pushEdge(edges, learned, 'deal', d.id, 'person', rid, 'deal_related')
      }
    }
  }

  // Person links (familia).
  for (const l of input.personLinks ?? []) {
    if (personLabelById.has(l.person_a_id) && personLabelById.has(l.person_b_id)) {
      pushEdge(edges, learned, 'person', l.person_a_id, 'person', l.person_b_id, 'family')
    }
  }

  // Memorias.
  for (const m of input.memories ?? []) {
    if (m.person_id && personLabelById.has(m.person_id)) {
      pushEdge(edges, learned, 'person', m.person_id, 'person', m.person_id, 'memory_person')
      // Nota: memoria como nodo separado seria overkill para F1; se cuenta como
      // arista self-loop sobre la persona (senal de "hay memoria"). F2 la lee
      // como acumulacion de peso sin crear nodo.
    }
  }

  // Observations.
  for (const o of input.observations ?? []) {
    if (o.person_id && personLabelById.has(o.person_id)) {
      pushEdge(edges, learned, 'person', o.person_id, 'person', o.person_id, 'observation_person')
    }
  }

  // Trackers.
  for (const t of input.trackers ?? []) {
    ensureNode(seen, nodes, 'tracker', t.id, (t.title ?? t.name ?? t.id).trim() || t.id)
    if (t.objective_id && goalLabelById.has(t.objective_id)) {
      pushEdge(edges, learned, 'tracker', t.id, 'goal', t.objective_id, 'tracker_goal')
    }
    if (t.objective_step_id) {
      pushEdge(edges, learned, 'tracker', t.id, 'step', t.objective_step_id, 'tracker_step')
    }
  }

  // Person money.
  for (const pm of input.personMoney ?? []) {
    if (personLabelById.has(pm.person_id)) {
      pushEdge(edges, learned, 'person', pm.person_id, 'person', pm.person_id, 'money_person')
    }
  }

  // Goal costs.
  for (const gc of input.goalCosts ?? []) {
    if (goalLabelById.has(gc.goal_id)) {
      pushEdge(edges, learned, 'goal', gc.goal_id, 'goal', gc.goal_id, 'goal_cost')
    }
  }

  return { nodes, edges }
}
