import { describe, it, expect } from 'vitest'
import { toOpenAITools, parseOpenAIToolCall, openAIText } from './chatProvider'

describe('toOpenAITools', () => {
  it('mapea input_schema → function.parameters', () => {
    const out = toOpenAITools([{ name: 'x', description: 'd', input_schema: { type: 'object' } }])
    expect(out[0]).toEqual({ type: 'function', function: { name: 'x', description: 'd', parameters: { type: 'object' } } })
  })
})

describe('parseOpenAIToolCall', () => {
  it('extrae name + arguments parseados', () => {
    const msg = { content: null, tool_calls: [{ function: { name: 'proponer_crear_persona', arguments: '{"nombre":"Emilio"}' } }] }
    expect(parseOpenAIToolCall(msg)).toEqual({ name: 'proponer_crear_persona', input: { nombre: 'Emilio' } })
  })
  it('null si no hay tool_calls', () => {
    expect(parseOpenAIToolCall({ content: 'hola' })).toBeNull()
  })
  it('tolera arguments inválido (→ {})', () => {
    const msg = { tool_calls: [{ function: { name: 'x', arguments: 'no-json' } }] }
    expect(parseOpenAIToolCall(msg)).toEqual({ name: 'x', input: {} })
  })
})

describe('openAIText', () => {
  it('devuelve content string trim', () => {
    expect(openAIText({ content: '  hola  ' })).toBe('hola')
    expect(openAIText({ content: null })).toBe('')
  })
})
