// SIR V2 — Tests de fechas por rol/rubro.
//
// buildRoleDates recibe `now` explícito → determinístico y TZ-independiente.

import { describe, it, expect } from 'vitest'

import type { Goal } from '@/types'
import { detectRubros, buildRoleDates } from './roleDates'

function goal(over: Partial<Goal>): Goal {
  return {
    id: over.id ?? 'g1',
    title: over.title ?? 'Objetivo',
    description: '',
    category: over.category ?? 'financial',
    priority: over.priority ?? 'high',
    status: over.status ?? 'active',
    targetDate: over.targetDate,
    progress: 0,
    milestones: [],
    relatedGoals: [],
    relatedPersons: [],
    peaceImpact: 0,
    obstacles: [],
    nextAction: '',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  }
}

describe('detectRubros', () => {
  it('detecta comercial desde texto libre tolerante', () => {
    expect(detectRubros(['Fundador de Marlab']).has('commercial')).toBe(true)
    expect(detectRubros(['Atleta de taekwondo']).has('athlete')).toBe(true)
    expect(detectRubros(['Bombero']).has('firefighter')).toBe(true)
  })

  it('un rol puede no matchear ningún rubro', () => {
    expect(detectRubros(['Padre de familia']).size).toBe(0)
  })

  it('roles vacíos/nulos → set vacío', () => {
    expect(detectRubros(undefined).size).toBe(0)
    expect(detectRubros([]).size).toBe(0)
  })
})

describe('buildRoleDates — intereses alimentan la detección de rubro', () => {
  it('un interés "taekwondo" activa el rubro atleta sin estar en los roles', () => {
    // ~jun-2026: WFG26 dentro del horizonte. Sin roles atléticos, pero con el
    // interés capturado del Instagram propio.
    const hits = buildRoleDates(
      { roles: ['Padre de familia'], interests: ['Taekwondo'] },
      new Date(2026, 5, 3),
    )
    expect(hits.find((h) => h.id === 'wfg26')).toBeDefined()
  })

  it('sin roles ni intereses que matcheen → sin fechas por rubro', () => {
    const hits = buildRoleDates(
      { roles: ['Padre de familia'], interests: ['Cocina'] },
      new Date(2026, 5, 3),
    )
    expect(hits).toHaveLength(0)
  })
})

describe('buildRoleDates — comercial', () => {
  it('surfacéa fechas comerciales dentro de su lead time', () => {
    // 20-abr-2026: Día de la Madre (10-may) está a 20 días, dentro del lead (35).
    const hits = buildRoleDates({ roles: ['Comercial en Marlab'] }, new Date(2026, 3, 20))
    const madre = hits.find((h) => h.id === 'role_dia_madre')
    expect(madre).toBeDefined()
    expect(madre!.rubro).toBe('commercial')
    expect(madre!.daysUntil).toBe(20)
  })

  it('engancha un objetivo comercial activo en la sugerencia', () => {
    const hits = buildRoleDates(
      {
        roles: ['Fundador de Marlab'],
        goals: [goal({ title: 'Boticas Jhodaal', category: 'financial', priority: 'critical' })],
      },
      new Date(2026, 3, 20),
    )
    const madre = hits.find((h) => h.id === 'role_dia_madre')!
    expect(madre.hint).toContain('Boticas Jhodaal')
  })

  it('sin objetivo comercial → sugerencia genérica sin "Campaña para"', () => {
    const hits = buildRoleDates({ roles: ['Comercial'] }, new Date(2026, 3, 20))
    const madre = hits.find((h) => h.id === 'role_dia_madre')!
    expect(madre.hint).not.toContain('Campaña para')
  })

  it('fecha comercial fuera del lead time → excluida', () => {
    // 1-ene-2026: Día de la Madre está a >35 días → no entra todavía.
    const hits = buildRoleDates({ roles: ['Comercial'] }, new Date(2026, 0, 1))
    expect(hits.find((h) => h.id === 'role_dia_madre')).toBeUndefined()
  })

  it('roles no comerciales → sin fechas comerciales', () => {
    const hits = buildRoleDates({ roles: ['Bombero'] }, new Date(2026, 4, 1))
    expect(hits.filter((h) => h.rubro === 'commercial')).toHaveLength(0)
  })
})

describe('buildRoleDates — Mundial WFG26', () => {
  it('atleta ve el countdown al mundial dentro del horizonte', () => {
    // ~jun-2026: faltan ~150 días al 5-nov, dentro del lead (240).
    const hits = buildRoleDates({ roles: ['Atleta'] }, new Date(2026, 5, 3))
    const wfg = hits.find((h) => h.id === 'wfg26')
    expect(wfg).toBeDefined()
    expect(wfg!.daysUntil).toBeGreaterThan(0)
    expect(wfg!.hint).toContain('5–13 nov 2026')
  })

  it('bombero también ve el WFG26 (Juegos Mundiales de Bomberos)', () => {
    const hits = buildRoleDates({ roles: ['Bombero'] }, new Date(2026, 8, 1))
    expect(hits.find((h) => h.id === 'wfg26')).toBeDefined()
  })

  it('lejos del evento (fuera del lead) → no aparece', () => {
    const hits = buildRoleDates({ roles: ['Atleta'] }, new Date(2026, 0, 1))
    expect(hits.find((h) => h.id === 'wfg26')).toBeUndefined()
  })

  it('rol sin rubro de atleta/bombero → sin WFG26', () => {
    const hits = buildRoleDates({ roles: ['Comercial'] }, new Date(2026, 8, 1))
    expect(hits.find((h) => h.id === 'wfg26')).toBeUndefined()
  })

  it('ordena por cercanía ascendente', () => {
    const hits = buildRoleDates({ roles: ['Comercial', 'Atleta'] }, new Date(2026, 9, 20))
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i].daysUntil).toBeGreaterThanOrEqual(hits[i - 1].daysUntil)
    }
  })
})
