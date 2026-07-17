// SIR V2 — Tests del modo "Explorar hipótesis" (19·M2).

import { describe, it, expect } from 'vitest'
import { HYPOTHESES_SYSTEM_PROMPT, buildHypothesesUserContent, parseHypothesesJson } from './hypothesesPrompt'

describe('HYPOTHESES_SYSTEM_PROMPT — guardrails', () => {
  it('exige hipótesis múltiples que compiten, no una etiqueta', () => {
    expect(HYPOTHESES_SYSTEM_PROMPT).toMatch(/2-4 hipótesis que COMPITEN/i)
    expect(HYPOTHESES_SYSTEM_PROMPT).toMatch(/NUNCA una sola explicación ni una etiqueta/i)
  })
  it('prohíbe diagnóstico asertado y la etiqueta como hecho', () => {
    expect(HYPOTHESES_SYSTEM_PROMPT).toMatch(/diagnóstico asertado/i)
    expect(HYPOTHESES_SYSTEM_PROMPT).toMatch(/etiqueta como hecho/i)
  })
  it('manda derivar a profesional ante riesgo serio', () => {
    expect(HYPOTHESES_SYSTEM_PROMPT).toMatch(/riesgo SERIO/i)
    expect(HYPOTHESES_SYSTEM_PROMPT).toMatch(/profesional/i)
  })
  it('mantiene enfoque Aaron-first sin habilitar explotación', () => {
    expect(HYPOTHESES_SYSTEM_PROMPT).toMatch(/SIR está del lado de Aaron/i)
    expect(HYPOTHESES_SYSTEM_PROMPT).toMatch(/acción útil para Aaron/i)
    expect(HYPOTHESES_SYSTEM_PROMPT).toMatch(/usa su herida/i)
  })
})

describe('buildHypothesesUserContent', () => {
  it('incluye persona, contexto y la preocupación', () => {
    const out = buildHypothesesUserContent(
      { personName: 'Diana', relationship: 'romantic', memories: ['muy exigente consigo'], interactionNotes: ['distante esta semana'] },
      'Hace días que está apagada y cortante.',
    )
    expect(out).toContain('Diana')
    expect(out).toContain('distante esta semana')
    expect(out).toContain('apagada y cortante')
  })
})

describe('parseHypothesesJson', () => {
  const full = JSON.stringify({
    read: 'Cambio reciente en su ánimo.',
    hypotheses: [
      { label: 'Estrés externo (trabajo)', kind: 'contextual', supports: 'coincide con su cierre de mes', against: 'no mencionó trabajo', action: 'preguntá cómo viene, sin asumir' },
      { label: 'Algo del vínculo', kind: 'relacional', supports: 'más cortante con vos', against: 'también con otros', action: 'abrí una conversación honesta' },
    ],
    protect: '',
    escalate: '',
    watchout: 'No es diagnóstico.',
  })
  it('parsea hipótesis que compiten con supports/against/action', () => {
    const r = parseHypothesesJson(full)
    expect(r?.hypotheses).toHaveLength(2)
    expect(r?.hypotheses[0].against).toContain('no mencionó')
    expect(r?.hypotheses[1].action).toMatch(/conversación/)
  })
  it('normaliza kind inválido a contextual', () => {
    const r = parseHypothesesJson('{"hypotheses":[{"label":"x","kind":"raro","supports":"a","action":"b"}]}')
    expect(r?.hypotheses[0].kind).toBe('contextual')
  })
  it('watchout por default si falta', () => {
    const r = parseHypothesesJson('{"hypotheses":[{"label":"x","supports":"a","action":"b"}]}')
    expect(r?.watchout).toMatch(/no soy clínico/i)
  })
  it('conserva protect/escalate cuando vienen', () => {
    const r = parseHypothesesJson('{"hypotheses":[{"label":"control","supports":"a","action":"b"}],"protect":"poné límites","escalate":"buscá ayuda profesional"}')
    expect(r?.protect).toContain('límites')
    expect(r?.escalate).toContain('profesional')
  })
  it('null si no hay hipótesis o no parsea', () => {
    expect(parseHypothesesJson('{"read":"x","hypotheses":[]}')).toBeNull()
    expect(parseHypothesesJson('nope')).toBeNull()
  })
})
