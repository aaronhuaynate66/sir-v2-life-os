// SIR V2 — Tests del norte del año como fuente única (deriveNorte, parte pura).
//
// deriveNorte espeja el ancla de buildYearCompass en la forma {id,title,subtitle,
// nextAction}. Cubrimos: ancla derivada por fallback (el caso REAL — nadie prende
// is_anchor), ancla explícita, subtítulo derivado, próximo paso, y sin ancla.

import { describe, it, expect } from 'vitest'

import type { Goal } from '@/types'
import { deriveNorte } from './norte'

const NOW = new Date(2026, 6, 8) // 8-jul-2026.

function goal(over: Partial<Goal>): Goal {
  return {
    id: over.id ?? 'g1',
    title: over.title ?? 'Objetivo',
    description: over.description ?? '',
    category: over.category ?? 'personal',
    priority: over.priority ?? 'medium',
    status: over.status ?? 'active',
    progress: over.progress ?? 0,
    milestones: [],
    relatedGoals: [],
    relatedPersons: [],
    peaceImpact: over.peaceImpact ?? 5,
    obstacles: [],
    nextAction: over.nextAction ?? '',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: over.updatedAt ?? '2026-01-01T00:00:00Z',
    ...over,
  }
}

describe('deriveNorte', () => {
  it('deriva el ancla por fallback aunque NINGÚN goal tenga is_anchor (el caso real)', () => {
    const norte = deriveNorte(
      [
        goal({ id: 'rel', category: 'relational', priority: 'high', targetDate: '2026-09-01' }),
        goal({ id: 'mundial', title: 'Ganar el Mundial de Bomberos', priority: 'high', targetDate: '2026-11-07', target: 'Medalla de oro +80 kg', nextAction: 'Plan de entrenamiento' }),
      ],
      NOW,
    )
    // self-first: gana el no-relacional aunque el relacional tenga fecha más cercana.
    expect(norte?.id).toBe('mundial')
    expect(norte?.title).toBe('Ganar el Mundial de Bomberos')
    expect(norte?.subtitle).toBe('Medalla de oro +80 kg')
    expect(norte?.nextAction).toBe('Plan de entrenamiento')
  })
  it('respeta el ancla explícita (is_anchor) por encima del fallback', () => {
    const norte = deriveNorte(
      [
        goal({ id: 'auto', title: 'Auto', priority: 'critical', targetDate: '2026-12-01' }),
        goal({ id: 'fijado', title: 'Fijado a mano', priority: 'low', targetDate: '2026-08-01', isAnchor: true }),
      ],
      NOW,
    )
    expect(norte?.id).toBe('fijado')
  })
  it('sin objetivos elegibles → null', () => {
    expect(deriveNorte([], NOW)).toBeNull()
    expect(deriveNorte([goal({ id: 'x', targetDate: undefined })], NOW)).toBeNull()
  })
  it('sin próximo paso ni subtítulo → campos undefined, no strings vacíos', () => {
    const norte = deriveNorte([goal({ id: 'g', title: 'Pelado', targetDate: '2026-10-01' })], NOW)
    expect(norte?.id).toBe('g')
    expect(norte?.subtitle).toBeUndefined()
    expect(norte?.nextAction).toBeUndefined()
  })
})
