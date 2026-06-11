// SIR V2 — "Tu rumbo": el espinazo determinístico de la narrativa de identidad
// (Etapa 4→5, Capa 1). Ensambla los HITOS REALES de la trayectoria desde los
// objetivos: qué te propusiste, qué lograste, qué pausaste, qué dejaste ir.
//
// PURO + determinístico. No inventa: cada hito sale de un cambio real en un Goal
// (createdAt / status + updatedAt). Es la base sobre la que luego (Capa 2) una
// pasada de IA puede REFORMULAR el hilo en una reflexión — sin inventar.

import type { Goal, GoalCategory } from '@/types'

export type LifeMilestoneKind = 'set' | 'done' | 'paused' | 'let_go'

export interface LifeMilestone {
  id: string
  date: string
  kind: LifeMilestoneKind
  title: string
  category: GoalCategory
  label: string
}

const VERB: Record<LifeMilestoneKind, (t: string) => string> = {
  set: (t) => `Te propusiste “${t}”`,
  done: (t) => `Lograste “${t}”`,
  paused: (t) => `Pausaste “${t}”`,
  let_go: (t) => `Dejaste ir “${t}”`,
}

function valid(iso: string | undefined): iso is string {
  return typeof iso === 'string' && !Number.isNaN(Date.parse(iso))
}

export function buildLifeThread(goals: Goal[], _now: Date = new Date()): LifeMilestone[] {
  const out: LifeMilestone[] = []
  for (const g of goals ?? []) {
    if (!g) continue
    const title = (g.title ?? '').trim()
    if (!title) continue
    if (valid(g.createdAt)) {
      out.push({ id: `${g.id}_set`, date: g.createdAt, kind: 'set', title, category: g.category, label: VERB.set(title) })
    }
    const changeKind: LifeMilestoneKind | null =
      g.status === 'completed' ? 'done' : g.status === 'paused' ? 'paused' : g.status === 'abandoned' ? 'let_go' : null
    if (changeKind && valid(g.updatedAt)) {
      out.push({ id: `${g.id}_${changeKind}`, date: g.updatedAt, kind: changeKind, title, category: g.category, label: VERB[changeKind](title) })
    }
  }
  out.sort((a, b) => b.date.localeCompare(a.date))
  return out
}
