import { describe, it, expect } from 'vitest'
import { buildAskContext, extractCandidateNames, buildReceipts } from './ask'

describe('extractCandidateNames', () => {
  const known = ['Dayana Yrribarren Terrones', 'Francisco Pérez', 'Adrian Prochazca', 'Victor Rodriguez']
  it('matchea por primer nombre, insensible a tildes/mayúsculas', () => {
    expect(extractCandidateNames('¿qué pasó con dayana?', known)).toEqual(['Dayana Yrribarren Terrones'])
    expect(extractCandidateNames('cómo me acerco a FRANCISCO esta semana', known)).toEqual(['Francisco Pérez'])
  })
  it('no matchea si no se menciona a nadie conocido', () => {
    expect(extractCandidateNames('cómo va todo', known)).toEqual([])
  })
  it('matchea varios y acota', () => {
    const r = extractCandidateNames('victor y adrian', known)
    expect(r.sort()).toEqual(['Adrian Prochazca', 'Victor Rodriguez'])
  })
  it('evita falsos positivos por substring corto', () => {
    // "vic" no debería disparar Victor; pedimos palabra completa del primer nombre
    expect(extractCandidateNames('necesito una victoria', known)).toEqual([])
  })
})

describe('buildAskContext', () => {
  it('arma personas, memorias, objetivos y pregunta', () => {
    const ctx = buildAskContext({
      question: '¿cómo me acerco a Francisco?',
      todayISO: '2026-06-14',
      people: [{ name: 'Francisco', relationship: 'amigo', lastContact: '2026-05-01T00:00:00Z', scoreGlobal: 55, fuerza: 60, reciprocidad: null, confianza: 50, recentMemories: ['Hablaron del Mundial'], activeGoal: 'Mejorar mi relación con Francisco' }],
      memories: [{ content: 'Se ofreció a ayudarte', personName: 'Francisco', occurredAt: '2026-05-01' }],
      goals: [{ title: 'Mejorar mi relación con Francisco', nextAction: 'Invitarlo a entrenar' }],
    })
    expect(ctx).toContain('== PERSONAS ==')
    expect(ctx).toContain('Francisco')
    expect(ctx).toContain('global 55')
    expect(ctx).toContain('objetivo ligado: Mejorar mi relación con Francisco')
    expect(ctx).toContain('== OBJETIVOS ACTIVOS ==')
    expect(ctx).toContain('== PREGUNTA ==')
  })
  it('destaca el ancla como TU NORTE, aparte de los demás objetivos', () => {
    const ctx = buildAskContext({
      question: 'x', todayISO: '2026-06-14', people: [], memories: [],
      goals: [
        { title: 'Ganar el Mundial WFG26', nextAction: 'Cerrar 3 ventas', isAnchor: true },
        { title: 'Mejorar mi relación con Francisco' },
      ],
    })
    expect(ctx).toContain('== TU NORTE (el ancla del año) ==')
    expect(ctx).toContain('Ganar el Mundial WFG26')
    // El ancla no se repite en la lista de activos.
    const activos = ctx.slice(ctx.indexOf('== OBJETIVOS ACTIVOS =='))
    expect(activos).not.toContain('Ganar el Mundial WFG26')
    expect(activos).toContain('Mejorar mi relación con Francisco')
  })
  it('avisa cuando no hay data', () => {
    const ctx = buildAskContext({ question: 'x', todayISO: '2026-06-14', people: [], memories: [], goals: [] })
    expect(ctx).toContain('No se encontró data')
  })
  it('incluye la fase del ciclo con encuadre de cuidado (no determinista)', () => {
    const ctx = buildAskContext({
      question: '¿en qué fase está Diana?',
      todayISO: '2026-07-12',
      people: [{
        name: 'Diana', relationship: 'pareja', recentMemories: [],
        cycle: { label: 'Lútea', cycleDay: 20, cycleLength: 28, daysUntilNextPeriod: 9, isPmsWindow: false, isFertileWindow: false, note: 'Fase lútea. Energía decreciente.' },
      }],
      memories: [], goals: [],
    })
    expect(ctx).toContain('fase actual: Lútea (día 20/28)')
    expect(ctx).toContain('~9 día(s) para el próximo período')
    expect(ctx).toContain('NUNCA para descalificar') // el encuadre ético viaja con el dato
  })
  it('marca la ventana premenstrual cuando aplica', () => {
    const ctx = buildAskContext({
      question: 'x', todayISO: '2026-07-12',
      people: [{
        name: 'Diana', recentMemories: [],
        cycle: { label: 'Lútea', cycleDay: 26, cycleLength: 28, daysUntilNextPeriod: 3, isPmsWindow: true, isFertileWindow: false, note: 'Fase lútea.' },
      }],
      memories: [], goals: [],
    })
    expect(ctx).toContain('ventana premenstrual')
    expect(ctx).toContain('presencia y suavidad')
  })
  it('no renderiza ciclo si la persona no lo tiene', () => {
    const ctx = buildAskContext({
      question: 'x', todayISO: '2026-07-12',
      people: [{ name: 'Francisco', recentMemories: [] }],
      memories: [], goals: [],
    })
    expect(ctx).not.toContain('ciclo menstrual')
  })
})

import { isPerspectiveQuery, selectStrengthMemories } from './ask'

describe('isPerspectiveQuery', () => {
  it('detecta consultas de estado/ánimo', () => {
    expect(isPerspectiveQuery('me siento como un barco hundiéndose')).toBe(true)
    expect(isPerspectiveQuery('no doy más con todo')).toBe(true)
    expect(isPerspectiveQuery('dame perspectiva')).toBe(true)
  })
  it('no se activa en consultas normales', () => {
    expect(isPerspectiveQuery('¿cuándo cumple Francisco?')).toBe(false)
    expect(isPerspectiveQuery('¿cómo voy con Sienna?')).toBe(false)
  })
})

describe('selectStrengthMemories', () => {
  it('selecciona memorias con léxico de fuerza, más recientes primero', () => {
    const out = selectStrengthMemories([
      { content: 'Hoy llovió', occurredAt: '2026-06-18' },
      { content: 'Aaron: yo siempre puedo con todo, salí adelante antes', occurredAt: '2026-06-17' },
      { content: 'Gané la medalla, fui campeón', occurredAt: '2026-06-19' },
    ], 5)
    expect(out.length).toBe(2)
    expect(out[0]).toMatch(/campeón/i)   // 19 antes que 17
  })
  it('ignora memorias sin fuerza', () => {
    expect(selectStrengthMemories([{ content: 'compré pan', occurredAt: '2026-06-18' }])).toHaveLength(0)
  })
})

describe('buildReceipts', () => {
  it('arma recibos con persona + texto + origen, cap por persona', () => {
    const r = buildReceipts([
      { name: 'Dayana', memories: [
        { content: 'Le diste SEO y fulfillment', source: 'whatsapp_capture' },
        { content: 'Maneja Nutriday', source: 'inferred' },
        { content: 'Ex Jhodaal', source: 'inferred' },
        { content: 'cuarta — se corta', source: 'manual' },
      ] },
    ], { perPerson: 3 })
    expect(r).toHaveLength(3)
    expect(r[0]).toEqual({ person: 'Dayana', text: 'Le diste SEO y fulfillment', source: 'whatsapp_capture' })
    expect(r.map((x) => x.text)).not.toContain('cuarta — se corta')
  })
  it('dedupe por texto y respeta el cap total', () => {
    const r = buildReceipts([
      { name: 'A', memories: [{ content: 'igual', source: 'manual' }] },
      { name: 'B', memories: [{ content: 'igual', source: 'inferred' }, { content: 'otra', source: 'manual' }] },
    ], { cap: 5 })
    expect(r.map((x) => x.text)).toEqual(['igual', 'otra']) // 'igual' de B se descarta (dup)
  })
  it('descarta vacíos y clampa el cap total', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ content: `m${i}`, source: 'manual' as const }))
    const r = buildReceipts([{ name: 'X', memories: [{ content: '  ', source: 'manual' }, ...many] }], { perPerson: 20, cap: 6 })
    expect(r).toHaveLength(6)
    expect(r.every((x) => x.text.length > 0)).toBe(true)
  })
  it('conserva source undefined (memoria legada sin origen)', () => {
    const r = buildReceipts([{ name: 'X', memories: [{ content: 'vieja' }] }])
    expect(r[0].source).toBeUndefined()
  })
})
