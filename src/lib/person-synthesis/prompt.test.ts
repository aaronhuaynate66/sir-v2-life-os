// SIR V2 — Tests del builder de input de "Lo personal" (recencia + objetivo).

import { describe, it, expect } from 'vitest'

import { buildSynthesisInput, type SynthesisConversation } from './prompt'

function conv(over: Partial<SynthesisConversation>): SynthesisConversation {
  return {
    observedAt: '2026-05-30T12:00:00Z',
    summary: null,
    topics: [],
    emotionalUser: null,
    emotionalOther: null,
    ...over,
  }
}

describe('buildSynthesisInput', () => {
  it('separa estado reciente de contexto histórico', () => {
    const input = buildSynthesisInput('Dayana', [
      conv({
        recentBlocks: ['hablan de la web de la botica', 'le interesa cotizar'],
        historicalBlocks: ['fue delegada de clase', 'ayudó con medicamentos'],
        facts: ['trabaja en Boticas Jhodaal'],
        firstISO: '2023-01-01',
        lastISO: '2026-05-30',
        messageCount: 2023,
        topics: ['business', 'web'],
      }),
    ])
    expect(input).toContain('estado reciente: hablan de la web de la botica')
    expect(input).toContain('contexto histórico (no anclar acá): fue delegada de clase')
    expect(input).toContain('hechos: trabaja en Boticas Jhodaal')
    expect(input).toContain('2023 mensajes')
  })

  it('inyecta el contexto del objetivo cuando existe', () => {
    const input = buildSynthesisInput('Dayana', [conv({ summary: 'charla' })], '1. "Cerrar Boticas Jhodaal" [career]')
    expect(input).toContain('OBJETIVOS DEL USUARIO')
    expect(input).toContain('Cerrar Boticas Jhodaal')
  })

  it('sin objetivo no agrega la sección', () => {
    const input = buildSynthesisInput('Ana', [conv({ summary: 'hola' })], null)
    expect(input).not.toContain('OBJETIVOS DEL USUARIO')
  })

  it('cae al summary si no hay bloques (data vieja / screenshot)', () => {
    const input = buildSynthesisInput('Leo', [conv({ summary: 'Charla breve sobre el finde.' })])
    expect(input).toContain('estado reciente: Charla breve sobre el finde.')
  })
})
