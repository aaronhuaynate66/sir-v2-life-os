import { describe, it, expect } from 'vitest'
import { parseToolUse, requireFullName } from './tools'

describe('parseToolUse registrar_aprendizaje', () => {
  it('parsea una lección válida', () => {
    const r = parseToolUse({ name: 'registrar_aprendizaje', input: { text: 'Aaron prefiere findes largos para viajar', kind: 'preference', confidence: 'high' } })
    expect(r).toEqual({ kind: 'registrar_aprendizaje', text: 'Aaron prefiere findes largos para viajar', learningKind: 'preference', confidence: 'high' })
  })
  it('confidence default medium; kind inválido → null', () => {
    const ok = parseToolUse({ name: 'registrar_aprendizaje', input: { text: 'x y z', kind: 'pattern' } })
    expect(ok).toMatchObject({ confidence: 'medium', learningKind: 'pattern' })
    expect(parseToolUse({ name: 'registrar_aprendizaje', input: { text: 'x', kind: 'otro' } })).toBeNull()
    expect(parseToolUse({ name: 'registrar_aprendizaje', input: { kind: 'fact' } })).toBeNull()
  })
})

describe('requireFullName', () => {
  it('acepta "Diana Díaz" (2 tokens)', () => {
    expect(requireFullName('Diana Díaz')).toBe('Diana Díaz')
  })
  it('acepta 3 tokens', () => {
    expect(requireFullName('Fabiola Masías Ponce')).toBe('Fabiola Masías Ponce')
  })
  it('RECHAZA "Diana" solo (1 token)', () => {
    expect(requireFullName('Diana')).toBe(null)
  })
  it('rechaza vacío', () => {
    expect(requireFullName('')).toBe(null)
    expect(requireFullName('   ')).toBe(null)
  })
  it('rechaza no-string', () => {
    expect(requireFullName(null)).toBe(null)
    expect(requireFullName(42)).toBe(null)
  })
})

describe('parseToolUse crear_moment', () => {
  it('parsea moment abierto con follow_up_on', () => {
    const r = parseToolUse({
      name: 'crear_moment',
      input: {
        person_full_name: 'Diana Díaz',
        title: 'Discusión por ubicación',
        detail: 'Fui a buscarla, me molestó que sacó ubicación.',
        occurred_on: '2026-06-28',
        status: 'abierto',
        follow_up_on: '2026-07-08',
      },
    })
    expect(r?.kind).toBe('crear_moment')
    if (r?.kind === 'crear_moment') {
      expect(r.personFullName).toBe('Diana Díaz')
      expect(r.status).toBe('abierto')
      expect(r.followUpOn).toBe('2026-07-08')
    }
  })

  it('rechaza person_full_name de 1 token', () => {
    const r = parseToolUse({
      name: 'crear_moment',
      input: { person_full_name: 'Diana', title: 'X', occurred_on: '2026-01-01', status: 'abierto' },
    })
    expect(r).toBe(null)
  })

  it('rechaza fecha inválida', () => {
    const r = parseToolUse({
      name: 'crear_moment',
      input: { person_full_name: 'Diana Díaz', title: 'X', occurred_on: 'ayer', status: 'abierto' },
    })
    expect(r).toBe(null)
  })
})

describe('parseToolUse crear_person_log', () => {
  it('parsea log de interacción', () => {
    const r = parseToolUse({
      name: 'crear_person_log',
      input: { person_full_name: 'Diana Díaz', kind: 'interaction', value: 4, note: 'reconectamos', logged_at: '2026-06-29T23:30:00-05:00' },
    })
    expect(r?.kind).toBe('crear_person_log')
    if (r?.kind === 'crear_person_log') {
      expect(r.value).toBe(4)
      expect(r.logKind).toBe('interaction')
    }
  })

  it('rechaza value fuera de 1..5', () => {
    const r = parseToolUse({
      name: 'crear_person_log',
      input: { person_full_name: 'Diana Díaz', kind: 'interaction', value: 7, logged_at: '2026-06-29T20:00:00-05:00' },
    })
    expect(r).toBe(null)
  })

  it('rechaza kind desconocido', () => {
    const r = parseToolUse({
      name: 'crear_person_log',
      input: { person_full_name: 'Diana Díaz', kind: 'aleatorio', value: 3, logged_at: '2026-06-29T20:00:00-05:00' },
    })
    expect(r).toBe(null)
  })
})

describe('parseToolUse flag_ambiguo', () => {
  it('acepta nombre corto (no requiere apellido)', () => {
    const r = parseToolUse({
      name: 'flag_ambiguo',
      input: { short_name: 'Diana', context_hint: 'afectivo', options_seen: ['Diana Díaz', 'Diana Cencaro'] },
    })
    expect(r?.kind).toBe('flag_ambiguo')
    if (r?.kind === 'flag_ambiguo') {
      expect(r.shortName).toBe('Diana')
      expect(r.optionsSeen).toEqual(['Diana Díaz', 'Diana Cencaro'])
    }
  })
})

describe('parseToolUse registrar_ciclo', () => {
  it('parsea "bleeding" con confidence high', () => {
    const r = parseToolUse({
      name: 'registrar_ciclo',
      input: { person_full_name: 'Diana Díaz', date: '2026-06-29', phase: 'bleeding', confidence: 'high', note: 'resto de regla' },
    })
    expect(r?.kind).toBe('registrar_ciclo')
    if (r?.kind === 'registrar_ciclo') {
      expect(r.phase).toBe('bleeding')
      expect(r.confidence).toBe('high')
      expect(r.note).toBe('resto de regla')
    }
  })
  it('default confidence=medium si no viene', () => {
    const r = parseToolUse({
      name: 'registrar_ciclo',
      input: { person_full_name: 'Diana Díaz', date: '2026-06-29', phase: 'bleeding' },
    })
    if (r?.kind === 'registrar_ciclo') expect(r.confidence).toBe('medium')
  })
  it('rechaza phase inválida', () => {
    const r = parseToolUse({
      name: 'registrar_ciclo',
      input: { person_full_name: 'Diana Díaz', date: '2026-06-29', phase: 'menstruando' },
    })
    expect(r).toBe(null)
  })
  it('rechaza sin apellido', () => {
    const r = parseToolUse({
      name: 'registrar_ciclo',
      input: { person_full_name: 'Diana', date: '2026-06-29', phase: 'bleeding' },
    })
    expect(r).toBe(null)
  })
})

describe('parseToolUse tool desconocida', () => {
  it('devuelve null', () => {
    expect(parseToolUse({ name: 'no_existe', input: {} })).toBe(null)
  })
})
