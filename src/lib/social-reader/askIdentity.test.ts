import { describe, it, expect } from 'vitest'
import {
  buildIdentityCard, identityCallback, parseIdentityCallback,
  handleFromCaption, orgNameFromHandle,
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
