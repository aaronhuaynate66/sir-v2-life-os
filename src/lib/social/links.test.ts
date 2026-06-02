import { describe, it, expect } from 'vitest'

import {
  normalizeHandle,
  instagramLink,
  twitterLink,
  whatsappLink,
  normalizeUrl,
  normalizePhoneDigits,
  instagramHandleFromExtracted,
  resolveInstagramAutoLink,
} from './links'

describe('normalizeHandle', () => {
  it('quita @, espacios y barra final', () => {
    expect(normalizeHandle('@diana.d')).toBe('diana.d')
    expect(normalizeHandle('  diana.d/ ')).toBe('diana.d')
  })
  it('extrae el handle de una URL pegada', () => {
    expect(normalizeHandle('https://instagram.com/diana.d')).toBe('diana.d')
    expect(normalizeHandle('https://x.com/@someone')).toBe('someone')
  })
  it('vacío/null → null', () => {
    expect(normalizeHandle('')).toBeNull()
    expect(normalizeHandle(null)).toBeNull()
    expect(normalizeHandle('@')).toBeNull()
  })
})

describe('instagramLink', () => {
  it('arma el enlace al perfil real', () => {
    expect(instagramLink('diana.d')).toBe('https://instagram.com/diana.d')
    expect(instagramLink('@diana.d')).toBe('https://instagram.com/diana.d')
  })
  it('null si no hay handle', () => {
    expect(instagramLink(null)).toBeNull()
    expect(instagramLink('')).toBeNull()
  })
})

describe('twitterLink', () => {
  it('arma el enlace a x.com', () => {
    expect(twitterLink('someone')).toBe('https://x.com/someone')
  })
})

describe('whatsappLink / normalizePhoneDigits', () => {
  it('arma wa.me con solo dígitos', () => {
    expect(whatsappLink('+51 999 888 777')).toBe('https://wa.me/51999888777')
  })
  it('teléfono demasiado corto → null', () => {
    expect(normalizePhoneDigits('123')).toBeNull()
    expect(whatsappLink('123')).toBeNull()
  })
})

describe('normalizeUrl', () => {
  it('respeta http(s)', () => {
    expect(normalizeUrl('https://linkedin.com/in/x')).toBe('https://linkedin.com/in/x')
  })
  it('agrega esquema cuando falta', () => {
    expect(normalizeUrl('linkedin.com/in/x')).toBe('https://linkedin.com/in/x')
  })
})

describe('instagramHandleFromExtracted', () => {
  it('lee + normaliza el handle del JSON extraído', () => {
    expect(instagramHandleFromExtracted({ handle: '@diana.d' })).toBe('diana.d')
    expect(instagramHandleFromExtracted({ handle: 'diana.d' })).toBe('diana.d')
  })
  it('sin handle (o tipo inválido) → null', () => {
    expect(instagramHandleFromExtracted({})).toBeNull()
    expect(instagramHandleFromExtracted({ handle: 123 })).toBeNull()
    expect(instagramHandleFromExtracted(null)).toBeNull()
  })
})

describe('resolveInstagramAutoLink', () => {
  it('auto-vincula el handle de la captura cuando la persona no tiene ninguno', () => {
    expect(resolveInstagramAutoLink(null, { handle: 'diana.d' })).toBe('diana.d')
    expect(resolveInstagramAutoLink('', { handle: '@diana.d' })).toBe('diana.d')
  })
  it('NO pisa un handle ya cargado', () => {
    expect(resolveInstagramAutoLink('existente', { handle: 'otro' })).toBeNull()
  })
  it('sin handle en la captura → null', () => {
    expect(resolveInstagramAutoLink(null, {})).toBeNull()
    expect(resolveInstagramAutoLink(null, { handle: '' })).toBeNull()
  })
})
