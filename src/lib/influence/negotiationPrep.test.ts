// SIR V2 — Tests de la preparación de negociación (playbook de influencia #05).

import { describe, it, expect } from 'vitest'
import { NEGOTIATION_SYSTEM_PROMPT, buildNegotiationUserContent, parseNegotiationJson } from './negotiationPrep'

describe('NEGOTIATION_SYSTEM_PROMPT', () => {
  it('trae el marco de Harvard (BATNA/ZOPA)', () => {
    expect(NEGOTIATION_SYSTEM_PROMPT).toMatch(/BATNA/)
    expect(NEGOTIATION_SYSTEM_PROMPT).toMatch(/ZOPA/)
  })
  it('permite presión pero corta la coacción/escasez fabricada', () => {
    expect(NEGOTIATION_SYSTEM_PROMPT).toMatch(/Presión.*SÍ/i)
    expect(NEGOTIATION_SYSTEM_PROMPT).toMatch(/Coacción.*NO/i)
    expect(NEGOTIATION_SYSTEM_PROMPT).toMatch(/PROHIBIDO inventar/i)
  })
})

describe('buildNegotiationUserContent', () => {
  it('incluye persona, qué se negocia y el objetivo', () => {
    const out = buildNegotiationUserContent({
      personName: 'Dayana', organization: 'OpenMed', relationship: 'professional',
      subject: 'que me pase el contacto de un proveedor', goal: 'conseguir el contacto',
      memories: ['Le diste SEO y fulfillment'], conversation: 'Dayana: claro te ayudo',
    })
    expect(out).toContain('Dayana')
    expect(out).toContain('proveedor')
    expect(out).toContain('conseguir el contacto')
    expect(out).toContain('profesional')
  })
  it('sin alternativa → pide construir el BATNA, no inventarlo', () => {
    const out = buildNegotiationUserContent({ personName: 'X', subject: 'sueldo', memories: [] })
    expect(out).toMatch(/construir el BATNA/i)
  })
  it('con alternativa → la pasa como insumo del BATNA', () => {
    const out = buildNegotiationUserContent({ personName: 'X', subject: 'sueldo', alternative: 'tengo otra oferta de 6k', memories: [] })
    expect(out).toContain('otra oferta de 6k')
  })
  it('sin conversación → pide no citar ni inventar cifras', () => {
    const out = buildNegotiationUserContent({ personName: 'X', subject: 'sueldo', memories: [] })
    expect(out).toMatch(/no cites frases ni inventes/i)
  })
})

describe('parseNegotiationJson', () => {
  const full = JSON.stringify({
    read: 'Dayana valora la relación y tiene la red.',
    yourBatna: 'Buscar el proveedor por tu cuenta en el gremio.',
    theirLikely: 'Le cuesta poco darte el contacto.',
    zopa: 'Alta: el favor es barato para ella y tú ya le diste valor.',
    signals: [
      { signal: 'Responde a favores devueltos', evidence: 'ya sabes que para lo tuyo estoy' },
      { signal: 'Agenda caótica', evidence: '' },
    ],
    anchor: 'Pide directo el contacto puntual, no una reunión.',
    moves: ['Reciprocidad: recordar lo que le diste', 'Hacerlo fácil: solo el número'],
    walkAway: 'Si te da largas 2 veces, ve por tu BATNA.',
    watchout: 'Es estimación; presión sí, coacción no.',
    ethicalNote: '',
  })
  it('parsea una preparación completa', () => {
    const r = parseNegotiationJson(full)
    expect(r?.yourBatna).toContain('gremio')
    expect(r?.zopa).toContain('Alta')
    expect(r?.signals).toHaveLength(2)
    expect(r?.signals[0].evidence).toBe('ya sabes que para lo tuyo estoy')
    expect(r?.signals[1].evidence).toBe('')
    expect(r?.moves).toHaveLength(2)
  })
  it('tolera fences', () => {
    expect(parseNegotiationJson('```json\n' + full + '\n```')?.read).toContain('Dayana')
  })
  it('conserva ethicalNote cuando rechaza (sin batna/zopa/moves)', () => {
    const r = parseNegotiationJson('{"moves":[],"ethicalNote":"Eso sería coaccionarla; no."}')
    expect(r?.ethicalNote).toContain('coaccionar')
  })
  it('null si no hay sustancia ni nota', () => {
    expect(parseNegotiationJson('{"read":"x"}')).toBeNull()
  })
  it('null si no parsea', () => {
    expect(parseNegotiationJson('nope')).toBeNull()
  })
})
