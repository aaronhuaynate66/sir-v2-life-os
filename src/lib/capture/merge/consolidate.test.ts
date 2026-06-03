import { describe, it, expect } from 'vitest'

import {
  consolidateBatch,
  mergeConfidence,
  mergeExtracted,
  pickConsolidatedType,
  type BatchItemInput,
} from './consolidate'

// ─── helpers ────────────────────────────────────────────────────────

function li(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    fullName: null,
    headline: null,
    location: null,
    currentRole: null,
    currentCompany: null,
    about: null,
    latestExperience: null,
    latestEducation: null,
    workHistory: [],
    educationHistory: [],
    profileUrl: null,
    connectionsCount: null,
    isOpenToWork: false,
    hasProfilePhoto: false,
    hasBannerImage: false,
    imageLegible: true,
    confidence: 'high',
    rawObservations: null,
    ...overrides,
  }
}

function ig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    handle: 'someone',
    displayName: null,
    bio: null,
    externalLink: null,
    pronouns: null,
    category: null,
    postsCount: null,
    followersCount: null,
    followingCount: null,
    isVerified: false,
    isPrivate: false,
    hasProfilePhoto: false,
    mutualFollowersText: null,
    mutualFollowers: null,
    confidence: 'high',
    rawObservations: null,
    ...overrides,
  }
}

// ─── mergeConfidence ────────────────────────────────────────────────

describe('mergeConfidence', () => {
  it('toma la confianza más alta', () => {
    expect(mergeConfidence([{ confidence: 'low' }, { confidence: 'high' }, { confidence: 'medium' }])).toBe('high')
  })
  it('null si ninguna trae confianza válida', () => {
    expect(mergeConfidence([{}, { confidence: 'nope' }])).toBeNull()
  })
})

// ─── pickConsolidatedType ───────────────────────────────────────────

describe('pickConsolidatedType', () => {
  it('elige el tipo mayoritario', () => {
    expect(pickConsolidatedType(['linkedin', 'instagram', 'linkedin'])).toBe('linkedin')
  })
  it('desempata por primera aparición', () => {
    expect(pickConsolidatedType(['instagram', 'linkedin'])).toBe('instagram')
  })
  it('null si vacío', () => {
    expect(pickConsolidatedType([])).toBeNull()
  })
})

// ─── mergeExtracted: LinkedIn ───────────────────────────────────────

describe('mergeExtracted — linkedin', () => {
  it('un solo item ≈ identidad (campos clave preservados)', () => {
    const a = li({ fullName: 'Ada Lovelace', headline: 'Mathematician' })
    const { extracted } = mergeExtracted('linkedin', [a])
    expect(extracted.fullName).toBe('Ada Lovelace')
    expect(extracted.headline).toBe('Mathematician')
  })

  it('strings: se queda con el MÁS COMPLETO ante contradicción', () => {
    const a = li({ headline: 'Ing.' })
    const b = li({ headline: 'Ingeniera Industrial en Acme Corp' })
    const { extracted } = mergeExtracted('linkedin', [a, b])
    expect(extracted.headline).toBe('Ingeniera Industrial en Acme Corp')
  })

  it('historial laboral: UNIÓN deduplicada de varias secciones', () => {
    const a = li({
      workHistory: [{ name: 'Acme', title: 'CEO', dateRange: '2020 - Present' }],
    })
    const b = li({
      workHistory: [
        { name: 'Acme', title: 'CEO', dateRange: null }, // duplicado → completa dateRange? ya lo tiene
        { name: 'Globex', title: 'CTO', dateRange: '2015 - 2020' },
      ],
    })
    const { extracted } = mergeExtracted('linkedin', [a, b])
    const wh = extracted.workHistory as { name: string; title: string | null; dateRange: string | null }[]
    expect(wh).toHaveLength(2)
    expect(wh.map((w) => w.name)).toEqual(['Acme', 'Globex'])
    // latestExperience = primer item del historial unido
    expect((extracted.latestExperience as { name: string }).name).toBe('Acme')
  })

  it('orgRef duplicado sin dateRange se completa con una captura posterior', () => {
    const a = li({ workHistory: [{ name: 'Acme', title: 'CEO', dateRange: null }] })
    const b = li({ workHistory: [{ name: 'Acme', title: 'CEO', dateRange: '2020 - Present' }] })
    const { extracted } = mergeExtracted('linkedin', [a, b])
    const wh = extracted.workHistory as { dateRange: string | null }[]
    expect(wh).toHaveLength(1)
    expect(wh[0].dateRange).toBe('2020 - Present')
  })

  it('números: máximo (conexiones leídas parcialmente)', () => {
    const { extracted } = mergeExtracted('linkedin', [
      li({ connectionsCount: 500 }),
      li({ connectionsCount: 873 }),
    ])
    expect(extracted.connectionsCount).toBe(873)
  })

  it('booleans: OR; profileUrl: primer no-vacío; confidence: la más alta', () => {
    const a = li({ isOpenToWork: false, profileUrl: null, confidence: 'medium' })
    const b = li({ isOpenToWork: true, profileUrl: 'https://linkedin.com/in/ada', confidence: 'high' })
    const { extracted, confidence } = mergeExtracted('linkedin', [a, b])
    expect(extracted.isOpenToWork).toBe(true)
    expect(extracted.profileUrl).toBe('https://linkedin.com/in/ada')
    expect(extracted.confidence).toBe('high')
    expect(confidence).toBe('high')
  })
})

// ─── mergeExtracted: Instagram ──────────────────────────────────────

describe('mergeExtracted — instagram', () => {
  it('bio más completa, contadores al máximo, handle primer no-vacío', () => {
    const a = ig({ handle: 'ada', bio: 'dev', followersCount: 1000 })
    const b = ig({ handle: 'ada', bio: 'developer & matemática', followersCount: 1200 })
    const { extracted } = mergeExtracted('instagram', [a, b])
    expect(extracted.handle).toBe('ada')
    expect(extracted.bio).toBe('developer & matemática')
    expect(extracted.followersCount).toBe(1200)
  })

  it('seguidores en común: unión de nombrados + máximo totalCount', () => {
    const a = ig({
      mutualFollowersText: 'maria y 3 más siguen esta cuenta',
      mutualFollowers: { named: ['maria'], totalCount: 4 },
    })
    const b = ig({
      mutualFollowersText: 'maria, jose y 10 más siguen esta cuenta',
      mutualFollowers: { named: ['maria', 'jose'], totalCount: 12 },
    })
    const { extracted } = mergeExtracted('instagram', [a, b])
    const m = extracted.mutualFollowers as { named: string[]; totalCount: number | null }
    expect(m.named).toEqual(['maria', 'jose'])
    expect(m.totalCount).toBe(12)
    // El texto representativo es el de mayor conteo.
    expect(extracted.mutualFollowersText).toBe('maria, jose y 10 más siguen esta cuenta')
  })
})

// ─── consolidateBatch ───────────────────────────────────────────────

describe('consolidateBatch', () => {
  it('consolida varias capturas legibles del mismo perfil en una sola', () => {
    const items: BatchItemInput[] = [
      { id: '0', plan: 'link', captureType: 'linkedin', verdict: 'ok', confidence: 'high', extracted: li({ fullName: 'Ada', headline: 'Ing.' }) },
      { id: '1', plan: 'link', captureType: 'linkedin', verdict: 'review', confidence: 'medium', extracted: li({ headline: 'Ingeniera Industrial' }) },
    ]
    const r = consolidateBatch(items)
    expect(r.consolidatedType).toBe('linkedin')
    expect(r.usedIds).toEqual(['0', '1'])
    expect(r.illegibleIds).toEqual([])
    expect((r.extracted as Record<string, unknown>).fullName).toBe('Ada')
    expect((r.extracted as Record<string, unknown>).headline).toBe('Ingeniera Industrial')
  })

  it('una imagen ILEGIBLE dentro del lote se omite, las demás se procesan', () => {
    const items: BatchItemInput[] = [
      { id: '0', plan: 'link', captureType: 'linkedin', verdict: 'ok', extracted: li({ fullName: 'Ada' }) },
      { id: '1', plan: 'link', captureType: 'linkedin', verdict: 'unreadable', extracted: li({ fullName: 'basura' }) },
      { id: '2', plan: 'link', captureType: 'linkedin', verdict: 'review', extracted: li({ headline: 'CTO en Globex' }) },
    ]
    const r = consolidateBatch(items)
    expect(r.usedIds).toEqual(['0', '2'])
    expect(r.illegibleIds).toEqual(['1'])
    expect((r.extracted as Record<string, unknown>).fullName).toBe('Ada')
    expect((r.extracted as Record<string, unknown>).headline).toBe('CTO en Globex')
  })

  it('todas ilegibles → sin tipo ni extracted, todas en illegibleIds', () => {
    const items: BatchItemInput[] = [
      { id: '0', plan: 'link', captureType: 'linkedin', verdict: 'unreadable', extracted: li() },
      { id: '1', plan: 'link', captureType: 'linkedin', verdict: 'unreadable', extracted: li() },
    ]
    const r = consolidateBatch(items)
    expect(r.consolidatedType).toBeNull()
    expect(r.extracted).toBeNull()
    expect(r.illegibleIds).toEqual(['0', '1'])
  })

  it('aparta báscula, no-soportadas y errores; consolida sólo el tipo mayoritario', () => {
    const items: BatchItemInput[] = [
      { id: '0', plan: 'link', captureType: 'linkedin', verdict: 'ok', extracted: li({ fullName: 'Ada' }) },
      { id: '1', plan: 'link', captureType: 'linkedin', verdict: 'ok', extracted: li({ headline: 'Ing.' }) },
      { id: '2', plan: 'scale', captureType: 'scale' },
      { id: '3', plan: 'unsupported', captureType: 'unknown' },
      { id: '4', plan: 'link', captureType: 'instagram', verdict: 'ok', extracted: ig({ handle: 'ada' }) },
      { id: '5', plan: 'link', captureType: 'linkedin', error: 'fallo Vision' },
    ]
    const r = consolidateBatch(items)
    expect(r.consolidatedType).toBe('linkedin')
    expect(r.usedIds).toEqual(['0', '1'])
    expect(r.scaleIds).toEqual(['2'])
    expect(r.unsupportedIds).toEqual(['3'])
    expect(r.mismatchIds).toEqual(['4']) // instagram, minoría
    expect(r.erroredIds).toEqual(['5'])
  })

  it('lote de una sola imagen usable se comporta como captura simple', () => {
    const items: BatchItemInput[] = [
      { id: '0', plan: 'link', captureType: 'instagram', verdict: 'ok', confidence: 'high', extracted: ig({ handle: 'ada', bio: 'dev' }) },
    ]
    const r = consolidateBatch(items)
    expect(r.consolidatedType).toBe('instagram')
    expect(r.usedIds).toEqual(['0'])
    expect((r.extracted as Record<string, unknown>).handle).toBe('ada')
  })
})
