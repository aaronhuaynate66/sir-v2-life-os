// SIR V2 — Tests del validate/sanitize de LinkedIn.
//
// Cubre la gema V1 portada: historial laboral/educativo COMPLETO + la
// construcción de la URL de perfil desde el vanity visible. La sanitización
// debe ser tolerante con rows viejos (sin arrays) y bidireccional entre
// latest* <-> history.

import { describe, it, expect } from 'vitest'

import { isValidLinkedInProfileExtracted, sanitizeLinkedInProfile } from './validate'
import type { LinkedInProfileExtracted } from './types'

function base(over: Partial<LinkedInProfileExtracted> = {}): LinkedInProfileExtracted {
  return {
    fullName: 'María López',
    headline: 'Ingeniera de Datos en Globant',
    location: 'Lima, Perú',
    currentRole: 'Ingeniera de Datos',
    currentCompany: 'Globant',
    about: null,
    latestExperience: null,
    latestEducation: null,
    workHistory: [],
    educationHistory: [],
    profileUrl: null,
    connectionsCount: 500,
    isOpenToWork: false,
    hasProfilePhoto: true,
    hasBannerImage: false,
    imageLegible: true,
    confidence: 'high',
    rawObservations: null,
    ...over,
  }
}

describe('isValidLinkedInProfileExtracted', () => {
  it('acepta un objeto válido con historiales', () => {
    expect(
      isValidLinkedInProfileExtracted(
        base({
          workHistory: [{ name: 'Globant', title: 'Ing. de Datos', dateRange: '2022 - actualidad' }],
          educationHistory: [{ name: 'PUCP', title: 'Ing. Informática', dateRange: '2014 - 2019' }],
          profileUrl: 'https://linkedin.com/in/maria-lopez',
        }),
      ),
    ).toBe(true)
  })

  it('tolera arrays/profileUrl ausentes (rows viejos / modelo que omitió)', () => {
    const o = base() as unknown as Record<string, unknown>
    delete o.workHistory
    delete o.educationHistory
    delete o.profileUrl
    expect(isValidLinkedInProfileExtracted(o)).toBe(true)
  })

  it('tolera workHistory con entradas sin name (las descarta en sanitize, no rechaza el perfil)', () => {
    // El path de texto produce entradas sin empresa clara (ej. rol suelto).
    // Antes esto rechazaba TODO el perfil; ahora la entrada inválida se descarta
    // en sanitize y el perfil sigue válido.
    const o = base({ workHistory: [{ title: 'x' } as unknown as never] }) as unknown as Record<string, unknown>
    expect(isValidLinkedInProfileExtracted(o)).toBe(true)
    expect(sanitizeLinkedInProfile(o as never).workHistory).toHaveLength(0)
  })

  it('tolera profileUrl con tipo inválido (sanitize → null, no rechaza)', () => {
    const o = base() as unknown as Record<string, unknown>
    o.profileUrl = 42
    expect(isValidLinkedInProfileExtracted(o)).toBe(true)
    expect(sanitizeLinkedInProfile(o as never).profileUrl).toBeNull()
  })
})

describe('sanitizeLinkedInProfile — historial completo', () => {
  it('conserva todas las entradas, ordenadas, deduplicando', () => {
    const out = sanitizeLinkedInProfile(
      base({
        workHistory: [
          { name: 'Globant', title: 'Ing. de Datos', dateRange: '2022 - hoy' },
          { name: 'Globant', title: 'Ing. de Datos', dateRange: '2022 - hoy' }, // dup
          { name: 'BBVA', title: 'Analista', dateRange: '2019 - 2022' },
          { name: '   ', title: 'ruido', dateRange: null }, // sin name → drop
        ],
      }),
    )
    expect(out.workHistory.map((w) => w.name)).toEqual(['Globant', 'BBVA'])
    // latestExperience se deriva del primer ítem del historial.
    expect(out.latestExperience).toEqual({ name: 'Globant', title: 'Ing. de Datos', dateRange: '2022 - hoy' })
  })

  it('clampa a un máximo de 12 entradas', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ name: `Empresa ${i}`, title: null, dateRange: null }))
    const out = sanitizeLinkedInProfile(base({ workHistory: many }))
    expect(out.workHistory).toHaveLength(12)
  })

  it('backward-compat: latestExperience sin array → siembra workHistory de 1', () => {
    const out = sanitizeLinkedInProfile(
      base({
        latestExperience: { name: 'Acme', title: 'Dev', dateRange: '2020 - 2024' },
        workHistory: [],
      }),
    )
    expect(out.workHistory).toEqual([{ name: 'Acme', title: 'Dev', dateRange: '2020 - 2024' }])
  })
})

describe('sanitizeLinkedInProfile — profileUrl (construcción/normalización)', () => {
  it('normaliza una URL completa al canónico https://linkedin.com/in/<slug>', () => {
    expect(sanitizeLinkedInProfile(base({ profileUrl: 'www.linkedin.com/in/maria-lopez/' })).profileUrl).toBe(
      'https://linkedin.com/in/maria-lopez',
    )
  })

  it('acepta el formato suelto "in/<slug>"', () => {
    expect(sanitizeLinkedInProfile(base({ profileUrl: 'in/juan.perez' })).profileUrl).toBe(
      'https://linkedin.com/in/juan.perez',
    )
  })

  it('descarta cualquier cosa que no sea un perfil LinkedIn (no inventa)', () => {
    expect(sanitizeLinkedInProfile(base({ profileUrl: 'María López' })).profileUrl).toBeNull()
    expect(sanitizeLinkedInProfile(base({ profileUrl: 'https://example.com/x' })).profileUrl).toBeNull()
    expect(sanitizeLinkedInProfile(base({ profileUrl: null })).profileUrl).toBeNull()
  })
})

describe('path de TEXTO pegado (sin campos de imagen)', () => {
  // El extractor por texto no devuelve connectionsCount/isOpenToWork/
  // hasProfilePhoto/hasBannerImage/rawObservations/confidence. Antes el schema
  // los exigía y rechazaba la extracción ("no cumple el schema esperado").
  const textPayload = {
    fullName: 'Cristina Fuentes Chacaltana',
    headline: 'Transformation and Culture Lead en GRUPO HNG',
    location: 'Perú',
    currentRole: 'Transformation and Culture Lead',
    currentCompany: 'GRUPO HNG',
    about: 'Líder en transformación organizacional',
    latestExperience: null,
    latestEducation: null,
    workHistory: [{ name: 'GRUPO HNG', title: 'Transformation and Culture Lead', dateRange: 'jun 2025 - actualidad' }],
    educationHistory: [{ name: 'Universidad del Pacífico', title: 'Dirección Organizacional', dateRange: null }],
  }

  it('valida aunque falten los campos de imagen', () => {
    expect(isValidLinkedInProfileExtracted(textPayload)).toBe(true)
  })

  it('sanea con defaults seguros', () => {
    expect(isValidLinkedInProfileExtracted(textPayload)).toBe(true)
    const s = sanitizeLinkedInProfile(textPayload as unknown as LinkedInProfileExtracted)
    expect(s.currentCompany).toBe('GRUPO HNG')
    expect(s.isOpenToWork).toBe(false)
    expect(s.hasProfilePhoto).toBe(false)
    expect(s.hasBannerImage).toBe(false)
    expect(s.connectionsCount).toBeNull()
    expect(s.confidence).toBe('medium')
    expect(s.workHistory).toHaveLength(1)
  })

  it('un tipo errado en un campo de imagen NO invalida (sanitize lo coacciona)', () => {
    const bad = { ...textPayload, isOpenToWork: 'no', connectionsCount: '500+' }
    expect(isValidLinkedInProfileExtracted(bad)).toBe(true)
    const s = sanitizeLinkedInProfile(bad as unknown as LinkedInProfileExtracted)
    expect(s.isOpenToWork).toBe(false)
    expect(s.connectionsCount).toBeNull()
  })
})

describe('orgRef tolerante al shape del path de texto', () => {
  const payload = {
    fullName: 'Cristina Fuentes Chacaltana',
    headline: 'Transformation and Culture Lead en GRUPO HNG',
    location: 'Perú', currentRole: 'Lead', currentCompany: 'GRUPO HNG', about: null,
    latestExperience: null, latestEducation: null,
    // entradas como las arma el modelo desde texto: alguna sin empresa clara,
    // otra con naming alternativo (company/role/dates).
    workHistory: [
      { name: 'GRUPO HNG', title: 'Transformation and Culture Lead', dateRange: null },
      { name: null, title: 'Agile Coach corporativo', dateRange: null },
      { company: 'Hipermercados Tottus', role: 'Scrum Master', dates: '2019 - 2020' },
    ],
    educationHistory: [{ institution: 'UPC', degree: 'Marketing' }],
  }
  it('valida aunque haya entradas sin nombre o con naming alterno', () => {
    expect(isValidLinkedInProfileExtracted(payload)).toBe(true)
  })
  it('sanitize descarta las sin empresa y normaliza el resto', () => {
    const s = sanitizeLinkedInProfile(payload as unknown as LinkedInProfileExtracted)
    // la entrada con name:null se descarta; quedan GRUPO HNG y Tottus
    expect(s.workHistory.map((w) => w.name)).toEqual(['GRUPO HNG', 'Hipermercados Tottus'])
    expect(s.workHistory[1].title).toBe('Scrum Master')
    expect(s.educationHistory[0].name).toBe('UPC')
  })
})
