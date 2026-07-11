// SIR V2 — Tests de la Sala de ensayo (16·M4).

import { describe, it, expect } from 'vitest'
import { REHEARSE_SYSTEM_PROMPT, buildRehearseUserContent, parseRehearseJson } from './rehearsePrompt'

describe('REHEARSE_SYSTEM_PROMPT — reglas núcleo', () => {
  it('deja claro que ensaya, NO predice', () => {
    expect(REHEARSE_SYSTEM_PROMPT).toMatch(/NO predec[ií]s/i)
    expect(REHEARSE_SYSTEM_PROMPT).toMatch(/sorprende/i)
  })
  it('trae el guardrail ético + el registro por vínculo', () => {
    expect(REHEARSE_SYSTEM_PROMPT).toMatch(/ethicalNote/)
    expect(REHEARSE_SYSTEM_PROMPT).toMatch(/afectiv/i)
    expect(REHEARSE_SYSTEM_PROMPT).toMatch(/estratégic/i)
  })
  it('prohíbe probabilidades numéricas', () => {
    expect(REHEARSE_SYSTEM_PROMPT).toMatch(/No des probabilidades numéricas/i)
  })
  it('cablea el norte del año sin forzar conexión', () => {
    expect(REHEARSE_SYSTEM_PROMPT).toMatch(/EL NORTE DE AARON/)
    expect(REHEARSE_SYSTEM_PROMPT).toMatch(/NO fuerces la\s+conexión/i)
  })
})

describe('buildRehearseUserContent', () => {
  it('incluye persona, objetivo y el tipo de vínculo', () => {
    const out = buildRehearseUserContent(
      { personName: 'Alex Heilbrunn', role: 'Dirección Ejecutiva', ambito: 'colega', relationship: 'professional', memories: ['Valora resultados medibles'] },
      'Que me dé un aumento',
    )
    expect(out).toContain('Alex Heilbrunn')
    expect(out).toContain('Que me dé un aumento')
    expect(out).toContain('profesional interno')
    expect(out).toContain('resultados medibles')
  })
  it('vínculo afectivo → marca registro de cuidado', () => {
    const out = buildRehearseUserContent({ personName: 'Diana', ambito: 'personal', memories: [] }, 'hablar de algo')
    expect(out).toMatch(/estrategia de cuidado/i)
  })
  it('sin ámbito pero relación afectiva → registro de cuidado', () => {
    const out = buildRehearseUserContent({ personName: 'Mamá', relationship: 'family', memories: [] }, 'x')
    expect(out).toMatch(/estrategia de cuidado/i)
  })
  it('sin memorias → pide bajar especificidad', () => {
    const out = buildRehearseUserContent({ personName: 'X', memories: [] }, 'x')
    expect(out).toMatch(/poco contexto/i)
  })
  it('incluye el norte del año cuando está presente (título + subtítulo + próximo paso)', () => {
    const out = buildRehearseUserContent(
      {
        personName: 'Alex', ambito: 'colega', memories: [],
        norte: { title: 'Ganar el Mundial de Bomberos', subtitle: 'Medalla de oro en Taekwondo, +80 kg', nextAction: 'Subir a categoría' },
      },
      'Que me dé un aumento',
    )
    expect(out).toContain('EL NORTE DE AARON')
    expect(out).toContain('Ganar el Mundial de Bomberos')
    expect(out).toContain('Medalla de oro en Taekwondo')
    expect(out).toContain('Subir a categoría')
  })
  it('sin norte → no mete el bloque de brújula', () => {
    const out = buildRehearseUserContent({ personName: 'Alex', memories: [] }, 'x')
    expect(out).not.toContain('EL NORTE DE AARON')
  })
})

describe('parseRehearseJson', () => {
  const full = JSON.stringify({
    read: 'Alex valora impacto.',
    scenarios: [
      { title: 'Por valor', path: 'Abrís con resultados.', likelihood: 'plausible' },
      { title: 'Directo', path: 'Pedís de una.', likelihood: 'dificil' },
    ],
    objections: [{ objection: 'No hay presupuesto', response: 'Proponé ligarlo a metas.' }],
    actions: ['Documentar tus logros del año'],
    opener: 'Quería revisar mi impacto.',
    watchout: 'Es un ensayo, no una predicción.',
    ethicalNote: '',
  })
  it('parsea una respuesta completa', () => {
    const r = parseRehearseJson(full)
    expect(r?.scenarios).toHaveLength(2)
    expect(r?.objections[0].objection).toContain('presupuesto')
    expect(r?.actions[0]).toContain('logros')
  })
  it('normaliza likelihood inválido a plausible', () => {
    const r = parseRehearseJson('{"scenarios":[{"title":"a","path":"b","likelihood":"99%"}]}')
    expect(r?.scenarios[0].likelihood).toBe('plausible')
  })
  it('tolera fences', () => {
    const r = parseRehearseJson('```json\n' + full + '\n```')
    expect(r?.read).toContain('impacto')
  })
  it('conserva ethicalNote cuando rechaza (sin escenarios)', () => {
    const r = parseRehearseJson('{"scenarios":[],"actions":[],"ethicalNote":"Eso sería explotar su miedo; no."}')
    expect(r?.ethicalNote).toContain('explotar')
  })
  it('null si no hay escenarios, acciones ni nota', () => {
    expect(parseRehearseJson('{"read":"x"}')).toBeNull()
  })
  it('null si no parsea', () => {
    expect(parseRehearseJson('nope')).toBeNull()
  })
})
