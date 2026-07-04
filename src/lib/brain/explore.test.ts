// SIR V2 — Tests del explorador de grafo (AF·F2).

import { describe, it, expect } from 'vitest'
import { groupGlowRows, reasonLabel, EDGE_REASON_LABEL } from './explore'
import type { GlowRow } from './surface'

function row(id: string, type: GlowRow['type'], activation: number, reason: GlowRow['reason'] = null): GlowRow {
  return { nodeKey: `${type}:${id}`, type, id, label: `L${id}`, activation, reason, edgeKey: null }
}

describe('reasonLabel', () => {
  it('traduce el kind directo', () => {
    expect(reasonLabel(row('1', 'person', 5, 'family'))).toBe(EDGE_REASON_LABEL.family)
    expect(reasonLabel(row('2', 'goal', 4, 'goal_step'))).toBe('paso de un objetivo')
  })
  it('sin arista directa → indirecto', () => {
    expect(reasonLabel(row('3', 'person', 2, null))).toBe('conectado indirectamente')
  })
})

describe('groupGlowRows', () => {
  it('agrupa por tipo preservando el orden de aparición', () => {
    const rows = [row('a', 'person', 9), row('b', 'goal', 7), row('c', 'person', 5), row('d', 'moment', 3)]
    const g = groupGlowRows(rows)
    expect(g.map((x) => x.type)).toEqual(['person', 'goal', 'moment'])
    expect(g[0].rows.map((r) => r.id)).toEqual(['a', 'c'])
    expect(g[0].label).toBe('Personas')
  })
  it('vacío → sin grupos', () => {
    expect(groupGlowRows([])).toHaveLength(0)
  })
  it('preserva el orden de activación dentro del grupo', () => {
    const g = groupGlowRows([row('hi', 'person', 9), row('lo', 'person', 2)])
    expect(g[0].rows.map((r) => r.id)).toEqual(['hi', 'lo'])
  })
})
