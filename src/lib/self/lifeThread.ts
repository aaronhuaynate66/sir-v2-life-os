// SIR V2 — "Tu rumbo": el espinazo determinístico de la narrativa de identidad
// (Etapa 4→5, Capa 1). Ensambla los HITOS REALES de la trayectoria desde los
// objetivos: qué te propusiste, qué lograste, qué pausaste, qué dejaste ir.
//
// PURO + determinístico. No inventa: cada hito sale de un cambio real en un Goal
// (createdAt / status + updatedAt). Es la base sobre la que luego (Capa 2) una
// pasada de IA puede REFORMULAR el hilo en una reflexión — sin inventar.

import type { Goal, GoalCategory } from '@/types'
import type { BondShift } from '@/lib/people/bondEvolution'

export type LifeMilestoneKind = 'set' | 'done' | 'paused' | 'let_go' | 'bond_rise' | 'bond_drop'

export interface LifeMilestone {
  id: string
  date: string
  kind: LifeMilestoneKind
  title: string
  category?: GoalCategory
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


// ─── Hitos RELACIONALES (E5): quiebres del vínculo desde bondEvolution ──────
// El hilo de la vida no es solo objetivos: cuándo un vínculo creció o se enfrió
// es parte del rumbo (Principio #1, primero relaciones). PURO; no inventa: cada
// hito sale de un quiebre real del score (BondShift).


/** Convierte los quiebres del vínculo de UNA persona en hitos del hilo. */
export function relationshipMilestones(personName: string, shifts: BondShift[]): LifeMilestone[] {
  const name = (personName || 'alguien').trim()
  return (shifts ?? []).map((sh) => ({
    id: `bond_${name}_${sh.date}`,
    date: sh.date,
    kind: (sh.direction === 'up' ? 'bond_rise' : 'bond_drop') as LifeMilestoneKind,
    title: name,
    label:
      sh.direction === 'up'
        ? `Tu vínculo con ${name} creció (${sh.from}→${sh.to})`
        : `Tu vínculo con ${name} se enfrió (${sh.from}→${sh.to})`,
  }))
}

/** Une hitos de objetivos + relacionales, ordenados del más reciente al más
 *  antiguo (mismo orden que buildLifeThread). */
export function mergeLifeThread(...threads: LifeMilestone[][]): LifeMilestone[] {
  const all = threads.flat()
  return all.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}
