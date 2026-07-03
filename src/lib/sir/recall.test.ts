// SIR V2 — Tests de la capa pura de recall cross-session (C3).

import { describe, it, expect } from 'vitest'
import { shouldPersistExchange, agoLabel, daysBetween, renderRecallBlock, type RecallHit } from './recall'

describe('shouldPersistExchange', () => {
  it('guarda un intercambio sustancial', () => {
    expect(shouldPersistExchange('¿Cómo voy con la mudanza?', 'Vas bien: el acuerdo con Marita ya está firmado y Logan aprobado.')).toBe(true)
  })
  it('descarta pregunta trivial', () => {
    expect(shouldPersistExchange('hola', 'Una respuesta larga y sustanciosa sobre lo que sea que importe.')).toBe(false)
  })
  it('descarta respuesta muy corta', () => {
    expect(shouldPersistExchange('¿Cómo voy con la mudanza?', 'Bien.')).toBe(false)
  })
  it('descarta respuestas de error/negativa de sistema', () => {
    expect(shouldPersistExchange('¿Qué sabés de X?', 'No tengo información sobre esa persona todavía.')).toBe(false)
    expect(shouldPersistExchange('¿Qué sabés de X?', 'No pude generar la respuesta.')).toBe(false)
  })
})

describe('agoLabel', () => {
  it('mapea rangos a etiquetas legibles', () => {
    expect(agoLabel(0)).toBe('hoy')
    expect(agoLabel(1)).toBe('ayer')
    expect(agoLabel(3)).toBe('hace 3 días')
    expect(agoLabel(10)).toBe('la semana pasada')
    expect(agoLabel(21)).toBe('hace 3 semanas')
    expect(agoLabel(45)).toBe('el mes pasado')
    expect(agoLabel(90)).toBe('hace 3 meses')
  })
})

describe('daysBetween', () => {
  it('cuenta días completos', () => {
    expect(daysBetween('2026-07-01T12:00:00Z', '2026-07-04T12:00:00Z')).toBe(3)
  })
  it('0 si no parsea', () => {
    expect(daysBetween(null, '2026-07-04T12:00:00Z')).toBe(0)
    expect(daysBetween('basura', '2026-07-04T12:00:00Z')).toBe(0)
  })
  it('no negativo si el futuro es antes', () => {
    expect(daysBetween('2026-07-10T12:00:00Z', '2026-07-04T12:00:00Z')).toBe(0)
  })
})

describe('renderRecallBlock', () => {
  const now = '2026-07-04T12:00:00Z'
  it('vacío si no hay hits', () => {
    expect(renderRecallBlock([], now)).toBe('')
  })
  it('filtra hits sin pregunta/respuesta', () => {
    const hits: RecallHit[] = [{ question: '  ', answer: 'x', createdAt: now, similarity: 0.9 }]
    expect(renderRecallBlock(hits, now)).toBe('')
  })
  it('renderiza con antigüedad y cita', () => {
    const hits: RecallHit[] = [
      { question: '¿Cómo voy con el aumento?', answer: 'Estás en conversaciones con Alex.', createdAt: '2026-07-01T12:00:00Z', similarity: 0.8 },
    ]
    const out = renderRecallBlock(hits, now)
    expect(out).toContain('CONVERSACIONES ANTERIORES')
    expect(out).toContain('hace 3 días')
    expect(out).toContain('aumento')
  })
  it('recorta a 5 hits', () => {
    const hits: RecallHit[] = Array.from({ length: 8 }, (_, i) => ({
      question: `pregunta número ${i} con largo suficiente`,
      answer: `respuesta número ${i} con largo suficiente`,
      createdAt: now,
      similarity: 0.5,
    }))
    const lines = renderRecallBlock(hits, now).split('\n').filter((l) => l.startsWith('- '))
    expect(lines.length).toBe(5)
  })
})
