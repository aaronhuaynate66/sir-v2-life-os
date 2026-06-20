// SIR V2 — Tests del countdown de "Fechas importantes".
//
// computeSpecialDateCountdown recibe `now` explícito -> determinístico y
// TZ-independiente (usa parseLocalDate + componentes locales). Cubrimos:
// recurring (próximo aniversario este año / el que viene / hoy / feb-29 en
// año no bisiesto), one-time (futuro / pasado), inválidas, orden y frases.

import { describe, it, expect } from 'vitest'

import {
  computeSpecialDateCountdown,
  sortSpecialDates,
  formatCountdownPhrase,
  formatSpecialDate,
  inferAnnualRecurrence,
  isEffectivelyRecurring,
} from './specialDates'

const sd = (over: Partial<SpecialDate>): SpecialDate => ({
  id: over.id ?? 'sd_1',
  label: over.label ?? 'Evento',
  date: over.date ?? '2026-06-14',
  recurring: over.recurring ?? false,
})

describe('computeSpecialDateCountdown — recurring', () => {
  it('aniversario aún por venir este año -> daysUntil positivo, ocurrencia este año', () => {
    const cd = computeSpecialDateCountdown(
      sd({ date: '1990-06-14', recurring: true }),
      new Date(2026, 5, 1), // 1-jun-2026
    )!
    expect(cd.isPast).toBe(false)
    expect(cd.daysUntil).toBe(13)
    expect(cd.occurrence.getFullYear()).toBe(2026)
    expect(cd.occurrence.getMonth()).toBe(5)
    expect(cd.occurrence.getDate()).toBe(14)
  })

  it('aniversario ya pasado este año -> rueda al año siguiente', () => {
    const cd = computeSpecialDateCountdown(
      sd({ date: '1990-06-14', recurring: true }),
      new Date(2026, 5, 20), // 20-jun-2026, ya pasó el 14
    )!
    expect(cd.occurrence.getFullYear()).toBe(2027)
    expect(cd.occurrence.getMonth()).toBe(5)
    expect(cd.occurrence.getDate()).toBe(14)
    expect(cd.daysUntil).toBeGreaterThan(300)
  })

  it('aniversario HOY -> daysUntil 0, nunca isPast', () => {
    const cd = computeSpecialDateCountdown(
      sd({ date: '1990-06-14', recurring: true }),
      new Date(2026, 5, 14),
    )!
    expect(cd.daysUntil).toBe(0)
    expect(cd.isPast).toBe(false)
  })

  it('feb-29 recurring en año NO bisiesto -> ocurrencia cae al 28-feb', () => {
    const cd = computeSpecialDateCountdown(
      sd({ date: '2000-02-29', recurring: true }),
      new Date(2026, 1, 1), // 1-feb-2026 (no bisiesto)
    )!
    expect(cd.occurrence.getMonth()).toBe(1) // febrero
    expect(cd.occurrence.getDate()).toBe(28)
    expect(cd.daysUntil).toBe(27)
  })
})

describe('computeSpecialDateCountdown — one-time', () => {
  it('evento futuro -> daysUntil positivo, isPast false', () => {
    const cd = computeSpecialDateCountdown(
      sd({ date: '2026-06-14', recurring: false }),
      new Date(2026, 5, 4),
    )!
    expect(cd.daysUntil).toBe(10)
    expect(cd.isPast).toBe(false)
  })

  it('evento pasado -> daysUntil negativo, isPast true', () => {
    const cd = computeSpecialDateCountdown(
      sd({ date: '2026-05-01', recurring: false }),
      new Date(2026, 4, 11), // 11-may, el evento fue el 1-may
    )!
    expect(cd.daysUntil).toBe(-10)
    expect(cd.isPast).toBe(true)
  })

  it('fecha inválida -> null', () => {
    expect(
      computeSpecialDateCountdown(sd({ date: '2026-02-30' }), new Date(2026, 0, 1)),
    ).toBeNull()
    expect(
      computeSpecialDateCountdown(sd({ date: 'garbage' }), new Date(2026, 0, 1)),
    ).toBeNull()
  })
})

describe('sortSpecialDates', () => {
  it('separa válidas de inválidas', () => {
    const { valid, invalid } = sortSpecialDates(
      [sd({ id: 'ok', date: '2026-06-14' }), sd({ id: 'bad', date: '2026-13-99' })],
      new Date(2026, 0, 1),
    )
    expect(valid.map((c) => c.sd.id)).toEqual(['ok'])
    expect(invalid.map((s) => s.id)).toEqual(['bad'])
  })

  it('ordena: próximas ascendente, pasadas al final (más reciente primero)', () => {
    const now = new Date(2026, 5, 10) // 10-jun-2026
    const { valid } = sortSpecialDates(
      [
        sd({ id: 'pasada_vieja', date: '2026-05-01', recurring: false }), // hace 40d
        sd({ id: 'proxima_lejana', date: '2026-06-20', recurring: false }), // en 10d
        sd({ id: 'pasada_reciente', date: '2026-06-08', recurring: false }), // hace 2d
        sd({ id: 'proxima_cercana', date: '2026-06-12', recurring: false }), // en 2d
      ],
      now,
    )
    expect(valid.map((c) => c.sd.id)).toEqual([
      'proxima_cercana', // +2
      'proxima_lejana', // +10
      'pasada_reciente', // -2 (más reciente de las pasadas)
      'pasada_vieja', // -40
    ])
  })
})

describe('inferAnnualRecurrence', () => {
  it('etiquetas de evento anual → true (accent/case-insensitive)', () => {
    expect(inferAnnualRecurrence('Aniversario')).toBe(true)
    expect(inferAnnualRecurrence('Aniversario de bodas')).toBe(true)
    expect(inferAnnualRecurrence('Cumpleaños')).toBe(true)
    expect(inferAnnualRecurrence('Día del santo')).toBe(true)
    expect(inferAnnualRecurrence('ANIVERSÁRIO')).toBe(true) // mayúsc + acento
    expect(inferAnnualRecurrence('Natalicio de papá')).toBe(true)
  })
  it('etiquetas de evento único → false', () => {
    expect(inferAnnualRecurrence('Mudanza')).toBe(false)
    expect(inferAnnualRecurrence('Primera cita')).toBe(false)
    expect(inferAnnualRecurrence('Operación')).toBe(false)
    expect(inferAnnualRecurrence('')).toBe(false)
  })
})

describe('isEffectivelyRecurring', () => {
  it('recurring=true explícito gana siempre', () => {
    expect(isEffectivelyRecurring(sd({ label: 'Mudanza', recurring: true }))).toBe(true)
  })
  it('recurring=false pero etiqueta anual → true (self-heal de fila vieja)', () => {
    expect(isEffectivelyRecurring(sd({ label: 'Aniversario', recurring: false }))).toBe(true)
  })
  it('recurring=false + etiqueta única → false', () => {
    expect(isEffectivelyRecurring(sd({ label: 'Mudanza', recurring: false }))).toBe(false)
  })
})

describe('computeSpecialDateCountdown — recurrencia inferida (bug 13-ago)', () => {
  it('Aniversario guardado como one-time (recurring=false) NO se muestra como pasado', () => {
    // Reproduce el bug: "Aniversario" del 13-ago-2024 guardado one-time.
    // Antes: "hace 657 días". Ahora: próxima ocurrencia anual futura.
    const cd = computeSpecialDateCountdown(
      sd({ label: 'Aniversario', date: '2024-08-13', recurring: false }),
      new Date(2026, 5, 2), // 2-jun-2026
    )!
    expect(cd.recurring).toBe(true) // recurrencia efectiva inferida
    expect(cd.isPast).toBe(false)
    expect(cd.occurrence.getFullYear()).toBe(2026)
    expect(cd.occurrence.getMonth()).toBe(7) // agosto
    expect(cd.occurrence.getDate()).toBe(13)
    expect(cd.daysUntil).toBeGreaterThan(0)
    expect(formatCountdownPhrase(cd)).toBe('en 72 días')
  })
  it('formatSpecialDate de un aniversario inferido NO muestra año', () => {
    const cd = computeSpecialDateCountdown(
      sd({ label: 'Aniversario', date: '2024-08-13', recurring: false }),
      new Date(2026, 5, 2),
    )!
    expect(formatSpecialDate(cd)).toBe('13 de agosto')
  })
  it('evento único con etiqueta neutra sigue pudiendo ser pasado', () => {
    const cd = computeSpecialDateCountdown(
      sd({ label: 'Mudanza', date: '2024-08-13', recurring: false }),
      new Date(2026, 5, 2),
    )!
    expect(cd.recurring).toBe(false)
    expect(cd.isPast).toBe(true)
  })
})

describe('formatCountdownPhrase', () => {
  const phrase = (date: string, recurring: boolean, now: Date) =>
    formatCountdownPhrase(computeSpecialDateCountdown(sd({ date, recurring }), now)!)

  it('hoy -> "¡Hoy!"', () => {
    expect(phrase('2026-06-14', false, new Date(2026, 5, 14))).toBe('¡Hoy!')
  })

  it('futuro -> "en N día(s)" con plural correcto', () => {
    expect(phrase('2026-06-15', false, new Date(2026, 5, 14))).toBe('en 1 día')
    expect(phrase('2026-06-16', false, new Date(2026, 5, 14))).toBe('en 2 días')
  })

  it('pasado -> "hace N día(s)" con plural correcto', () => {
    expect(phrase('2026-06-13', false, new Date(2026, 5, 14))).toBe('hace 1 día')
    expect(phrase('2026-06-09', false, new Date(2026, 5, 14))).toBe('hace 5 días')
  })
})

import { dedupeSpecialDates } from './specialDates'
import type { SpecialDate } from '@/types'

describe('dedupeSpecialDates', () => {
  const sd = (over: Partial<SpecialDate>): SpecialDate => ({
    id: Math.random().toString(36).slice(2), label: 'x', date: '2025-06-04', recurring: false, ...over,
  })
  it('colapsa mismo label+fecha (Emilio x2)', () => {
    const out = dedupeSpecialDates([
      sd({ label: 'Nacimiento de Emilio (hijo de Adrian)', date: '2025-06-04' }),
      sd({ label: 'Nacimiento de Emilio (hijo de Adrian)', date: '2025-06-04' }),
    ])
    expect(out).toHaveLength(1)
  })
  it('colapsa con diferencias de acento/mayúsculas/espacios', () => {
    const out = dedupeSpecialDates([
      sd({ label: 'Cumpleaños del Sobrino', date: '2023-06-29' }),
      sd({ label: 'cumpleanos del  sobrino', date: '2023-06-29' }),
    ])
    expect(out).toHaveLength(1)
  })
  it('mantiene fechas distintas del mismo label', () => {
    const out = dedupeSpecialDates([
      sd({ label: 'Aniversario', date: '2020-06-29' }),
      sd({ label: 'Aniversario', date: '2021-06-29' }),
    ])
    expect(out).toHaveLength(2)
  })
})
