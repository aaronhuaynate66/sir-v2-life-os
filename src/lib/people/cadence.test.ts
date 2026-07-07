import { describe, it, expect } from 'vitest'

import {
  storedToPreset,
  presetToStored,
  parseCustomDays,
  describeCadence,
  cadenceStatus,
  suggestCadenceDays,
  effectiveCadenceDays,
} from './cadence'

const NOW = new Date('2026-07-07T12:00:00Z')

/** N contactos, uno cada `gap` días hacia atrás desde `now`. */
function datesEvery(gap: number, count: number, now = NOW): string[] {
  const out: string[] = []
  for (let i = 0; i < count; i++) out.push(new Date(now.getTime() - i * gap * 86_400_000).toISOString())
  return out
}

describe('storedToPreset', () => {
  it('vacío → auto', () => {
    expect(storedToPreset('')).toBe('auto')
    expect(storedToPreset(null)).toBe('auto')
    expect(storedToPreset('  ')).toBe('auto')
  })
  it('palabra conocida → esa palabra (case-insensitive)', () => {
    expect(storedToPreset('semanal')).toBe('semanal')
    expect(storedToPreset('Mensual')).toBe('mensual')
  })
  it('cualquier otra cosa → custom', () => {
    expect(storedToPreset('cada 10 días')).toBe('custom')
    expect(storedToPreset('monthly')).toBe('custom')
  })
})

describe('presetToStored', () => {
  it('auto → vacío', () => {
    expect(presetToStored('auto')).toBe('')
  })
  it('palabra → misma palabra', () => {
    expect(presetToStored('quincenal')).toBe('quincenal')
  })
  it('custom → "cada N días" acotado a 1..365', () => {
    expect(presetToStored('custom', 21)).toBe('cada 21 días')
    expect(presetToStored('custom', 0)).toBe('cada 1 días')
    expect(presetToStored('custom', 999)).toBe('cada 365 días')
    expect(presetToStored('custom')).toBe('cada 21 días') // default
  })
})

describe('parseCustomDays', () => {
  it('extrae N de "cada N días"', () => {
    expect(parseCustomDays('cada 10 días')).toBe(10)
    expect(parseCustomDays('cada 3 dias')).toBe(3)
  })
  it('null si no matchea', () => {
    expect(parseCustomDays('semanal')).toBeNull()
    expect(parseCustomDays('')).toBeNull()
  })
})

describe('describeCadence', () => {
  it('explícita: usa el texto', () => {
    const d = describeCadence('semanal', 'network')
    expect(d.days).toBe(7)
    expect(d.isAuto).toBe(false)
    expect(d.label).toBe('cada 7 días')
  })
  it('automática (vacío): cae al default por categoría, marca auto', () => {
    const d = describeCadence('', 'inner_circle')
    expect(d.days).toBe(7) // default inner_circle
    expect(d.isAuto).toBe(true)
    expect(d.label).toBe('cada 7 días · auto')
  })
  it('categorías distintas dan defaults distintos', () => {
    expect(describeCadence('', 'network').days).toBe(30)
    expect(describeCadence('', 'peripheral').days).toBe(60)
  })
})

describe('suggestCadenceDays', () => {
  it('con señal robusta, infiere el ritmo (mediana de gaps)', () => {
    // 8 contactos cada 10 días → span 70d, mediana de gaps 10.
    const s = suggestCadenceDays(datesEvery(10, 8), 'network', NOW)
    expect(s.source).toBe('rhythm')
    expect(s.days).toBe(10)
  })
  it('pocos contactos → cae al default por categoría', () => {
    const s = suggestCadenceDays(datesEvery(10, 3), 'network', NOW)
    expect(s.source).toBe('category')
    expect(s.days).toBe(30) // default network
  })
  it('muchos contactos pero en ventana corta (burst) → categoría, no ritmo falso', () => {
    // 6 contactos cada 2 días → span 10d < 45 → no confiamos.
    const s = suggestCadenceDays(datesEvery(2, 6), 'close', NOW)
    expect(s.source).toBe('category')
    expect(s.days).toBe(14) // default close
  })
  it('deduplica mismo día y descarta fechas futuras/ inválidas', () => {
    const dupes = [...datesEvery(10, 6), datesEvery(10, 1)[0], 'no-es-fecha', new Date(NOW.getTime() + 1e9).toISOString()]
    const s = suggestCadenceDays(dupes, 'network', NOW)
    expect(s.source).toBe('rhythm')
    expect(s.days).toBe(10)
  })
})

describe('effectiveCadenceDays', () => {
  it('texto explícito manda sobre la sugerencia', () => {
    const e = effectiveCadenceDays('semanal', 'network', { days: 40, source: 'rhythm' })
    expect(e).toMatchObject({ days: 7, isAuto: false, source: 'explicit' })
  })
  it('auto + sugerencia por ritmo → usa el ritmo', () => {
    const e = effectiveCadenceDays('', 'network', { days: 12, source: 'rhythm' })
    expect(e).toMatchObject({ days: 12, isAuto: true, source: 'rhythm' })
  })
  it('auto sin sugerencia → default por categoría', () => {
    const e = effectiveCadenceDays('', 'network')
    expect(e).toMatchObject({ days: 30, isAuto: true, source: 'category' })
  })
})

describe('describeCadence con sugerencia', () => {
  it('rhythm → etiqueta "tu ritmo"', () => {
    const d = describeCadence('', 'network', { days: 9, source: 'rhythm' })
    expect(d.days).toBe(9)
    expect(d.label).toBe('cada 9 días · tu ritmo')
    expect(d.source).toBe('rhythm')
  })
})

describe('cadenceStatus', () => {
  it('sin contacto registrado → sin_registro', () => {
    expect(cadenceStatus(null, 7).state).toBe('sin_registro')
  })
  it('dentro de la meta → al_dia', () => {
    const s = cadenceStatus(5, 7)
    expect(s.state).toBe('al_dia')
    expect(s.overdueDays).toBe(0)
    expect(s.label).toBe('al día')
  })
  it('justo en la meta → al_dia (no atrasado)', () => {
    expect(cadenceStatus(7, 7).state).toBe('al_dia')
  })
  it('pasada la meta → atrasado con los días de exceso', () => {
    const s = cadenceStatus(20, 7)
    expect(s.state).toBe('atrasado')
    expect(s.overdueDays).toBe(13)
    expect(s.label).toBe('atrasado 13d')
  })
})
