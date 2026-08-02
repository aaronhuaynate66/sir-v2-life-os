// SIR V2 — Tests del matcher por email + prioridad email > nombre (ingesta correo).

import { describe, it, expect } from 'vitest'
import {
  normalizeEmail,
  matchPersonIdByEmail,
  matchPersonIdByName,
  especificidad,
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

// —— Varios candidatos: gana el más específico (2-ago-2026) ————————————————
//
// Caso real: Aaron tiene un colega guardado como "William" a secas. Al conocer al
// Tte. William Manuel Llatance, el hilo "William Deportes Nacional" pegaba con los
// dos y el matcher devolvía null — sus mensajes no se atribuían a nadie. Una
// persona con nombre de pila suelto bloqueaba a todos sus homónimos.
describe('desempate por especificidad', () => {
  const COLEGA = { id: 'p_hng', name: 'William' }
  const TENIENTE = { id: 'p_tte', name: 'Tte. William Manuel Llatance', alias: 'William Deportes Nacional' }
  const GENTE = [COLEGA, TENIENTE]

  it('el hilo de WhatsApp cae en el teniente, no en el colega', () => {
    expect(matchPersonIdByName(GENTE, 'William Deportes Nacional')).toBe('p_tte')
  })

  it('el nombre completo también', () => {
    expect(matchPersonIdByName(GENTE, 'William Manuel Llatance')).toBe('p_tte')
  })

  it('"William" a secas va al colega, que se llama EXACTAMENTE así', () => {
    // La igualdad exacta es la mejor evidencia disponible y le gana a un match
    // parcial contra un nombre largo. Es un CAMBIO de comportamiento consciente:
    // antes devolvía null y el chat del colega quedaba sin atribuir a nadie.
    // El riesgo asumido: si algún día el hilo del teniente se llamara solo
    // "William", iría al colega. Se prefiere eso a no atribuir nunca ninguno.
    expect(matchPersonIdByName(GENTE, 'William')).toBe('p_hng')
  })

  it('con una sola persona se comporta como antes', () => {
    expect(matchPersonIdByName([COLEGA], 'William Deportes Nacional')).toBe('p_hng')
  })

  it('NO revive el bug "Carolina": un token suelto no atribuye', () => {
    const gente = [{ id: 'p_d', name: 'Diana Carolina Díaz Sánchez' }, { id: 'p_x', name: 'Carolina Insider One' }]
    expect(matchPersonIdByName(gente, 'Carolina Insider One')).toBe('p_x')
    // "Carolina" sola no alcanza para ninguno de los dos nombres largos.
    expect(matchPersonIdByName([{ id: 'p_d', name: 'Diana Carolina Díaz Sánchez' }], 'Carolina Insider One')).toBeNull()
  })

  it('empate genuino entre dos homónimos completos → null', () => {
    const gemelos = [{ id: 'a', name: 'Jorge Atarama' }, { id: 'b', name: 'Jorge Atarama' }]
    expect(matchPersonIdByName(gemelos, 'Jorge Atarama')).toBeNull()
  })
})

describe('especificidad', () => {
  it('la igualdad exacta manda', () => {
    expect(especificidad('William Deportes Nacional', 'William Deportes Nacional'))
      .toBeGreaterThan(especificidad('William Deportes Nacional', 'William'))
  })

  it('más tokens compartidos gana', () => {
    expect(especificidad('Jorge Atarama', 'Jorge Atarama Pérez'))
      .toBeGreaterThan(especificidad('Jorge Atarama', 'Jorge'))
  })

  it('no revienta con vacíos', () => {
    expect(especificidad('', 'x')).toBe(0)
    expect(especificidad(null as unknown as string, 'x')).toBe(0)
  })
})
