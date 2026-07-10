// SIR V2 — Tests de la capa pura del premortem estructurado (14·M2).

import { describe, it, expect } from 'vitest'
import { buildPremortemUserPrompt, parsePremortem, PREMORTEM_SYSTEM } from './premortemPrompt'

describe('buildPremortemUserPrompt', () => {
  it('incluye título y contexto', () => {
    const u = buildPremortemUserPrompt({ title: 'Aceptar el proyecto X', description: 'paga bien pero me drena' })
    expect(u).toContain('Aceptar el proyecto X')
    expect(u).toContain('paga bien pero me drena')
    expect(u).toContain('premortem')
  })
  it('sin título usa placeholder y omite la línea de contexto vacío', () => {
    const u = buildPremortemUserPrompt({ title: '   ', description: '' })
    expect(u).toContain('(sin título)')
    expect(u).not.toContain('Contexto:')
  })
  it('el system nombra el método y pide JSON', () => {
    expect(PREMORTEM_SYSTEM).toMatch(/premortem/i)
    expect(PREMORTEM_SYSTEM).toContain('JSON')
  })
})

describe('parsePremortem', () => {
  const ok = {
    frame: 'Es enero y el proyecto explotó.',
    failureModes: [
      { cause: 'Subestimé el tiempo', likelihood: 'alta', earlySignal: 'Primer sprint atrasado', mitigation: 'Buffer del 30%' },
      { cause: 'Se drenó mi energía', likelihood: 'media', earlySignal: 'Duermo peor la semana 2', mitigation: 'Cortar los findes' },
    ],
  }

  it('parsea una salida válida', () => {
    const r = parsePremortem(ok)
    expect(r).not.toBeNull()
    expect(r!.frame).toContain('explotó')
    expect(r!.failureModes).toHaveLength(2)
    expect(r!.failureModes[0].likelihood).toBe('alta')
  })

  it('ordena por probabilidad (alta → baja), estable', () => {
    const r = parsePremortem({
      failureModes: [
        { cause: 'a', likelihood: 'baja', earlySignal: 's', mitigation: 'm' },
        { cause: 'b', likelihood: 'alta', earlySignal: 's', mitigation: 'm' },
        { cause: 'c', likelihood: 'media', earlySignal: 's', mitigation: 'm' },
      ],
    })
    expect(r!.failureModes.map((m) => m.cause)).toEqual(['b', 'c', 'a'])
  })

  it('descarta modos sin causa, señal o mitigación', () => {
    const r = parsePremortem({
      failureModes: [
        { cause: 'ok', likelihood: 'alta', earlySignal: 's', mitigation: 'm' },
        { cause: '', likelihood: 'alta', earlySignal: 's', mitigation: 'm' },
        { cause: 'x', likelihood: 'alta', earlySignal: '', mitigation: 'm' },
        { cause: 'y', likelihood: 'alta', earlySignal: 's', mitigation: '' },
      ],
    })
    expect(r!.failureModes).toHaveLength(1)
    expect(r!.failureModes[0].cause).toBe('ok')
  })

  it('likelihood inválida cae a "media"', () => {
    const r = parsePremortem({ failureModes: [{ cause: 'a', likelihood: 'seguro', earlySignal: 's', mitigation: 'm' }] })
    expect(r!.failureModes[0].likelihood).toBe('media')
  })

  it('recorta a 5 modos', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ cause: `c${i}`, likelihood: 'media', earlySignal: 's', mitigation: 'm' }))
    const r = parsePremortem({ failureModes: many })
    expect(r!.failureModes).toHaveLength(5)
  })

  it('frame vacío → default honesto', () => {
    const r = parsePremortem({ failureModes: [{ cause: 'a', likelihood: 'alta', earlySignal: 's', mitigation: 'm' }] })
    expect(r!.frame.length).toBeGreaterThan(0)
  })

  it('sin modos utilizables → null', () => {
    expect(parsePremortem({ frame: 'x', failureModes: [] })).toBeNull()
    expect(parsePremortem({ failureModes: [{ cause: '', earlySignal: '', mitigation: '' }] })).toBeNull()
  })

  it('entradas no-objeto → null', () => {
    expect(parsePremortem(null)).toBeNull()
    expect(parsePremortem('nope')).toBeNull()
    expect(parsePremortem(42)).toBeNull()
  })
})
