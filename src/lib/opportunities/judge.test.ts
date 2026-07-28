import { describe, it, expect } from 'vitest'
import { parseJudgeVerdict, buildJudgePrompt, renderConfirmed } from './judge'
import type { OpportunitySignal } from './detect'

const señal = (o: Partial<OpportunitySignal> = {}): OpportunitySignal => ({
  kind: 'oportunidad_sin_registrar',
  personId: 'p1', personName: 'Miluska Castillo',
  quote: 'me cotizas unos servicios digitales?', quoteAt: '2026-07-25T10:00:00Z',
  matched: ['me cotizas'], daysSinceQuote: 3, daysSinceLast: 3,
  confidence: 'alta', text: 'x', ...o,
})

describe('parseJudgeVerdict', () => {
  it('sí bien formado', () => {
    expect(parseJudgeVerdict('{"isReal":true,"what":"cotización de servicios digitales"}'))
      .toEqual({ isReal: true, what: 'cotización de servicios digitales', why: null })
  })

  it('tolera el fence de markdown', () => {
    expect(parseJudgeVerdict('```json\n{"isReal":true,"what":"una web"}\n```').isReal).toBe(true)
  })

  it('no descarta con la razón', () => {
    const v = parseJudgeVerdict('{"isReal":false,"why":"habla de su propio contrato"}')
    expect(v.isReal).toBe(false)
    expect(v.why).toContain('propio contrato')
  })

  // Sesgo a descartar: en el brief, un falso positivo cuesta más que un falso
  // negativo — entrena a Aaron a ignorar la señal.
  it('un sí SIN decir qué piden no sirve → descarta', () => {
    const v = parseJudgeVerdict('{"isReal":true}')
    expect(v.isReal).toBe(false)
    expect(v.why).toMatch(/no dijo qué/i)
  })

  it('basura, vacío y JSON roto → descarta, no explota', () => {
    for (const raw of ['', '   ', 'creo que sí', '{isReal: true', '{"isReal":"true"}', 'null']) {
      expect(parseJudgeVerdict(raw).isReal, raw).toBe(false)
    }
  })

  it('recorta campos largos', () => {
    const v = parseJudgeVerdict(JSON.stringify({ isReal: true, what: 'x'.repeat(300) }))
    expect(v.what!.length).toBe(80)
  })
})

describe('buildJudgePrompt', () => {
  it('incluye la cita, las palabras que marcaron y el contexto', () => {
    const p = buildJudgePrompt(señal(), ['Aaron: hola', 'Miluska: necesito algo'])
    expect(p).toContain('Miluska Castillo')
    expect(p).toContain('me cotizas unos servicios digitales')
    expect(p).toContain('me cotizas')
    expect(p).toContain('necesito algo')
  })

  it('funciona sin contexto', () => {
    expect(buildJudgePrompt(señal(), [])).not.toContain('ÚLTIMOS MENSAJES')
  })

  it('acota el contexto a los últimos 6 mensajes', () => {
    const p = buildJudgePrompt(señal(), Array.from({ length: 20 }, (_, i) => `linea${i}`))
    expect(p).toContain('linea19')
    expect(p).not.toContain('linea13')
  })
})

describe('renderConfirmed', () => {
  it('oportunidad: dice QUÉ piden y ofrece registrarla', () => {
    const c = renderConfirmed(señal(), 'una cotización de servicios digitales')
    expect(c.text).toContain('te pidió una cotización de servicios digitales')
    expect(c.text).toMatch(/¿La registro\?/)
    // La cita y la fecha van SIEMPRE: el dato es verificable, no un veredicto.
    expect(c.text).toContain('me cotizas unos servicios digitales')
    expect(c.text).toContain('2026-07-25')
  })

  it('enfriamiento: nombra el silencio, no ofrece registrar', () => {
    const c = renderConfirmed(señal({ kind: 'enfriamiento', daysSinceLast: 30 }), 'una propuesta de web')
    expect(c.text).toMatch(/se está enfriando/i)
    expect(c.text).toContain('30 días')
    expect(c.text).not.toMatch(/¿La registro\?/)
  })
})
