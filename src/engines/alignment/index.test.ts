// SIR V2 — Tests del Alignment Engine (Etapa 4 MVP).
//
// Lógica pura y determinística (now inyectado). Casos pedidos: objetivo
// alineado, a la deriva, necesita atención, sin datos (sin vínculo / sin
// señales), múltiples objetivos (orden por urgencia), vínculo ausente.

import { describe, it, expect } from 'vitest'

import type { Goal, Memory, Person, Relationship } from '@/types'
import {
  computeGoalAlignment,
  computeAlignments,
  goalKeywords,
  matchMemoryTags,
} from './index'

const NOW = new Date('2026-06-01T12:00:00.000Z')

function memory(o: Partial<Memory> & { id: string }): Memory {
  return {
    type: 'episodic',
    title: o.id,
    content: '',
    entities: [],
    emotionalCharge: 0,
    importance: 5,
    timestamp: '2026-05-30T00:00:00.000Z',
    lastAccessed: '2026-05-30T00:00:00.000Z',
    decayRate: 0.05,
    tags: [],
    relatedMemories: [],
    ...o,
  }
}

function person(o: Partial<Person> & { id: string }): Person {
  return {
    name: o.id,
    relationship: 'romantic',
    category: 'inner_circle',
    importanceScore: 8,
    energyImpact: 'neutral',
    trustLevel: 7,
    contactFrequency: '',
    tags: [],
    notes: '',
    ...o,
  } as Person
}

function rel(personId: string, status: Relationship['status'] = 'active'): Relationship {
  return {
    id: `r_${personId}`, personId, type: 'romantic', status, depth: 6, reciprocity: 6,
    history: [], sharedGoals: [], tensions: [], strengths: [],
  }
}

function goal(o: Partial<Goal> & { id: string }): Goal {
  return {
    title: o.id, description: '', category: 'relational', priority: 'high', status: 'active',
    progress: 50, milestones: [], relatedGoals: [], relatedPersons: [], peaceImpact: 5,
    obstacles: [], nextAction: '', createdAt: '', updatedAt: '', ...o,
  }
}

const ctx = (people: Person[], relationships: Relationship[] = [], memories: Memory[] = []) => ({
  people,
  relationships,
  memories,
  now: NOW,
})

describe('computeGoalAlignment — señal de tono (A, Etapa 4)', () => {
  it('interacciones positivas (avg ≥3.5) → señal concern 0 (acompaña)', () => {
    const p = person({ id: 'p', name: 'Diana' })
    const g = goal({ id: 'g', relatedPersons: ['p'] })
    const a = computeGoalAlignment(g, { people: [p], relationships: [], memories: [], now: NOW, interactionTones: { p: [4, 5, 4] } })
    const tone = a.signals.find((s) => s.kind === 'interaction_tone')
    expect(tone).toBeTruthy()
    expect(tone?.concern).toBe(0)
    expect(a.state).toBe('aligned')
  })

  it('interacciones tensas (≤2, ≥2 registros) → concern 2 → needs_attention', () => {
    const p = person({ id: 'p', name: 'Diana' })
    const g = goal({ id: 'g', relatedPersons: ['p'] })
    const a = computeGoalAlignment(g, { people: [p], relationships: [], memories: [], now: NOW, interactionTones: { p: [1, 2] } })
    const tone = a.signals.find((s) => s.kind === 'interaction_tone')
    expect(tone?.concern).toBe(2)
    expect(a.state).toBe('needs_attention')
  })

  it('sin tonos → no hay señal de tono', () => {
    const p = person({ id: 'p', name: 'Diana' })
    const g = goal({ id: 'g', relatedPersons: ['p'] })
    const a = computeGoalAlignment(g, { people: [p], relationships: [], memories: [], now: NOW })
    expect(a.signals.find((s) => s.kind === 'interaction_tone')).toBeUndefined()
  })

  it('usa solo las últimas 5 interacciones', () => {
    const p = person({ id: 'p', name: 'Diana' })
    const g = goal({ id: 'g', relatedPersons: ['p'] })
    // viejas malas + últimas 5 buenas → debe leerse positivo
    const a = computeGoalAlignment(g, { people: [p], relationships: [], memories: [], now: NOW, interactionTones: { p: [1, 1, 1, 4, 5, 4, 5, 4] } })
    expect(a.signals.find((s) => s.kind === 'interaction_tone')?.concern).toBe(0)
  })
})

describe('computeGoalAlignment — inferencia por evidencia (B, Etapa 4)', () => {
  it('objetivo SIN personas vinculadas pero con memoria que lo menciona → INFERIDO', () => {
    const g = goal({ id: 'venta', title: 'cerrar venta farmacia', category: 'financial', relatedPersons: [] })
    const p = person({ id: 'diana', name: 'Diana' })
    const m = memory({ id: 'm1', personId: 'diana', timestamp: '2026-05-30T00:00:00.000Z', tags: ['comercial'] })
    const a = computeGoalAlignment(g, ctx([p], [], [m]))
    expect(a.inferred).toBe(true)
    expect(a.linkedPersonNames).toContain('Diana')
    expect(a.signals.length).toBeGreaterThan(0)
    expect(a.state).not.toBe('insufficient_data')
  })

  it('sin vínculo y sin evidencia → insufficient_data con mensaje nuevo (no inferred)', () => {
    const g = goal({ id: 'x', title: 'aprender piano', category: 'personal', relatedPersons: [] })
    const a = computeGoalAlignment(g, ctx([person({ id: 'diana' })], [], []))
    expect(a.state).toBe('insufficient_data')
    expect(a.inferred).toBeFalsy()
    expect(a.summary).toContain('No encontramos')
  })

  it('memoria vieja (>45d) NO infiere vínculo', () => {
    const g = goal({ id: 'venta', title: 'cerrar venta farmacia', category: 'financial', relatedPersons: [] })
    const p = person({ id: 'diana', name: 'Diana' })
    const m = memory({ id: 'm1', personId: 'diana', timestamp: '2026-01-01T00:00:00.000Z', tags: ['comercial'] })
    const a = computeGoalAlignment(g, ctx([p], [], [m]))
    expect(a.inferred).toBeFalsy()
    expect(a.state).toBe('insufficient_data')
  })
})

describe('computeGoalAlignment — estados', () => {
  it('ALINEADO: contacto reciente + relación activa + vínculo energizante', () => {
    const p = person({ id: 'pareja', lastContact: '2026-05-30', energyImpact: 'energizing' }) // 2d
    const g = goal({ id: 'g1', title: 'Ser mejor pareja', relatedPersons: ['pareja'] })
    const a = computeGoalAlignment(g, ctx([p], [rel('pareja', 'active')]))
    expect(a.state).toBe('aligned')
    expect(a.linkedPersonNames).toEqual(['pareja'])
    expect(a.signals.some((s) => s.kind === 'contact_recency' && s.concern === 0)).toBe(true)
  })

  it('A LA DERIVA: sin contacto 20 días (concern 1) sin señales peores', () => {
    const p = person({ id: 'pareja', lastContact: '2026-05-12', energyImpact: 'neutral' }) // 20d
    const g = goal({ id: 'g1', relatedPersons: ['pareja'] })
    const a = computeGoalAlignment(g, ctx([p], [rel('pareja', 'active')]))
    expect(a.state).toBe('drifting')
  })

  it('NECESITA ATENCIÓN: relación en tensión + sin contacto 40 días (el ejemplo del roadmap)', () => {
    const p = person({ id: 'pareja', lastContact: '2026-04-22' }) // 40d
    const g = goal({ id: 'g1', title: 'Ser mejor pareja', relatedPersons: ['pareja'] })
    const a = computeGoalAlignment(g, ctx([p], [rel('pareja', 'strained')]))
    expect(a.state).toBe('needs_attention')
    expect(a.signals.some((s) => s.kind === 'relationship_status' && s.concern === 2)).toBe(true)
    expect(a.signals.some((s) => s.kind === 'contact_recency' && s.concern === 2)).toBe(true)
    expect(a.summary).toContain('reflexionar') // tono reflexivo, no culposo
  })

  it('peor señal manda: contacto reciente PERO relación en tensión → needs_attention', () => {
    const p = person({ id: 'x', lastContact: '2026-05-31' }) // 1d, concern 0
    const g = goal({ id: 'g1', relatedPersons: ['x'] })
    const a = computeGoalAlignment(g, ctx([p], [rel('x', 'strained')]))
    expect(a.state).toBe('needs_attention')
  })
})

describe('computeGoalAlignment — datos insuficientes (no inventa brecha)', () => {
  it('objetivo SIN personas vinculadas → insufficient_data, sin señales', () => {
    const g = goal({ id: 'g1', title: 'Meditar más', category: 'personal', relatedPersons: [] })
    const a = computeGoalAlignment(g, ctx([]))
    expect(a.state).toBe('insufficient_data')
    expect(a.signals).toEqual([])
    expect(a.summary).toContain('Vinculá personas')
  })

  it('persona vinculada que NO existe en el store → insufficient_data', () => {
    const g = goal({ id: 'g1', relatedPersons: ['fantasma'] })
    const a = computeGoalAlignment(g, ctx([person({ id: 'otra' })]))
    expect(a.state).toBe('insufficient_data')
    expect(a.linkedPersonNames).toEqual([])
  })

  it('persona vinculada SIN lastContact NI relación registrada NI energía → insufficient_data', () => {
    const p = person({ id: 'p', energyImpact: 'neutral' }) // sin lastContact
    const g = goal({ id: 'g1', relatedPersons: ['p'] })
    const a = computeGoalAlignment(g, ctx([p], [])) // sin relación
    expect(a.state).toBe('insufficient_data')
    expect(a.linkedPersonNames).toEqual(['p']) // resolvió la persona, pero sin señales
  })
})

describe('computeGoalAlignment — múltiples personas', () => {
  it('agrega la PEOR señal entre varias personas vinculadas', () => {
    const ok = person({ id: 'ok', lastContact: '2026-05-30' }) // reciente
    const bad = person({ id: 'bad', lastContact: '2026-03-01' }) // >40d
    const g = goal({ id: 'g1', title: 'Cuidar a mi familia', relatedPersons: ['ok', 'bad'] })
    const a = computeGoalAlignment(g, ctx([ok, bad], [rel('ok'), rel('bad')]))
    expect(a.state).toBe('needs_attention')
    expect(a.linkedPersonNames.sort()).toEqual(['bad', 'ok'])
  })
})

describe('computeAlignments — múltiples objetivos', () => {
  it('filtra no-activos y ordena por urgencia (needs_attention → aligned → insufficient_data)', () => {
    const pBad = person({ id: 'bad', lastContact: '2026-03-01' })
    const pOk = person({ id: 'ok', lastContact: '2026-05-31', energyImpact: 'energizing' })
    const goals: Goal[] = [
      goal({ id: 'aligned', relatedPersons: ['ok'] }),
      goal({ id: 'attention', relatedPersons: ['bad'] }),
      goal({ id: 'nodata', relatedPersons: [] }),
      goal({ id: 'paused', relatedPersons: ['bad'], status: 'paused' }), // excluido
    ]
    const out = computeAlignments(goals, ctx([pBad, pOk], [rel('ok'), rel('bad', 'strained')]))
    expect(out.map((a) => a.goalId)).toEqual(['attention', 'aligned', 'nodata'])
  })

  it('sin objetivos activos → []', () => {
    expect(computeAlignments([goal({ id: 'g', status: 'completed' })], ctx([]))).toEqual([])
  })
})

// ─── Señales TAGGED (cruce objetivo ↔ memorias derivadas) ───────────────

describe('goalKeywords', () => {
  it('extrae palabras clave del texto, normaliza acentos y descarta stopwords', () => {
    const g = goal({ id: 'g', title: 'Cerrar Boticas Jhodaal', description: 'avanzar con Openmed' })
    const kw = goalKeywords(g)
    expect(kw.has('jhodaal')).toBe(true)
    expect(kw.has('boticas')).toBe(true)
    expect(kw.has('openmed')).toBe(true)
    expect(kw.has('cerrar')).toBe(false) // stopword (verbo de acción)
    expect(kw.has('con')).toBe(false) // < 4 chars
  })
})

describe('matchMemoryTags', () => {
  // Contrato: los sets de keywords/categoryTags llegan YA normalizados (sin
  // acentos ni guiones), igual que los produce goalKeywords y el engine.
  const kw = new Set(['jhodaal', 'openmed'])
  const cat = new Set(['comercial', 'proximopaso'])

  it('matchea por tag canónico del rubro y por palabra clave (conserva el tag original)', () => {
    const matched = matchMemoryTags(['comercial', 'próximo_paso', 'jhodaal', 'random'], kw, cat)
    expect(matched).toEqual(['comercial', 'próximo_paso', 'jhodaal'])
  })

  it('excluye las marcas de recencia (histórico/obsoleto)', () => {
    expect(matchMemoryTags(['comercial', 'histórico', 'obsoleto'], kw, cat)).toEqual(['comercial'])
  })

  it('sin cruce → []', () => {
    expect(matchMemoryTags(['personal', 'familia'], kw, cat)).toEqual([])
  })
})

describe('computeGoalAlignment — señales tagged (goal_activity)', () => {
  const dayana = (over: Partial<Person> = {}) =>
    person({ id: 'dayana', name: 'Dayana', relationship: 'friend', ...over })
  const jhodaalGoal = (over: Partial<Goal> = {}) =>
    goal({
      id: 'jhodaal',
      title: 'Cerrar Boticas Jhodaal',
      category: 'financial',
      relatedPersons: ['dayana'],
      ...over,
    })

  it('memoria reciente con tag comercial → cita la actividad como señal (concern 0) + evidencia', () => {
    const m = memory({
      id: 'm1',
      personId: 'dayana',
      tags: ['comercial', 'jhodaal'],
      content: 'Mencionó que necesita la cotización de Openmed esta semana.',
      timestamp: '2026-05-28T00:00:00.000Z', // 4 días
    })
    const a = computeGoalAlignment(jhodaalGoal(), ctx([dayana()], [], [m]))
    const act = a.signals.find((s) => s.kind === 'goal_activity')
    expect(act).toBeDefined()
    expect(act?.concern).toBe(0)
    expect(act?.label).toContain('Dayana')
    expect(act?.label).toContain('comercial')
    expect(act?.detail).toContain('cotización')
    // Sin señales relacionales preocupantes → la actividad acompaña → aligned.
    expect(a.state).toBe('aligned')
  })

  it('objetivo financiero SIN actividad reciente ni señal relacional → no_recent_signal', () => {
    const a = computeGoalAlignment(jhodaalGoal(), ctx([dayana()], [], []))
    expect(a.state).toBe('no_recent_signal')
    expect(a.signals).toEqual([])
    expect(a.summary).toContain('Sin señales recientes')
    expect(a.summary).toContain('Dayana')
  })

  it('tags relevantes pero VIEJOS → no_recent_signal con summary de "quedó viejo"', () => {
    const old = memory({
      id: 'mold',
      personId: 'dayana',
      tags: ['comercial', 'jhodaal'],
      content: 'Hablaron del deal el año pasado.',
      timestamp: '2026-01-01T00:00:00.000Z', // > 45 días
    })
    const a = computeGoalAlignment(jhodaalGoal(), ctx([dayana()], [], [old]))
    expect(a.state).toBe('no_recent_signal')
    expect(a.summary).toContain('quedó viejo')
  })

  it('memoria marcada como obsoleta NO cuenta como actividad reciente', () => {
    const obsolete = memory({
      id: 'mobs',
      personId: 'dayana',
      tags: ['comercial', 'obsoleto'],
      content: 'Rol viejo, ya no aplica.',
      timestamp: '2026-05-30T00:00:00.000Z', // reciente pero obsoleta
    })
    const a = computeGoalAlignment(jhodaalGoal(), ctx([dayana()], [], [obsolete]))
    expect(a.signals.some((s) => s.kind === 'goal_activity')).toBe(false)
    expect(a.state).toBe('no_recent_signal')
  })

  it('objetivo RELACIONAL sin actividad ni contacto → sigue insufficient_data (no no_recent_signal)', () => {
    const g = goal({ id: 'g', title: 'Ser mejor pareja', category: 'relational', relatedPersons: ['dayana'] })
    const a = computeGoalAlignment(g, ctx([dayana()], [], []))
    expect(a.state).toBe('insufficient_data')
  })

  it('actividad tagged convive con señal relacional preocupante (peor señal manda)', () => {
    const m = memory({ id: 'm', personId: 'dayana', tags: ['comercial'], content: 'avance', timestamp: '2026-05-30T00:00:00.000Z' })
    const p = dayana({ lastContact: '2026-04-15' }) // > 30d → concern 2
    const a = computeGoalAlignment(jhodaalGoal(), ctx([p], [], [m]))
    expect(a.signals.some((s) => s.kind === 'goal_activity' && s.concern === 0)).toBe(true)
    expect(a.signals.some((s) => s.kind === 'contact_recency' && s.concern === 2)).toBe(true)
    expect(a.state).toBe('needs_attention')
  })

  it('matchea memoria por entities[] cuando personId no está seteado', () => {
    const m = memory({ id: 'm', entities: ['dayana'], tags: ['comercial'], content: 'x', timestamp: '2026-05-30T00:00:00.000Z' })
    const a = computeGoalAlignment(jhodaalGoal(), ctx([dayana()], [], [m]))
    expect(a.signals.some((s) => s.kind === 'goal_activity')).toBe(true)
  })

  it('memoria de OTRA persona no contamina el objetivo', () => {
    const m = memory({ id: 'm', personId: 'otra', tags: ['comercial', 'jhodaal'], content: 'x', timestamp: '2026-05-30T00:00:00.000Z' })
    const a = computeGoalAlignment(jhodaalGoal(), ctx([dayana()], [], [m]))
    expect(a.state).toBe('no_recent_signal')
  })
})
