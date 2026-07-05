// SIR V2 — Tests del adapter SleepRecord → TimelineEvent (foco: dreams).

import { describe, it, expect } from 'vitest'
import { adaptSleep } from './sleep'
import type { SleepRecord } from '@/types'

function rec(over: Partial<SleepRecord>): SleepRecord {
  return { id: 's1', date: '2026-07-05', bedtime: '23:00', wakeTime: '07:00', duration: 7.5, quality: 8, ...over }
}

describe('adaptSleep', () => {
  it('el sueño capturado (dreams) llega al body del evento — el read path rescatado', () => {
    const e = adaptSleep(rec({ dreams: 'Soñé que ganaba el mundial de bomberos' }))
    expect(e.type).toBe('sleep')
    expect(e.body).toBe('Soñé que ganaba el mundial de bomberos')
    expect(e.title).toMatch(/Sueño 7.50h · calidad 8\/10/)
  })

  it('sin dreams cae a notes; sin ninguno queda undefined', () => {
    expect(adaptSleep(rec({ notes: 'nota' })).body).toBe('nota')
    expect(adaptSleep(rec({})).body).toBeUndefined()
  })

  it('dreams tiene prioridad sobre notes', () => {
    expect(adaptSleep(rec({ dreams: 'sueño', notes: 'nota' })).body).toBe('sueño')
  })
})
