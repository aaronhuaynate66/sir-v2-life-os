import { describe, it, expect } from 'vitest'

import {
  rowToDto,
  normalizeColor,
  normalizeLabel,
  validateIcsUrl,
  type CalendarConnectionRow,
} from './connections'
import { DEFAULT_CALENDAR_COLOR, CALENDAR_COLORS } from './types'

describe('validateIcsUrl', () => {
  it('acepta https', () => {
    const r = validateIcsUrl('https://outlook.office365.com/owa/calendar/abc/reachcalendar.ics')
    expect(r.ok).toBe(true)
    expect(r.url).toContain('https://')
  })

  it('normaliza webcal:// a https://', () => {
    const r = validateIcsUrl('webcal://p01.calendar.google.com/cal/basic.ics')
    expect(r.ok).toBe(true)
    expect(r.url?.startsWith('https://')).toBe(true)
  })

  it('rechaza vacío', () => {
    expect(validateIcsUrl('   ').ok).toBe(false)
    expect(validateIcsUrl(undefined).ok).toBe(false)
  })

  it('rechaza esquemas no-web (no filtra la URL en el motivo)', () => {
    const r = validateIcsUrl('file:///etc/passwd')
    expect(r.ok).toBe(false)
    expect(r.reason).toBeTruthy()
    expect(r.reason).not.toContain('passwd')
  })

  it('rechaza basura no parseable', () => {
    expect(validateIcsUrl('no es una url').ok).toBe(false)
  })
})

describe('normalizeColor', () => {
  it('mantiene un color de la paleta', () => {
    expect(normalizeColor(CALENDAR_COLORS[2])).toBe(CALENDAR_COLORS[2])
  })
  it('cae al default si no está en la paleta', () => {
    expect(normalizeColor('#123456')).toBe(DEFAULT_CALENDAR_COLOR)
    expect(normalizeColor(42)).toBe(DEFAULT_CALENDAR_COLOR)
  })
})

describe('normalizeLabel', () => {
  it('trimea y limita', () => {
    expect(normalizeLabel('  Trabajo  ')).toBe('Trabajo')
    expect(normalizeLabel('x'.repeat(200)).length).toBe(60)
  })
  it('vacío → Calendario', () => {
    expect(normalizeLabel('   ')).toBe('Calendario')
    expect(normalizeLabel(null)).toBe('Calendario')
  })
})

describe('rowToDto', () => {
  it('mapea snake_case a camelCase con defaults', () => {
    const row: CalendarConnectionRow = {
      id: 'c1',
      label: ' Personal ',
      provider: 'ics',
      ics_url: 'https://x/y.ics',
      color: '#22c55e',
      enabled: false,
      created_at: '2026-06-02T00:00:00Z',
    }
    expect(rowToDto(row)).toEqual({
      id: 'c1',
      label: 'Personal',
      provider: 'ics',
      icsUrl: 'https://x/y.ics',
      color: '#22c55e',
      enabled: false,
      createdAt: '2026-06-02T00:00:00Z',
    })
  })
  it('tolera nulls', () => {
    const dto = rowToDto({ id: 'c2', label: null, provider: null, ics_url: null, color: null, enabled: null, created_at: null })
    expect(dto.label).toBe('Calendario')
    expect(dto.provider).toBe('ics')
    expect(dto.enabled).toBe(true)
  })
})
