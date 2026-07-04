// SIR V2 — Tests de la capa pura de "Cómo plantearle X" (16·M1).

import { describe, it, expect } from 'vitest'
import { FRAME_SYSTEM_PROMPT, buildFrameUserContent, parseFrameJson } from './framePrompt'

describe('FRAME_SYSTEM_PROMPT — guardrail ético', () => {
  it('prohíbe mentir/exagerar y explotar', () => {
    expect(FRAME_SYSTEM_PROMPT).toMatch(/NUNCA sugieras decir algo falso/i)
    expect(FRAME_SYSTEM_PROMPT).toMatch(/manipular/i)
    expect(FRAME_SYSTEM_PROMPT).toMatch(/ethicalNote/)
  })
})

describe('buildFrameUserContent', () => {
  it('incluye persona, rol, memorias y objetivo', () => {
    const out = buildFrameUserContent(
      { personName: 'Alex Heilbrunn', role: 'Dirección Ejecutiva', organization: 'Grupo HNG', relationship: 'professional', memories: ['Le importan los resultados medibles', 'Valora la visión de largo plazo'] },
      'Pedir un aumento de sueldo',
    )
    expect(out).toContain('Alex Heilbrunn')
    expect(out).toContain('Dirección Ejecutiva')
    expect(out).toContain('resultados medibles')
    expect(out).toContain('Pedir un aumento')
  })
  it('sin memorias → marca la incertidumbre', () => {
    const out = buildFrameUserContent({ personName: 'X', memories: [] }, 'algo')
    expect(out).toMatch(/poco contexto/i)
  })
  it('recorta memorias a 12', () => {
    const many = Array.from({ length: 20 }, (_, i) => `memoria ${i}`)
    const out = buildFrameUserContent({ personName: 'X', memories: many }, 'algo')
    expect((out.match(/- memoria/g) ?? []).length).toBe(12)
  })
})

describe('parseFrameJson', () => {
  it('parsea una respuesta completa', () => {
    const raw = JSON.stringify({
      values: ['resultados', 'visión'], frame: 'Encuadrá por valor aportado.',
      leadWith: 'Tus logros del año.', avoid: ['hablar de necesidad personal'],
      opener: 'Quería revisar mi impacto este año y hacia dónde puedo aportar más.',
      ethicalNote: '',
    })
    const r = parseFrameJson(raw)
    expect(r?.values).toEqual(['resultados', 'visión'])
    expect(r?.opener).toContain('impacto')
    expect(r?.avoid).toHaveLength(1)
  })
  it('tolera fences', () => {
    const r = parseFrameJson('```json\n{"frame":"x","opener":"y"}\n```')
    expect(r?.frame).toBe('x')
  })
  it('conserva ethicalNote cuando el modelo rechaza manipular', () => {
    const r = parseFrameJson(JSON.stringify({ values: [], frame: '', leadWith: '', avoid: [], opener: '', ethicalNote: 'Eso sería engañarla; te paso el camino honesto.' }))
    expect(r?.ethicalNote).toContain('honesto')
  })
  it('null si no hay ángulo ni apertura ni nota', () => {
    expect(parseFrameJson('{"values":[]}')).toBeNull()
  })
  it('null si no parsea', () => {
    expect(parseFrameJson('no soy json')).toBeNull()
  })
})
