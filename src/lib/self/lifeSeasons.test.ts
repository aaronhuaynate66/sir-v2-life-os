import { describe, it, expect } from 'vitest'
import { buildLifeSeasons, seasonsSummaryLine } from './lifeSeasons'
import type { Goal } from '@/types'

const NOW = new Date('2026-07-10T12:00:00Z')

let seq = 0
function goal(over: Partial<Goal>): Goal {
  seq += 1
  return {
    id: `g${seq}`,
    title: 'Obj',
    description: '',
    category: 'personal',
    priority: 'high',
    status: 'active',
    progress: 0,
    milestones: [],
    relatedGoals: [],
    relatedPersons: [],
    peaceImpact: 5,
    obstacles: [],
    nextAction: '',
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
    ...over,
  } as Goal
}

describe('buildLifeSeasons — casos vacíos / honestos', () => {
  it('sin objetivos: no dibuja capítulos y lo dice sin inventar', () => {
    const s = buildLifeSeasons([], NOW)
    expect(s.seasons).toHaveLength(0)
    expect(s.current).toBeNull()
    expect(s.message).toMatch(/Todavía no hay capítulos/i)
  })

  it('ignora objetivos sin título', () => {
    const s = buildLifeSeasons([goal({ title: '   ' })], NOW)
    expect(s.seasons).toHaveLength(0)
  })

  it('objetivo activo creado/movido en el mismo instante = un solo evento', () => {
    const s = buildLifeSeasons(
      [goal({ status: 'completed', createdAt: '2026-06-01T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z' })],
      NOW,
    )
    expect(s.seasons).toHaveLength(1)
    expect(s.seasons[0].set + s.seasons[0].done).toBe(1)
  })
})

describe('buildLifeSeasons — segmentación por silencio', () => {
  it('eventos a 60 días de distancia quedan en la MISMA estación', () => {
    const s = buildLifeSeasons(
      [
        goal({ createdAt: '2026-03-01T00:00:00Z' }),
        goal({ createdAt: '2026-04-30T00:00:00Z' }), // +60 días exactos
      ],
      NOW,
    )
    expect(s.seasons).toHaveLength(1)
  })

  it('un silencio > 60 días abre un capítulo nuevo', () => {
    const s = buildLifeSeasons(
      [
        goal({ createdAt: '2026-03-01T00:00:00Z' }),
        goal({ createdAt: '2026-05-05T00:00:00Z' }), // +65 días
      ],
      NOW,
    )
    expect(s.seasons).toHaveLength(2)
  })
})

describe('buildLifeSeasons — tema y orden', () => {
  const goalsTwoSeasons: Goal[] = [
    goal({
      title: 'Aprender inglés',
      category: 'career',
      status: 'completed',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-02-01T00:00:00Z',
    }),
    goal({ title: 'Mudarme con mi perro', category: 'personal', isAnchor: true, createdAt: '2026-06-01T00:00:00Z' }),
    goal({ title: 'Ganar el Mundial', category: 'personal', createdAt: '2026-06-20T00:00:00Z' }),
  ]

  it('ordena de la más reciente a la más antigua y detecta la actual', () => {
    const s = buildLifeSeasons(goalsTwoSeasons, NOW)
    expect(s.seasons).toHaveLength(2)
    expect(s.seasons[0].isCurrent).toBe(true)
    expect(s.seasons[1].isCurrent).toBe(false)
    expect(s.current).toBe(s.seasons[0])
  })

  it('el tema nombra el ancla primero y une los títulos salientes', () => {
    const s = buildLifeSeasons(goalsTwoSeasons, NOW)
    const cur = s.seasons[0]
    expect(cur.goals[0].isAnchor).toBe(true)
    expect(cur.label).toBe('Mudarme con mi perro + Ganar el Mundial')
    expect(cur.categories[0].category).toBe('personal')
  })

  it('el mensaje contrasta el capítulo actual con el anterior', () => {
    const s = buildLifeSeasons(goalsTwoSeasons, NOW)
    expect(s.message).toMatch(/capítulo actual gira en torno a Mudarme con mi perro/i)
    expect(s.message).toMatch(/Antes:/)
  })

  it('recorta títulos largos en la etiqueta', () => {
    const long = 'A'.repeat(50)
    const s = buildLifeSeasons([goal({ title: long, createdAt: '2026-06-01T00:00:00Z' })], NOW)
    expect(s.seasons[0].label.length).toBeLessThanOrEqual(33)
    expect(s.seasons[0].label.endsWith('…')).toBe(true)
  })
})

describe('buildLifeSeasons — pausa entre capítulos', () => {
  it('si el último evento es viejo, no hay capítulo en curso', () => {
    const s = buildLifeSeasons(
      [
        goal({ title: 'Viejo A', createdAt: '2025-01-01T00:00:00Z' }),
        goal({ title: 'Viejo B', status: 'completed', createdAt: '2025-06-01T00:00:00Z', updatedAt: '2025-07-01T00:00:00Z' }),
      ],
      NOW,
    )
    expect(s.current).toBeNull()
    expect(s.seasons.every((se) => !se.isCurrent)).toBe(true)
    expect(s.message).toMatch(/pausa entre capítulos/i)
  })
})

describe('seasonsSummaryLine', () => {
  it('null cuando no hay estaciones', () => {
    expect(seasonsSummaryLine(buildLifeSeasons([], NOW))).toBeNull()
  })

  it('resume etiquetas y fechas reales para la reflexión IA, marcando la actual', () => {
    const line = seasonsSummaryLine(
      buildLifeSeasons(
        [
          goal({ title: 'Mudanza', isAnchor: true, createdAt: '2026-06-01T00:00:00Z' }),
          goal({ title: 'Inglés', category: 'career', status: 'completed', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-02-01T00:00:00Z' }),
        ],
        NOW,
      ),
    )
    expect(line).toContain('Mudanza')
    expect(line).toContain('(actual)')
    expect(line).toContain('Inglés')
  })
})
