import { detectDealGap } from './inline'
import { describe, it, expect } from 'vitest'
import { selectInlineGap, gapMatchesIntent } from './inline'
import type { Person, Goal } from '@/types'

const person = (over: Partial<Person>): Person => ({
  id: 'p1', slug: 'p1', name: 'Diana Torres', relationship: 'romantic',
  category: 'inner', importanceScore: 9, energyImpact: 'positive', trustLevel: 8,
  contactFrequency: '', tags: [], notes: '', createdAt: '', updatedAt: '',
  ...over,
}) as Person

const goal = (over: Partial<Goal> = {}): Goal => ({
  id: 'g1', title: 'Ir al Mundial', description: '', category: 'personal',
  priority: 'high', status: 'active', progress: 0, milestones: [], relatedGoals: [],
  relatedPersons: [], peaceImpact: 8, obstacles: [], nextAction: '',
  createdAt: '', updatedAt: '',
  ...over,
}) as Goal

describe('selectInlineGap — ciclo', () => {
  const diana = person({ gender: 'female', cycleStartDate: undefined, ambito: 'personal' })

  it('pregunta el ciclo cuando la consulta es sobre su ánimo y la nombra', () => {
    const g = selectInlineGap('¿por qué está distante Diana?', [diana], [])
    expect(g?.kind).toBe('cycle')
    expect(g?.field).toBe('cycleStartDate')
  })

  it('NO pregunta si la consulta no toca su estado/ánimo', () => {
    expect(selectInlineGap('¿cuándo fue mi último contacto con Diana?', [diana], [])).toBeNull()
  })

  it('NO pregunta si no la nombra', () => {
    expect(selectInlineGap('¿cómo está ella de ánimo?', [diana], [])).toBeNull()
  })

  it('NO pregunta si el ciclo ya está cargado', () => {
    const conCiclo = person({ gender: 'female', cycleStartDate: '2026-06-01', ambito: 'personal' })
    expect(selectInlineGap('¿por qué está distante Diana?', [conCiclo], [])).toBeNull()
  })

  it('respeta el descarte (no sé)', () => {
    const g = selectInlineGap('¿por qué está distante Diana?', [diana], [], new Set(['cycle:p1']))
    expect(g).toBeNull()
  })
})

describe('selectInlineGap — cumpleaños', () => {
  it('pregunta el cumple si la consulta es sobre saludo/regalo', () => {
    const ric = person({ id: 'p2', name: 'Ricardo Martinez', relationship: 'professional', importanceScore: 7, birthDate: undefined, ambito: 'lead' })
    const g = selectInlineGap('¿qué le regalo a Ricardo?', [ric], [])
    expect(g?.kind).toBe('birthday')
  })
})

describe('selectInlineGap — próximo paso de objetivo', () => {
  it('pregunta el próximo paso si la consulta es cómo avanzar ese objetivo', () => {
    const mundial = goal({ nextAction: '', isAnchor: true })
    const g = selectInlineGap('¿qué hago para avanzar con el Mundial?', [], [mundial])
    expect(g?.kind).toBe('goal_next_action')
    expect(g?.field).toBe('nextAction')
  })

  it('NO pregunta si el objetivo ya tiene próximo paso', () => {
    const mundial = goal({ nextAction: 'Comprar entradas' })
    expect(selectInlineGap('¿qué hago para avanzar con el Mundial?', [], [mundial])).toBeNull()
  })
})

describe('gapMatchesIntent — gate determinístico', () => {
  it('cycle exige nombre + intención de estado', () => {
    const diana = person({ gender: 'female', cycleStartDate: undefined, ambito: 'personal' })
    const [cycleGap] = selectInlineGap('¿cómo está Diana?', [diana], []) ? [selectInlineGap('¿cómo está Diana?', [diana], [])!] : []
    expect(cycleGap?.kind).toBe('cycle')
    expect(gapMatchesIntent(cycleGap!, '¿cuál es el RUC de Diana?')).toBe(false)
  })
})


import { detectContextualGap } from './inline'

describe('detectContextualGap — post-conflicto', () => {
  const sig = (over: Partial<{ id: string; name: string; latestInteractionQuality: number | null; latestInteractionAt: string | null }> = {}) => ({
    id: 'p1', name: 'Maria Torres', latestInteractionQuality: 2, latestInteractionAt: '2026-06-18', ...over,
  })

  it('pregunta si hablaron después cuando hay intención de contacto y la última fue tensa', () => {
    const g = detectContextualGap('¿le escribo a Maria hoy?', [sig()])
    expect(g?.kind).toBe('post_conflict_contact')
    expect(g?.ephemeral).toBe(true)
  })

  it('NO pregunta si la última interacción fue buena', () => {
    expect(detectContextualGap('¿le escribo a Maria hoy?', [sig({ latestInteractionQuality: 5 })])).toBeNull()
  })

  it('NO pregunta sin intención de contacto', () => {
    expect(detectContextualGap('¿cuándo cumple Maria?', [sig()])).toBeNull()
  })

  it('NO pregunta si no la nombra', () => {
    expect(detectContextualGap('¿le escribo a alguien?', [sig()])).toBeNull()
  })

  it('respeta el descarte de este turno', () => {
    expect(detectContextualGap('¿le escribo a Maria hoy?', [sig()], new Set(['ctx_postconflict:p1']))).toBeNull()
  })
})

describe('detectContextualGap — conocimiento viejo (stale)', () => {
  const NOW = new Date('2026-06-20T12:00:00Z')
  const sig = (over: Partial<{ id: string; name: string; latestInteractionQuality: number | null; latestInteractionAt: string | null; importance: number }> = {}) => ({
    id: 'p9', name: 'Alvaro Gabriel', latestInteractionQuality: 4, latestInteractionAt: '2026-01-10', importance: 8, ...over,
  })

  it('pregunta si pasó algo nuevo en vínculo importante sin novedad hace >30d', () => {
    const g = detectContextualGap('¿cómo está Alvaro?', [sig()], new Set(), NOW)
    expect(g?.kind).toBe('stale_knowledge')
  })

  it('NO pregunta si la interacción es reciente', () => {
    expect(detectContextualGap('¿cómo está Alvaro?', [sig({ latestInteractionAt: '2026-06-15' })], new Set(), NOW)).toBeNull()
  })

  it('NO pregunta si el vínculo no es importante', () => {
    expect(detectContextualGap('¿cómo está Alvaro?', [sig({ importance: 3 })], new Set(), NOW)).toBeNull()
  })

  it('NO pregunta sin intención de consejo/estado', () => {
    expect(detectContextualGap('¿cuál es el RUC de Alvaro?', [sig()], new Set(), NOW)).toBeNull()
  })

  it('post-conflicto gana sobre stale cuando ambos aplican', () => {
    const g = detectContextualGap('¿le escribo a Alvaro?', [sig({ latestInteractionQuality: 2 })], new Set(), NOW)
    expect(g?.kind).toBe('post_conflict_contact')
  })

  it('respeta el descarte del stale (este turno)', () => {
    expect(detectContextualGap('¿cómo está Alvaro?', [sig()], new Set(['ctx_stale:p9']), NOW)).toBeNull()
  })
})

describe('detectDealGap — deal estancado', () => {
  const NOW = new Date('2026-06-20T12:00:00Z')
  const deal = (over: Partial<{ id: string; title: string; contactFirst: string | null; status: string; nextAction: string | null; nextActionDate: string | null; updatedAt: string | null }> = {}) => ({
    id: 'd1', title: 'Sienna Minerals seguridad', contactFirst: 'Ivis', status: 'open', nextAction: null, nextActionDate: null, updatedAt: '2026-06-18', amount: 50000, stage: 'reunion', ...over,
  })
  it('pregunta si menciona el deal por título y no hay próximo paso', () => {
    const g = detectDealGap('¿cómo voy con Sienna?', [deal()], new Set(), NOW)
    expect(g?.kind).toBe('deal_stalled')
    expect(g?.entity).toBe('deal')
  })
  it('pregunta por contacto + palabra genérica', () => {
    const g = detectDealGap('¿qué hago con la oportunidad de Ivis?', [deal()], new Set(), NOW)
    expect(g?.kind).toBe('deal_stalled')
  })
  it('NO pregunta si el deal tiene próximo paso futuro y update reciente', () => {
    expect(detectDealGap('¿cómo voy con Sienna?', [deal({ nextAction: 'Reunión Teams', nextActionDate: '2026-06-22', updatedAt: '2026-06-19' })], new Set(), NOW)).toBeNull()
  })
  it('pregunta si el próximo paso quedó vencido', () => {
    const g = detectDealGap('¿cómo voy con Sienna?', [deal({ nextAction: 'Llamar', nextActionDate: '2026-06-10', updatedAt: '2026-06-19' })], new Set(), NOW)
    expect(g?.kind).toBe('deal_stalled')
  })
  it('NO pregunta si el deal está cerrado', () => {
    expect(detectDealGap('¿cómo voy con Sienna?', [deal({ status: 'won' })], new Set(), NOW)).toBeNull()
  })
  it('respeta el descarte', () => {
    expect(detectDealGap('¿cómo voy con Sienna?', [deal()], new Set(['ctx_dealstalled:d1']), NOW)).toBeNull()
  })
})


describe('gap de objetivo — no falso positivo por palabras comunes', () => {
  const goal = (over: Partial<Goal> = {}): Goal => ({
    id: 'g1', title: 'Cerrar Boticas Jhodaal como cliente de Marlab', description: '', category: 'work',
    priority: 'high', status: 'active', progress: 0, milestones: [], relatedGoals: [],
    relatedPersons: [], peaceImpact: 5, obstacles: [], nextAction: '', createdAt: '', updatedAt: '',
    ...over,
  }) as Goal
  it('NO matchea por "como" cuando la consulta es de otra cosa', () => {
    expect(selectInlineGap('¿cómo voy con la oportunidad de Sienna?', [], [goal()])).toBeNull()
  })
  it('SÍ matchea por un token real del título', () => {
    const g = selectInlineGap('¿qué hago para avanzar con Boticas?', [], [goal()])
    expect(g?.kind).toBe('goal_next_action')
  })
})

describe('detectDealGap — ticket sin cargar', () => {
  const NOW = new Date('2026-06-20T12:00:00Z')
  const deal = (over: Partial<{ id: string; title: string; contactFirst: string | null; status: string; nextAction: string | null; nextActionDate: string | null; updatedAt: string | null; amount: number | null }> = {}) => ({
    id: 'd9', title: 'Silver X seguridad', contactFirst: 'Ricardo', status: 'open', nextAction: 'Reunión', nextActionDate: '2026-06-22', updatedAt: '2026-06-19', amount: null, stage: 'propuesta', ...over,
  })
  it('pregunta el ticket si el deal está al día pero sin monto', () => {
    const g = detectDealGap('¿cómo voy con Silver X?', [deal()], new Set(), NOW)
    expect(g?.kind).toBe('deal_no_ticket')
  })
  it('NO pregunta el ticket si ya tiene monto', () => {
    expect(detectDealGap('¿cómo voy con Silver X?', [deal({ amount: 50000 })], new Set(), NOW)).toBeNull()
  })
})
