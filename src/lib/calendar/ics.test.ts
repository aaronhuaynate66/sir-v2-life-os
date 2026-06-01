import { describe, it, expect } from 'vitest'
import { unfoldLines, parseIcsDate, parseRRule, expandRecurrence, parseIcs, toLimaDateOnly } from './ics'

// Ventana amplia para los tests de parseo simple.
const WIDE = { fromMs: Date.UTC(2026, 0, 1), toMs: Date.UTC(2027, 0, 1) }

describe('unfoldLines', () => {
  it('une líneas plegadas (continuación con espacio) y normaliza CRLF', () => {
    const raw = 'SUMMARY:Reunión muy\r\n  larga\r\nLOCATION:Oficina'
    expect(unfoldLines(raw)).toEqual(['SUMMARY:Reunión muy larga', 'LOCATION:Oficina'])
  })
})

describe('parseIcsDate', () => {
  it('all-day (VALUE=DATE) → medianoche Lima en UTC (+5h)', () => {
    const r = parseIcsDate('20260601', { VALUE: 'DATE' })
    expect(r).not.toBeNull()
    expect(r!.allDay).toBe(true)
    expect(r!.ms).toBe(Date.UTC(2026, 5, 1, 5, 0, 0))
    expect(toLimaDateOnly(r!.ms)).toBe('2026-06-01')
  })

  it('UTC literal con Z se respeta', () => {
    const r = parseIcsDate('20260601T130000Z')
    expect(r!.allDay).toBe(false)
    expect(r!.ms).toBe(Date.UTC(2026, 5, 1, 13, 0, 0))
  })

  it('hora local/TZID (sin Z) se interpreta Lima UTC-5 → +5h a UTC', () => {
    const r = parseIcsDate('20260601T080000', { TZID: 'America/Lima' })
    // 08:00 Lima == 13:00 UTC
    expect(r!.ms).toBe(Date.UTC(2026, 5, 1, 13, 0, 0))
  })

  it('valor inválido → null', () => {
    expect(parseIcsDate('no-fecha')).toBeNull()
  })
})

describe('parseRRule', () => {
  it('DAILY con COUNT/INTERVAL', () => {
    expect(parseRRule('FREQ=DAILY;INTERVAL=2;COUNT=5')).toMatchObject({ freq: 'DAILY', interval: 2, count: 5 })
  })
  it('WEEKLY con BYDAY', () => {
    const r = parseRRule('FREQ=WEEKLY;BYDAY=MO,WE,FR')
    expect(r!.freq).toBe('WEEKLY')
    expect(r!.byDay).toEqual([1, 3, 5])
  })
  it('FREQ no soportada → null', () => {
    expect(parseRRule('FREQ=SECONDLY')).toBeNull()
  })
})

describe('expandRecurrence', () => {
  const day = 86_400_000

  it('DAILY COUNT=3 → 3 ocurrencias', () => {
    const start = Date.UTC(2026, 5, 1, 13)
    const occ = expandRecurrence(start, { freq: 'DAILY', interval: 1, count: 3 }, start, start + 30 * day)
    expect(occ).toEqual([start, start + day, start + 2 * day])
  })

  it('DAILY INTERVAL=2 respeta el paso', () => {
    const start = Date.UTC(2026, 5, 1, 13)
    const occ = expandRecurrence(start, { freq: 'DAILY', interval: 2, count: 3 }, start, start + 30 * day)
    expect(occ).toEqual([start, start + 2 * day, start + 4 * day])
  })

  it('filtra por la ventana [from, to]', () => {
    const start = Date.UTC(2026, 5, 1, 13)
    const from = start + 5 * day
    const occ = expandRecurrence(start, { freq: 'DAILY', interval: 1, count: 100 }, from, from + 2 * day)
    expect(occ).toEqual([start + 5 * day, start + 6 * day, start + 7 * day])
  })

  it('UNTIL corta la serie', () => {
    const start = Date.UTC(2026, 5, 1, 13)
    const untilMs = start + 3 * day
    const occ = expandRecurrence(start, { freq: 'DAILY', interval: 1, untilMs }, start, start + 30 * day)
    expect(occ).toEqual([start, start + day, start + 2 * day, start + 3 * day])
  })

  it('WEEKLY BYDAY expande los días indicados', () => {
    // 2026-06-01 es lunes. BYDAY=MO,WE → lunes y miércoles.
    const start = Date.UTC(2026, 5, 1, 13) // lunes
    const occ = expandRecurrence(start, { freq: 'WEEKLY', interval: 1, count: 4, byDay: [1, 3] }, start, start + 30 * day)
    expect(occ).toEqual([
      start, // lun 01
      start + 2 * day, // mié 03
      start + 7 * day, // lun 08
      start + 9 * day, // mié 10
    ])
  })

  it('MONTHLY mantiene el día del mes', () => {
    const start = Date.UTC(2026, 0, 15, 13) // 15 ene
    const occ = expandRecurrence(start, { freq: 'MONTHLY', interval: 1, count: 3 }, start, Date.UTC(2027, 0, 1))
    expect(occ.map((m) => new Date(m).getUTCMonth())).toEqual([0, 1, 2])
    expect(occ.every((m) => new Date(m).getUTCDate() === 15)).toBe(true)
  })
})

describe('parseIcs (integración)', () => {
  const ICS = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'UID:simple-1',
    'SUMMARY:Reunión de equipo',
    'LOCATION:Sala 2',
    'DTSTART:20260615T140000Z',
    'DTEND:20260615T150000Z',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:daily-1',
    'SUMMARY:Standup',
    'DTSTART;TZID=America/Lima:20260601T090000',
    'DTEND;TZID=America/Lima:20260601T091500',
    'RRULE:FREQ=DAILY;COUNT=3',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:allday-1',
    'SUMMARY:Feriado',
    'DTSTART;VALUE=DATE:20260628',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')

  it('parsea evento simple, recurrente expandido y all-day, ordenado por inicio', () => {
    const events = parseIcs(ICS, WIDE)
    // 3 del standup + 1 simple + 1 all-day = 5
    expect(events).toHaveLength(5)
    expect(events.every((e, i) => i === 0 || events[i - 1].start <= e.start)).toBe(true)

    const standups = events.filter((e) => e.uid === 'daily-1')
    expect(standups).toHaveLength(3)
    expect(standups[0].recurring).toBe(true)
    // 09:00 Lima → 14:00 UTC
    expect(standups[0].start).toBe('2026-06-01T14:00:00.000Z')
    // ids únicos por ocurrencia
    expect(new Set(standups.map((e) => e.id)).size).toBe(3)

    const allday = events.find((e) => e.uid === 'allday-1')!
    expect(allday.allDay).toBe(true)
    expect(allday.start).toBe('2026-06-28')

    const simple = events.find((e) => e.uid === 'simple-1')!
    expect(simple.recurring).toBe(false)
    expect(simple.location).toBe('Sala 2')
    expect(simple.end).toBe('2026-06-15T15:00:00.000Z')
  })

  it('respeta la ventana: nada fuera de [from,to]', () => {
    const events = parseIcs(ICS, { fromMs: Date.UTC(2026, 5, 20), toMs: Date.UTC(2026, 6, 1) })
    // Solo el all-day del 28 jun cae acá; standups (1 jun) y simple (15 jun) quedan fuera.
    expect(events.map((e) => e.uid)).toEqual(['allday-1'])
  })

  it('limita la cantidad', () => {
    const events = parseIcs(ICS, { ...WIDE, limit: 2 })
    expect(events).toHaveLength(2)
  })
})
