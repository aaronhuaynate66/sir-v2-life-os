// SIR V2 — Tests de buildSeedPlan.

import { describe, it, expect } from 'vitest'
import { buildSeedPlan, generateSlug, parseWeight, type SeedBatchInput } from './plan'

const USER = 'u_test'
const NOW = new Date('2026-07-01T15:00:00Z')
let counter = 0
const rand = () => {
  counter += 1
  return counter / 1_000_000
}

function noopSlugTaken() { return false }
function noopOrgExists() { return false }

describe('generateSlug', () => {
  it('normaliza acentos + espacios', () => {
    expect(generateSlug('Fabiola Masías Ponce')).toBe('fabiola-masias-ponce')
    expect(generateSlug('María Isabel')).toBe('maria-isabel')
  })
  it('null-safe', () => {
    expect(generateSlug('')).toBe('persona')
  })
})

describe('parseWeight', () => {
  it('mapea alto/medio/bajo', () => {
    expect(parseWeight('alto')).toBe(8)
    expect(parseWeight('media')).toBe(5)
    expect(parseWeight('bajo')).toBe(3)
  })
  it('acepta números', () => {
    expect(parseWeight(7)).toBe(7)
    expect(parseWeight('9')).toBe(9)
    expect(parseWeight(15)).toBe(10) // clamp
  })
  it('null para vacío', () => {
    expect(parseWeight(undefined)).toBeNull()
    expect(parseWeight('')).toBeNull()
    expect(parseWeight('xyz')).toBeNull()
  })
})

describe('buildSeedPlan — happy path', () => {
  const input: SeedBatchInput = {
    people: [
      {
        person: { name: 'Fabiola Masías Ponce', alias: 'Fabiola', category: 'network', importance_score: 6 },
        tags: ['RRHH'],
        org_link: { name: 'GRUPO HNG', area: 'TAC' },
        observations: [{ capture_type: 'linkedin', confidence: 'high', observed_at: '2026-07-01', data: { headline: 'HRBP' } }],
      },
      {
        person: { name: 'Cristina', category: 'close', importance_score: 7 },
        org_link: { name: 'GRUPO HNG', area: 'TAC' },
        observations: [{ capture_type: 'manual_note', confidence: 'medium', data: { rol: 'Gerente' } }],
      },
    ],
    person_links: [
      { person_a: 'Cristina', person_b: 'Fabiola Masías Ponce', kind: 'gerente_de_area_de', _peso: 'alto', _context: 'gerente del área TAC' },
      { person_a: 'SELF', person_b: 'Cristina', kind: 'contacto_en_comun', _peso: 'alto' },
      { person_a: 'SELF', person_b: 'Fabiola Masías Ponce', kind: 'colega_hng', _peso: 'medio' },
    ],
  }

  const plan = buildSeedPlan({ input, userId: USER, slugTaken: noopSlugTaken, orgExists: noopOrgExists, now: NOW, rand })

  it('genera 2 personas con slugs únicos', () => {
    expect(plan.people).toHaveLength(2)
    expect(plan.people[0].slug).toBe('fabiola')
    expect(plan.people[1].slug).toBe('cristina')
  })

  it('genera 2 observations con person_id ligado', () => {
    expect(plan.observations).toHaveLength(2)
    expect(plan.observations[0].person_id).toBe(plan.people[0].id)
    expect(plan.observations[1].person_id).toBe(plan.people[1].id)
  })

  it('genera 1 org_profile (grupo-hng) marcado como nuevo', () => {
    expect(plan.orgs).toHaveLength(1)
    expect(plan.orgs[0].org_slug).toBe('grupo-hng')
    expect(plan.orgs[0].existing).toBe(false)
  })

  it('procesa los 3 person_links explícitos', () => {
    const explicit = plan.links.filter((l) => !l.inferred)
    expect(explicit).toHaveLength(3)
    // Cristina → Fabiola gerente_de_area_de, weight=8 (alto)
    const gerLink = explicit.find((l) => l.kind === 'gerente_de_area_de')
    expect(gerLink?.weight).toBe(8)
    expect(gerLink?.context).toBe('gerente del área TAC')
    // SELF links
    const selfLinks = explicit.filter((l) => l.person_a_id === 'self')
    expect(selfLinks).toHaveLength(2)
    expect(selfLinks[0].weight).toBe(8) // 'alto'
    expect(selfLinks[1].weight).toBe(5) // 'medio'
  })

  it('agrega link inferido colega_area entre Fabiola y Cristina cuando NO está explícito', () => {
    // gerente_de_area_de es explícito. colega_area es inferido y NO se agrega
    // si ya hay una arista entre esos ids con OTRO kind (regla: solo se salta
    // si es el mismo kind).
    const inferredLinks = plan.links.filter((l) => l.inferred)
    // 2 personas en la misma org+área → 1 link inferido (colega_area).
    expect(inferredLinks).toHaveLength(1)
    expect(inferredLinks[0].kind).toBe('colega_area')
    expect(inferredLinks[0].weight).toBe(7)
    expect(inferredLinks[0].context).toContain('TAC')
  })
})

describe('buildSeedPlan — org existente se reusa', () => {
  const input: SeedBatchInput = {
    people: [{ person: { name: 'Fabiola' }, org_link: { name: 'GRUPO HNG' } }],
  }
  it('marca la org como existing y suma un warning', () => {
    const plan = buildSeedPlan({
      input, userId: USER,
      slugTaken: noopSlugTaken,
      orgExists: (slug) => slug === 'grupo-hng',
      now: NOW, rand,
    })
    expect(plan.orgs[0].existing).toBe(true)
    expect(plan.warnings.some((w) => w.includes('ya existe'))).toBe(true)
  })
})

describe('buildSeedPlan — slug ya tomado', () => {
  const input: SeedBatchInput = {
    people: [{ person: { name: 'Fabiola' } }],
  }
  it('genera un slug con sufijo cuando el base ya existe', () => {
    const plan = buildSeedPlan({
      input, userId: USER,
      slugTaken: (slug) => slug === 'fabiola',
      orgExists: noopOrgExists,
      now: NOW, rand,
    })
    expect(plan.people[0].slug).toBe('fabiola-2')
  })
})

describe('buildSeedPlan — warnings', () => {
  it('warning cuando person_link referencia nombre desconocido', () => {
    const input: SeedBatchInput = {
      people: [{ person: { name: 'Fabiola' } }],
      person_links: [{ person_a: 'Cristina', person_b: 'Fabiola', kind: 'x' }],
    }
    const plan = buildSeedPlan({ input, userId: USER, slugTaken: noopSlugTaken, orgExists: noopOrgExists, now: NOW, rand })
    expect(plan.links).toHaveLength(0)
    expect(plan.warnings.some((w) => w.includes('Cristina'))).toBe(true)
  })

  it('warning + skip cuando person_b es SELF (no soportado por schema)', () => {
    const input: SeedBatchInput = {
      people: [{ person: { name: 'Fabiola' } }],
      person_links: [{ person_a: 'Fabiola', person_b: 'SELF', kind: 'x' }],
    }
    const plan = buildSeedPlan({ input, userId: USER, slugTaken: noopSlugTaken, orgExists: noopOrgExists, now: NOW, rand })
    expect(plan.links).toHaveLength(0)
    expect(plan.warnings.some((w) => w.includes('person_b='))).toBe(true)
  })
})
