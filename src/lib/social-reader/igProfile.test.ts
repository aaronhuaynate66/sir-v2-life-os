import { describe, it, expect } from 'vitest'
import {
  canonProfileHandle,
  parseCount,
  normalizeReaderProfile,
  looksLikeOrg,
  ORG_FOLLOWER_FLOOR,
  type ReaderProfile,
} from './igProfile'

describe('canonProfileHandle', () => {
  it('saca el @ y baja a minúsculas', () => {
    expect(canonProfileHandle('@Diana.Carolina')).toBe('diana.carolina')
  })
  it('acepta puntos y guiones bajos', () => {
    expect(canonProfileHandle('fire_brothers.pe')).toBe('fire_brothers.pe')
  })
  it('rechaza lo que no es handle', () => {
    for (const v of ['', '  ', 'con espacio', 'a'.repeat(31), 'tiene/barra', null, 42, undefined]) {
      expect(canonProfileHandle(v)).toBeNull()
    }
  })
})

describe('parseCount', () => {
  it('número crudo', () => {
    expect(parseCount(1200)).toBe(1200)
    expect(parseCount(0)).toBe(0)
  })
  it('redondea decimales', () => {
    expect(parseCount(1200.6)).toBe(1201)
  })
  it('expande sufijos abreviados', () => {
    expect(parseCount('1.2k')).toBe(1200)
    expect(parseCount('1,2 k')).toBe(1200)
    expect(parseCount('3.4M')).toBe(3_400_000)
    expect(parseCount('12 mil')).toBe(12_000)
  })
  it('separador de miles sin sufijo', () => {
    expect(parseCount('1.234')).toBe(1234)
    expect(parseCount('1,234')).toBe(1234)
    expect(parseCount('12.345.678')).toBe(12345678)
  })
  it('coma Y punto: el último manda', () => {
    expect(parseCount('1.234,56')).toBe(1235)
    expect(parseCount('1,234.56')).toBe(1235)
  })
  it('rechaza basura en vez de inventar', () => {
    for (const v of ['', 'muchos', 'seguidores', '-5', null, undefined, {}, NaN, Infinity]) {
      expect(parseCount(v)).toBeNull()
    }
  })
  it('rechaza números absurdos (campo mal leído, no dato)', () => {
    expect(parseCount(2_000_000_000)).toBeNull()
  })
})

describe('normalizeReaderProfile', () => {
  it('sin handle válido no hay perfil', () => {
    expect(normalizeReaderProfile({ followersCount: 100 })).toBeNull()
    expect(normalizeReaderProfile({ handle: 'con espacio', followersCount: 100 })).toBeNull()
    expect(normalizeReaderProfile(null)).toBeNull()
  })

  it('un perfil sin NINGÚN campo útil no se guarda', () => {
    expect(normalizeReaderProfile({ handle: 'alguien' })).toBeNull()
  })

  it('normaliza el caso completo', () => {
    const p = normalizeReaderProfile({
      handle: '@FireBrothersPeru',
      fullName: '  Fire  Brothers   Perú ',
      biography: 'Rescate y emergencias',
      category: 'Servicio de emergencias',
      followersCount: '12.5k',
      followingCount: 340,
      postsCount: '1,204',
      isVerified: false,
      isBusiness: true,
    })
    expect(p).toEqual({
      handle: 'firebrothersperu',
      displayName: 'Fire Brothers Perú',
      bio: 'Rescate y emergencias',
      category: 'Servicio de emergencias',
      externalLink: null,
      postsCount: 1204,
      followersCount: 12500,
      followingCount: 340,
      isVerified: false,
      isBusiness: true,
    })
  })

  it('descarta el displayName que es solo el handle repetido', () => {
    // IG rellena así muchas cuentas; guardarlo haría creer que ya está resuelta.
    expect(normalizeReaderProfile({ handle: 'yayocastaneda.pe', fullName: 'yayocastaneda.pe', followersCount: 10 })?.displayName).toBeNull()
    expect(normalizeReaderProfile({ handle: 'yayocastaneda.pe', fullName: 'Yayo Castañeda', followersCount: 10 })?.displayName).toBe('Yayo Castañeda')
  })

  it('acepta displayName parcial sin exigir contadores (el nombre es lo que más falta)', () => {
    const p = normalizeReaderProfile({ handle: 'marcemassive', displayName: 'Marcela M.' })
    expect(p?.displayName).toBe('Marcela M.')
    expect(p?.followersCount).toBeNull()
  })

  it('booleanos ausentes quedan null, no false', () => {
    const p = normalizeReaderProfile({ handle: 'x', followersCount: 5 })
    expect(p?.isVerified).toBeNull()
    expect(p?.isBusiness).toBeNull()
  })
})

const base: ReaderProfile = {
  handle: 'x', displayName: null, bio: null, category: null, externalLink: null,
  postsCount: null, followersCount: null, followingCount: null,
  isVerified: null, isBusiness: null,
}

describe('looksLikeOrg', () => {
  it('cuenta profesional con rubro → org', () => {
    expect(looksLikeOrg({ ...base, isBusiness: true, category: 'Gimnasio' })).toBe(true)
  })
  it('mucho seguidor → org', () => {
    expect(looksLikeOrg({ ...base, followersCount: ORG_FOLLOWER_FLOOR })).toBe(true)
  })
  it('verificada con volumen → org', () => {
    expect(looksLikeOrg({ ...base, isVerified: true, followersCount: 5_000 })).toBe(true)
  })
  it('cuenta chica y no profesional → persona', () => {
    expect(looksLikeOrg({ ...base, isBusiness: false, followersCount: 400 })).toBe(false)
  })
  it('sin señal se CALLA (no clasifica a una persona como empresa)', () => {
    expect(looksLikeOrg(base)).toBeNull()
    expect(looksLikeOrg({ ...base, followersCount: 3_000 })).toBeNull()
  })
})
