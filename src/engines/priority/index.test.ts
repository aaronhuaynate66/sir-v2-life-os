// SIR V2 — Tests de la jerarquía de prioridades de dominio.

import { describe, it, expect } from 'vitest'
import { PRIORITY_LEVEL, PRIORITY_ORDER } from './index'

describe('jerarquía', () => {
  it('el orden es Paz>Salud>Finanzas>Personal>Relacional>Optimización', () => {
    expect(PRIORITY_ORDER).toEqual(['peace', 'health', 'finance', 'personal', 'relational', 'optimization'])
    // niveles estrictamente crecientes en ese orden
    const levels = PRIORITY_ORDER.map((d) => PRIORITY_LEVEL[d])
    expect(levels).toEqual([...levels].sort((a, b) => a - b))
  })
})
