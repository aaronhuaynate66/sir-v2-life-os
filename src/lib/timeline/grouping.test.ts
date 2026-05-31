// SIR V2 — Tests de groupByCapture.
//
// Agrupa events que comparten captureId; deja pasar los standalone y los
// grupos de 1; reordena DESC por occurredAt; aplica orden curado de báscula.

import { describe, it, expect } from 'vitest'

import type { TimelineEvent } from './types'
import { groupByCapture } from './grouping'

const ev = (over: Partial<TimelineEvent> & { id: string }): TimelineEvent => ({
  type: 'health',
  occurredAt: '2026-05-30T12:00:00.000Z',
  title: 'Evento',
  tags: [],
  meta: {},
  ...over,
})

describe('groupByCapture', () => {
  it('events sin captureId pasan tal cual', () => {
    const a = ev({ id: 'memory:1', type: 'memory', occurredAt: '2026-05-30T10:00:00.000Z' })
    const b = ev({ id: 'sleep:1', type: 'sleep', occurredAt: '2026-05-29T10:00:00.000Z' })
    const out = groupByCapture([a, b])
    expect(out).toHaveLength(2)
    expect(out.every((e) => !e.groupedItems)).toBe(true)
  })

  it('un solo event con captureId NO se agrupa (grupo de 1)', () => {
    const a = ev({ id: 'health:1', captureId: 'cap1', captureKind: 'scale' })
    const out = groupByCapture([a])
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('health:1')
    expect(out[0].groupedItems).toBeUndefined()
  })

  it('2+ events con mismo captureId se fusionan en un grouped event', () => {
    const a = ev({
      id: 'health:weight',
      captureId: 'cap1',
      captureKind: 'scale',
      title: 'Peso: 80 kg',
      meta: { metricType: 'weight', confidence: 'high' },
    })
    const b = ev({
      id: 'health:bmi',
      captureId: 'cap1',
      captureKind: 'scale',
      title: 'IMC: 25',
      meta: { metricType: 'bmi' },
    })
    const out = groupByCapture([a, b])
    expect(out).toHaveLength(1)
    const g = out[0]
    expect(g.id).toBe('capture:cap1')
    expect(g.groupedItems).toHaveLength(2)
    expect(g.tags).toEqual(['2 métricas'])
    // body se deriva de captureKind + confidence
    expect(g.body).toBe('Báscula · conf. high')
  })

  it('orden de báscula: Peso antes que IMC sin importar el orden de entrada', () => {
    const bmi = ev({
      id: 'health:bmi',
      captureId: 'cap1',
      captureKind: 'scale',
      title: 'IMC: 25',
      meta: { metricType: 'bmi' },
    })
    const weight = ev({
      id: 'health:weight',
      captureId: 'cap1',
      captureKind: 'scale',
      title: 'Peso: 80 kg',
      meta: { metricType: 'weight' },
    })
    const out = groupByCapture([bmi, weight])
    const items = out[0].groupedItems!
    expect(items[0].label).toBe('Peso')
    expect(items[0].display).toBe('80 kg')
    expect(items[1].label).toBe('IMC')
    expect(items[1].display).toBe('25')
  })

  it('mantiene orden global DESC por occurredAt tras agrupar', () => {
    const old1 = ev({ id: 'health:a', captureId: 'cap1', captureKind: 'scale', occurredAt: '2026-01-01T00:00:00.000Z', meta: { metricType: 'weight' } })
    const old2 = ev({ id: 'health:b', captureId: 'cap1', captureKind: 'scale', occurredAt: '2026-01-01T00:00:00.000Z', meta: { metricType: 'bmi' } })
    const recent = ev({ id: 'memory:z', type: 'memory', occurredAt: '2026-05-30T00:00:00.000Z' })
    const out = groupByCapture([old1, old2, recent])
    expect(out[0].id).toBe('memory:z') // más reciente primero
    expect(out[1].id).toBe('capture:cap1')
  })

  it('captura no-báscula (whatsapp) conserva orden por timestamp, body "WhatsApp"', () => {
    const m1 = ev({ id: 'r:1', type: 'relational_event', captureId: 'wa1', captureKind: 'whatsapp', occurredAt: '2026-05-30T10:00:00.000Z', title: 'Diana: hola' })
    const m2 = ev({ id: 'r:2', type: 'relational_event', captureId: 'wa1', captureKind: 'whatsapp', occurredAt: '2026-05-30T11:00:00.000Z', title: 'Diana: chau' })
    const out = groupByCapture([m1, m2])
    expect(out).toHaveLength(1)
    expect(out[0].body).toBe('WhatsApp')
    expect(out[0].groupedItems).toHaveLength(2)
  })
})
