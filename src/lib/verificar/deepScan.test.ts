// SIR V2 — Tests del deep-scan de manipulación (parser + prompt).

import { describe, it, expect } from 'vitest'
import { parseDeepScan, buildDeepScanUserContent, techniquesForPrompt } from './deepScan'

describe('techniquesForPrompt', () => {
  it('incluye el catálogo con ids reales', () => {
    const p = techniquesForPrompt()
    expect(p).toMatch(/straw_man/)
    expect(p).toMatch(/whataboutism/)
    expect(p).toMatch(/Falacia lógica/)
  })
})

describe('buildDeepScanUserContent', () => {
  it('envuelve el mensaje entre delimitadores', () => {
    const c = buildDeepScanUserContent('hola')
    expect(c).toMatch(/<<</)
    expect(c).toMatch(/hola/)
    expect(c).toMatch(/>>>/)
  })
})

describe('parseDeepScan', () => {
  it('parsea findings válidos y descarta ids fuera del catálogo', () => {
    const raw = JSON.stringify({
      summary: 'Intenta convencerte con presión y desvío.',
      findings: [
        { id: 'straw_man', quote: 'nunca dijiste que te importara', why: 'tergiversa tu postura' },
        { id: 'no_existe', quote: 'algo', why: 'invalida' },
        { id: 'whataboutism', quote: '¿y vos qué?', why: 'desvía la crítica' },
      ],
    })
    const r = parseDeepScan(raw)
    expect(r).not.toBeNull()
    expect(r!.summary).toMatch(/presión y desvío/)
    expect(r!.findings.map((f) => f.id)).toEqual(['straw_man', 'whataboutism'])
    expect(r!.findings[0].label).toBeTruthy()
    expect(r!.findings[0].category).toBeTruthy()
  })

  it('descarta findings sin cita', () => {
    const raw = JSON.stringify({ summary: 'x', findings: [{ id: 'doubt', quote: '', why: 'y' }] })
    expect(parseDeepScan(raw)!.findings).toHaveLength(0)
  })

  it('tolera fences y devuelve summary vacío si falta', () => {
    const r = parseDeepScan('```json\n{"findings":[]}\n```')
    expect(r).not.toBeNull()
    expect(r!.findings).toHaveLength(0)
    expect(r!.summary).toBe('')
    expect(r!.balance).toBeUndefined()
  })

  it('parsea el veredicto de aceptación selectiva (balance)', () => {
    const raw = JSON.stringify({
      summary: 'Presiona con culpa pero hay un pedido real.',
      findings: [{ id: 'exaggeration_minimization', quote: 'nunca me ayudás', why: 'exagera' }],
      balance: {
        stance: 'mixed',
        worthWeighing: 'Sí te pidió ayuda concreta y eso es legítimo.',
        holdGround: 'El "nunca" es exageración para hacerte sentir culpable — no es cierto.',
        guidance: 'Atendé el pedido real; no aceptes la culpa inflada.',
      },
    })
    const r = parseDeepScan(raw)
    expect(r!.balance).toBeDefined()
    expect(r!.balance!.stance).toBe('mixed')
    expect(r!.balance!.worthWeighing).toMatch(/ayuda concreta/)
    expect(r!.balance!.holdGround).toMatch(/culpable/)
  })

  it('balance vacío (sin contenido) → undefined; stance inválido → mixed', () => {
    expect(parseDeepScan(JSON.stringify({ findings: [], balance: {} }))!.balance).toBeUndefined()
    const r = parseDeepScan(JSON.stringify({ findings: [], balance: { stance: 'raro', guidance: 'ojo' } }))
    expect(r!.balance!.stance).toBe('mixed')
  })

  it('JSON inválido → null', () => {
    expect(parseDeepScan('no soy json')).toBeNull()
  })
})
