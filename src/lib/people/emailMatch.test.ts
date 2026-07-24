// SIR V2 — Tests del matcher por email + prioridad email > nombre (ingesta correo).

import { describe, it, expect } from 'vitest'
import {
  normalizeEmail,
  matchPersonIdByEmail,
  matchPersonIdByName,
  resolvePersonId,
  type PersonMatchRow,
} from './emailMatch'

const PEOPLE: PersonMatchRow[] = [
  { id: 'p_diana', name: 'Diana Carolina Díaz', alias: 'Dianita', email: 'diana@x.com' },
  { id: 'p_esteban', name: 'Esteban Huaynate', alias: 'Papá', email: 'ESTEBAN.H@Empresa.COM' },
  { id: 'p_sinmail', name: 'Marita', alias: null, email: null },
]

describe('normalizeEmail', () => {
  it('hace trim + minúsculas', () => {
    expect(normalizeEmail('  DIANA@X.COM ')).toBe('diana@x.com')
    expect(normalizeEmail(null)).toBe('')
    expect(normalizeEmail(undefined)).toBe('')
  })
})

describe('matchPersonIdByEmail', () => {
  it('matchea exacto e insensible a mayúsculas/espacios', () => {
    expect(matchPersonIdByEmail(PEOPLE, 'diana@x.com')).toBe('p_diana')
    expect(matchPersonIdByEmail(PEOPLE, '  Esteban.H@empresa.com ')).toBe('p_esteban')
  })
  it('null si no hay email o no matchea', () => {
    expect(matchPersonIdByEmail(PEOPLE, '')).toBeNull()
    expect(matchPersonIdByEmail(PEOPLE, null)).toBeNull()
    expect(matchPersonIdByEmail(PEOPLE, 'nadie@x.com')).toBeNull()
  })
  it('null si dos personas comparten el mismo email (ambiguo)', () => {
    const dup: PersonMatchRow[] = [
      { id: 'a', name: 'A', email: 'shared@x.com' },
      { id: 'b', name: 'B', email: 'shared@x.com' },
    ]
    expect(matchPersonIdByEmail(dup, 'shared@x.com')).toBeNull()
  })
})

describe('matchPersonIdByName', () => {
  it('matchea por nombre (laxo) y por alias', () => {
    expect(matchPersonIdByName(PEOPLE, 'Diana Carolina')).toBe('p_diana')
    expect(matchPersonIdByName(PEOPLE, 'Papá')).toBe('p_esteban')
  })
  it('null si nombre vacío o sin match', () => {
    expect(matchPersonIdByName(PEOPLE, '')).toBeNull()
    expect(matchPersonIdByName(PEOPLE, 'Fulano Desconocido')).toBeNull()
  })
})

describe('resolvePersonId — prioridad email > nombre', () => {
  it('usa el email aunque el nombre del hilo apunte a OTRA persona', () => {
    // El hilo dice "Marita" (p_sinmail) pero el fromEmail es de Diana → gana Diana.
    expect(resolvePersonId(PEOPLE, { threadName: 'Marita', fromEmail: 'diana@x.com' })).toBe('p_diana')
  })

  it('cae al nombre cuando no hay email', () => {
    expect(resolvePersonId(PEOPLE, { threadName: 'Diana Carolina', fromEmail: null })).toBe('p_diana')
    expect(resolvePersonId(PEOPLE, { threadName: 'Papá', fromEmail: '' })).toBe('p_esteban')
  })

  it('cae al nombre cuando el email no matchea a nadie', () => {
    expect(resolvePersonId(PEOPLE, { threadName: 'Diana Carolina', fromEmail: 'desconocido@x.com' })).toBe('p_diana')
  })

  it('null cuando ni email ni nombre resuelven', () => {
    expect(resolvePersonId(PEOPLE, { threadName: 'Nadie', fromEmail: 'nadie@x.com' })).toBeNull()
    expect(resolvePersonId(PEOPLE, { threadName: '', fromEmail: '' })).toBeNull()
  })
})
