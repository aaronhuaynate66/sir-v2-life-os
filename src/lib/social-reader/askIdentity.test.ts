import { describe, it, expect } from 'vitest'
import {
  buildIdentityCard, identityCallback, parseIdentityCallback,
  handleFromCaption, orgNameFromHandle, pickPhoto, lineaDeBandejaVieja,
} from './askIdentity'

describe('buildIdentityCard', () => {
  const card = () => buildIdentityCard({ id: 'usa_abc', handle: 'bomberos.salamanca127', hint: 'cuenta de negocio', followers: 12500 })

  it('pregunta lo que faltaba en todas las superficies: persona o empresa', () => {
    const { caption, keyboard } = card()
    expect(caption).toMatch(/persona.*empresa|empresa.*persona/i)
    const textos = keyboard.flat().map((b) => b.text)
    expect(textos).toContain('👤 Es persona')
    expect(textos).toContain('🏢 Empresa o página')
    expect(textos).toContain('✕ No me interesa')
  })

  it('el @handle va SIEMPRE en el pie — es lo que resuelve la respuesta sin estado', () => {
    expect(card().caption).toContain('@bomberos.salamanca127')
  })

  it('muestra lo que ya sabe y los seguidores', () => {
    const { caption } = card()
    expect(caption).toContain('cuenta de negocio')
    expect(caption).toContain('12,500')
  })

  it('funciona sin pistas', () => {
    const { caption } = buildIdentityCard({ id: 'x', handle: 'dayrrit' })
    expect(caption).toContain('@dayrrit')
    expect(caption).not.toMatch(/Seguidores/)
  })

  it('invita a responder con el nombre (una cuenta por vez, sin listas)', () => {
    expect(card().caption).toMatch(/respóndeme a este mensaje con su nombre/i)
  })
})

describe('callbacks', () => {
  it('ida y vuelta de las tres acciones', () => {
    for (const a of ['person', 'org', 'dismiss'] as const) {
      expect(parseIdentityCallback(identityCallback(a, 'usa_123'))).toEqual({ action: a, id: 'usa_123' })
    }
  })
  it('caben en los 64 bytes de Telegram con ids reales', () => {
    // Los ids de la bandeja son `usa_` + sha1 (40 hex) = 44 chars.
    const real = 'usa_' + 'a'.repeat(40)
    expect(identityCallback('person', real)).not.toBe('')
  })
  it('null ante basura', () => {
    for (const d of ['', 'br|task_done|x', 'wi|', 'wi|z|abc', 'wi|p|']) {
      expect(parseIdentityCallback(d), d).toBeNull()
    }
  })
})

describe('handleFromCaption', () => {
  it('recupera el handle del pie citado', () => {
    const { caption } = buildIdentityCard({ id: 'x', handle: 'dan.francia.76' })
    expect(handleFromCaption(caption)).toBe('dan.francia.76')
  })
  it('null si no hay handle', () => {
    expect(handleFromCaption('hola qué tal')).toBeNull()
    expect(handleFromCaption('')).toBeNull()
  })
  it('normaliza a minúsculas', () => {
    expect(handleFromCaption('mirá a @DanaVeronica')).toBe('danaveronica')
  })
})

describe('orgNameFromHandle', () => {
  it('conserva y separa los dígitos — en una unidad el número es parte del nombre', () => {
    // `handleToProbableName` los borra porque adivina nombres de PERSONA.
    expect(orgNameFromHandle('bomberos.salamanca127')).toBe('Bomberos Salamanca 127')
    expect(orgNameFromHandle('bomberosb169')).toBe('Bomberosb 169')
  })
  it('separa por puntos, guiones y guion bajo', () => {
    expect(orgNameFromHandle('quick_eat-peru')).toBe('Quick Eat Peru')
    expect(orgNameFromHandle('@bazar_nelly')).toBe('Bazar Nelly')
  })
  it('un handle de una sola palabra queda capitalizado', () => {
    expect(orgNameFromHandle('grupoherber')).toBe('Grupoherber')
  })
  it('no explota con vacío', () => {
    expect(orgNameFromHandle('')).toBe('')
  })
})

describe('pickPhoto', () => {
  // La URL de IG caduca (medido 28-jul: hoy 200, mañana no). El snapshot en
  // Storage no expira → cuando está, gana.
  it('prefiere el snapshot firmado, que no expira', () => {
    expect(pickPhoto({ signedSnapshotUrl: 'https://storage/firmada.jpg', avatarUrl: 'https://ig/caduca.jpg' }))
      .toBe('https://storage/firmada.jpg')
  })
  it('cae a la URL de IG si no hay snapshot', () => {
    expect(pickPhoto({ signedSnapshotUrl: null, avatarUrl: 'https://ig/x.jpg' })).toBe('https://ig/x.jpg')
  })
  it('null si no hay ninguna — el caller no manda tarjeta sin cara', () => {
    expect(pickPhoto({})).toBeNull()
    expect(pickPhoto({ signedSnapshotUrl: '', avatarUrl: '' })).toBeNull()
  })
})

// ═══ LA CONTRADICCIÓN DEL 6-ago-2026 ════════════════════════════════════════
//
// Aaron: *"por un lado me dice que no le anda el de Instagram pero por otro al final
// me manda una historia de una persona"*. Los dos mensajes eran verdaderos —la cola
// tenía 69 cuentas y lo más nuevo era del 30-jul— y ninguno mencionaba al otro.
describe('lineaDeBandejaVieja', () => {
  it('en una historia VIEJA dice de dónde sale y cuántas quedan', () => {
    const l = lineaDeBandejaVieja(69, false)!
    expect(l).toContain('bandeja vieja')
    expect(l).toContain('68 cuentas') // se descuenta la que se está preguntando
    expect(l).toContain('una por noche')
  })

  it('en una historia NUEVA no dice nada: ahí no hay contradicción que explicar', () => {
    expect(lineaDeBandejaVieja(69, true)).toBeNull()
  })

  it('con la última de la cola no promete que quedan más', () => {
    expect(lineaDeBandejaVieja(1, false)).not.toContain('cuentas por identificar')
    expect(lineaDeBandejaVieja(0, false)).toContain('bandeja vieja')
  })

  it('no revienta con basura', () => {
    expect(lineaDeBandejaVieja(NaN, false)).toContain('bandeja vieja')
  })
})

describe('la tarjeta dice de dónde sale cuando la historia es vieja', () => {
  const AHORA = Date.parse('2026-08-06T21:22:00-05:00')

  it('el caso real: @aixafranke, historia del 30-jul, preguntada el 6-ago', () => {
    const { caption } = buildIdentityCard({
      id: 'x', handle: 'aixafranke', observedAt: '2026-07-30T14:06:35Z', pendientesEnBandeja: 69,
    }, AHORA)
    expect(caption).toContain('el 30 de julio')
    expect(caption).toContain('bandeja vieja')
    expect(caption).toContain('68')
  })

  it('una historia de hoy NO trae la cláusula: sería ruido', () => {
    const { caption } = buildIdentityCard({
      id: 'x', handle: 'alguien', observedAt: '2026-08-06T18:00:00-05:00', pendientesEnBandeja: 69,
    }, AHORA)
    expect(caption).toContain('hoy')
    expect(caption).not.toContain('bandeja vieja')
  })

  it('sin el conteo sigue avisando que es vieja, sin inventar un número', () => {
    const { caption } = buildIdentityCard({
      id: 'x', handle: 'alguien', observedAt: '2026-07-30T14:06:35Z',
    }, AHORA)
    expect(caption).toContain('bandeja vieja')
    expect(caption).not.toMatch(/\d+ cuentas/)
  })
})
