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
  })

  it('JSON inválido → null', () => {
    expect(parseDeepScan('no soy json')).toBeNull()
  })
})
