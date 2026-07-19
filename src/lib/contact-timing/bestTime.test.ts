import { describe, it, expect } from 'vitest'
import { analyzeContactRhythm, type ChatEvent } from './bestTime'

// NOW = 2026-07-19T02:00:00Z → hora local Lima (UTC-5) = 21:00.
const NOW = Date.parse('2026-07-19T02:00:00Z')
// Mensaje a `daysAgo` días, a la `utcHour` UTC (local = utcHour-5).
function msg(daysAgo: number, utcHour: number, fromUser = false): ChatEvent {
  const d = new Date(Date.UTC(2026, 6, 19 - daysAgo, utcHour, 0, 0))
  return { fromUser, at: d.toISOString() }
}
// Genera n mensajes suyos repartidos en días distintos a esa hora UTC.
function theirsAt(utcHour: number, n: number, startDaysAgo = 3): ChatEvent[] {
  return Array.from({ length: n }, (_, i) => msg(startDaysAgo + i, utcHour))
}

describe('analyzeContactRhythm — historial insuficiente', () => {
  it('pocos mensajes suyos y sin actividad fresca → unknown (no inventa)', () => {
    const r = analyzeContactRhythm(theirsAt(1, 3, 10), NOW)
    expect(r.level).toBe('unknown')
    expect(r.reason).toBe('')
  })
  it('burst reciente aunque haya poco historial → now', () => {
    const events = [
      ...theirsAt(1, 2, 10),
      { fromUser: true, at: new Date(NOW - 40 * 60_000).toISOString() },
      { fromUser: false, at: new Date(NOW - 20 * 60_000).toISOString() },
    ]
    const r = analyzeContactRhythm(events, NOW)
    expect(r.level).toBe('now')
    expect(r.inBurst).toBe(true)
  })
})

describe('analyzeContactRhythm — recencia (el driver más fuerte)', () => {
  it('escribió hace <1h → now', () => {
    const events = [...theirsAt(2, 15, 5), { fromUser: false, at: new Date(NOW - 30 * 60_000).toISOString() }]
    const r = analyzeContactRhythm(events, NOW)
    expect(r.level).toBe('now')
    expect(r.recencyHours).toBeLessThan(1)
  })
})

describe('analyzeContactRhythm — ritmo circadiano por-persona', () => {
  // Activa de noche: 8 msgs a local 20 (UTC01) + 8 a local 21 (UTC02) = 16.
  const nightPerson = [...theirsAt(1, 8, 4), ...theirsAt(2, 8, 12)]

  it('detecta la ventana activa nocturna', () => {
    const r = analyzeContactRhythm(nightPerson, NOW)
    // La ventana debe cubrir la hora local 20 o 21.
    const covers = r.activeWindows.some((w) => (w.startHour <= 20 && w.endHour >= 20) || (w.startHour <= 21 && w.endHour >= 21))
    expect(covers).toBe(true)
    expect(r.sampleSize).toBeGreaterThanOrEqual(8)
  })

  it('AHORA (21h local) cae en su ventana → good', () => {
    // Recencia vieja para aislar el efecto "hora activa".
    const r = analyzeContactRhythm(nightPerson, NOW)
    expect(['good', 'now']).toContain(r.level)
  })

  it('fuera de su hora pico + sin recencia → low, con próxima ventana', () => {
    // NOW2 = local 09:00 (UTC 14:00), lejos de su ventana nocturna.
    const NOW2 = Date.parse('2026-07-19T14:00:00Z')
    const r = analyzeContactRhythm(nightPerson, NOW2)
    expect(r.level).toBe('low')
    expect(r.nextWindowText).toBeTruthy()
  })
})

describe('analyzeContactRhythm — la matemática corre sobre actividad de IG (no solo WhatsApp)', () => {
  it('eventos de actividad IG (fromUser:false) producen un ritmo igual que los de chat', () => {
    // Simula 16 capturas de story a local 20–21 (UTC 01–02) — como si fueran de IG.
    const igActivity = [...theirsAt(1, 8, 4), ...theirsAt(2, 8, 12)]
    const r = analyzeContactRhythm(igActivity, NOW)
    expect(r.sampleSize).toBeGreaterThanOrEqual(8)
    expect(['good', 'now', 'ok']).toContain(r.level) // NOW=21h local cae en su ventana
    expect(r.activeWindows.length).toBeGreaterThan(0)
  })
})
