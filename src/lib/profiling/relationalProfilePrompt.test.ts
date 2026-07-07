// SIR V2 — Tests del perfil relacional (19·M1).

import { describe, it, expect } from 'vitest'
import { RELATIONAL_PROFILE_SYSTEM_PROMPT, buildProfileUserContent, parseRelationalProfileJson } from './relationalProfilePrompt'

describe('RELATIONAL_PROFILE_SYSTEM_PROMPT — guardrail', () => {
  it('prohíbe diagnóstico/etiquetas clínicas y pide tendencias', () => {
    expect(RELATIONAL_PROFILE_SYSTEM_PROMPT).toMatch(/PROHIBIDO diagnóstico/i)
    expect(RELATIONAL_PROFILE_SYSTEM_PROMPT).toMatch(/TENDENCIAS, no cajas/i)
    expect(RELATIONAL_PROFILE_SYSTEM_PROMPT).toMatch(/no un veredicto ni un diagnóstico/i)
    expect(RELATIONAL_PROFILE_SYSTEM_PROMPT).toMatch(/SIR está del lado de Aaron/i)
    expect(RELATIONAL_PROFILE_SYSTEM_PROMPT).toMatch(/Palancas legítimas/i)
  })
})

describe('buildProfileUserContent', () => {
  it('incluye persona, memorias y notas de tono', () => {
    const out = buildProfileUserContent({
      personName: 'Diana', relationship: 'romantic', ambito: 'personal',
      memories: ['Le importa la familia', 'Se estresa con la incertidumbre'],
      interactionNotes: ['charla tensa, tono 2/5'],
    })
    expect(out).toContain('Diana')
    expect(out).toContain('la familia')
    expect(out).toContain('charla tensa')
  })
  it('sin contexto → marca confianza baja', () => {
    const out = buildProfileUserContent({ personName: 'X', memories: [], interactionNotes: [] })
    expect(out).toMatch(/poco contexto/i)
  })
})

describe('parseRelationalProfileJson', () => {
  const full = JSON.stringify({
    attachment: { style: 'ansioso', note: 'busca cercanía, se activa con el silencio' },
    personality: ['tiende a alta responsabilidad', 'reservada al principio'],
    values: ['la familia', 'la lealtad'],
    communication: 'directa pero se repliega en el conflicto',
    energy: 'la drena la crítica pública',
    howToRelate: 'Dale previsibilidad y reconocé su esfuerzo antes de pedirle algo.',
    strategicValue: 'abre puertas profesionales y tambien consume energia emocional',
    risk: 'si Aaron insiste en mal momento puede quemar confianza',
    reciprocity: 'Aaron suele dar mas seguimiento del que recibe',
    legitimateLevers: ['resultados reales', 'timing de cierre de mes'],
    nextMove: 'pedir una reunion corta con un objetivo claro',
    horizon: ['7 días: medir respuesta', '30 días: pedir definicion', '6 meses: decidir inversion'],
    doNotDo: ['usar inseguridades como palanca'],
    confidence: 'media',
    note: 'Hipótesis para vincularte, no diagnóstico.',
  })
  it('parsea un perfil completo', () => {
    const p = parseRelationalProfileJson(full)
    expect(p?.attachment.style).toBe('ansioso')
    expect(p?.values).toContain('la familia')
    expect(p?.howToRelate).toMatch(/previsibilidad/)
    expect(p?.strategicValue).toMatch(/abre puertas/)
    expect(p?.legitimateLevers).toContain('resultados reales')
    expect(p?.nextMove).toMatch(/reunion corta/)
    expect(p?.doNotDo).toContain('usar inseguridades como palanca')
  })
  it('apego inválido → incierto; confianza inválida → baja', () => {
    const p = parseRelationalProfileJson('{"attachment":{"style":"raro"},"howToRelate":"x","confidence":"altísima"}')
    expect(p?.attachment.style).toBe('incierto')
    expect(p?.confidence).toBe('baja')
  })
  it('note por default si falta', () => {
    const p = parseRelationalProfileJson('{"howToRelate":"algo","personality":[]}')
    expect(p?.note).toMatch(/hipótesis/i)
  })
  it('tolera fences', () => {
    expect(parseRelationalProfileJson('```json\n' + full + '\n```')?.confidence).toBe('media')
  })
  it('null si vacío / no parsea', () => {
    expect(parseRelationalProfileJson('{}')).toBeNull()
    expect(parseRelationalProfileJson('nope')).toBeNull()
  })
})
