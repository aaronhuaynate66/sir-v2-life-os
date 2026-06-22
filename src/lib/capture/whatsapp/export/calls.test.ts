import { describe, it, expect } from 'vitest'
import { extractCalls, callLabel } from './calls'

describe('extractCalls', () => {
  it('detecta voz, video y perdidas con fecha/hora', () => {
    const text = [
      '[15/06/24, 20:30:00] Diana: ‎Llamada de voz',
      '[16/06/24, 9:05:00] Yo: Videollamada',
      '[16/06/24, 9:10:00] Diana: ‎Llamada de voz perdida',
      '[16/06/24, 10:00:00] Diana: hola, todo bien?', // no es llamada
    ].join('\n')
    const calls = extractCalls(text)
    expect(calls.length).toBe(3)
    expect(calls[0]).toMatchObject({ type: 'voice', missed: false, time: '20:30' })
    expect(calls[1]).toMatchObject({ type: 'video', missed: false })
    expect(calls[2]).toMatchObject({ type: 'voice', missed: true })
  })
  it('no confunde texto que menciona "llamada"', () => {
    const text = '[16/06/24, 10:00:00] Diana: te hago una llamada más tarde'
    expect(extractCalls(text).length).toBe(0)
  })
  it('captura duración si aparece', () => {
    const text = '[16/06/24, 21:00:00] Yo: Llamada de voz, 12 min'
    const calls = extractCalls(text)
    expect(calls[0].duration).toBe('12 min')
    expect(callLabel(calls[0])).toContain('12 min')
  })
  it('sinceISO filtra las viejas', () => {
    const text = [
      '[01/01/24, 20:30:00] Diana: Llamada de voz',
      '[20/06/24, 20:30:00] Diana: Llamada de voz',
    ].join('\n')
    const calls = extractCalls(text, '2024-06-01T00:00:00.000Z')
    expect(calls.length).toBe(1)
  })
})
