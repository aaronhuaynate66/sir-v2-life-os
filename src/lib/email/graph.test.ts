// SIR V2 — Tests de los helpers puros de Microsoft Graph (correo, Fase 2).

import { describe, it, expect } from 'vitest'
import {
  buildAuthUrl, tokenBodyForCode, tokenBodyForRefresh, isExpired, expiresAtFrom,
  parseGraphMessage, messageText, type GraphConfig,
} from './graph'

const cfg: GraphConfig = {
  clientId: 'cid', clientSecret: 'secret', tenant: 'common',
  redirectUri: 'https://sir.app/api/email/callback',
}

describe('OAuth URLs', () => {
  it('buildAuthUrl arma la URL de consentimiento con scope y state', () => {
    const u = buildAuthUrl(cfg, 'st8')
    expect(u).toMatch(/login\.microsoftonline\.com\/common\/oauth2\/v2\.0\/authorize/)
    expect(u).toMatch(/client_id=cid/)
    expect(u).toMatch(/state=st8/)
    expect(decodeURIComponent(u)).toMatch(/Mail\.Read/)
    expect(decodeURIComponent(u)).toMatch(/offline_access/)
  })
  it('tokenBodyForCode / refresh incluyen el grant correcto', () => {
    expect(tokenBodyForCode(cfg, 'abc')).toMatch(/grant_type=authorization_code/)
    expect(tokenBodyForCode(cfg, 'abc')).toMatch(/code=abc/)
    expect(tokenBodyForRefresh(cfg, 'rt')).toMatch(/grant_type=refresh_token/)
    expect(tokenBodyForRefresh(cfg, 'rt')).toMatch(/refresh_token=rt/)
  })
})

describe('expiración', () => {
  const now = Date.parse('2026-07-05T12:00:00Z')
  it('isExpired: null/pasado/dentro-del-skew → true; futuro lejano → false', () => {
    expect(isExpired(null, now)).toBe(true)
    expect(isExpired('2026-07-05T11:00:00Z', now)).toBe(true)
    expect(isExpired('2026-07-05T12:01:00Z', now)).toBe(true) // dentro del skew de 2 min
    expect(isExpired('2026-07-05T13:00:00Z', now)).toBe(false)
  })
  it('expiresAtFrom suma los segundos', () => {
    expect(expiresAtFrom(3600, now)).toBe('2026-07-05T13:00:00.000Z')
  })
})

describe('parseGraphMessage', () => {
  it('extrae remitente, asunto y cuerpo (html → texto)', () => {
    const m = parseGraphMessage({
      from: { emailAddress: { name: 'Cristina Fuentes', address: 'Cristina@GrupoHNG.com' } },
      subject: 'Reunión de presupuesto',
      body: { contentType: 'html', content: '<p>Hola Aaron,</p><style>x{}</style><div>Vemos el <b>viernes</b>.</div>' },
      bodyPreview: 'Hola Aaron, vemos el viernes.',
      receivedDateTime: '2026-07-05T09:30:00Z',
    })
    expect(m).not.toBeNull()
    expect(m!.from).toBe('Cristina Fuentes')
    expect(m!.fromEmail).toBe('cristina@grupohng.com') // normalizado a minúsculas
    expect(m!.subject).toBe('Reunión de presupuesto')
    expect(m!.body).toMatch(/Hola Aaron/)
    expect(m!.body).not.toMatch(/</) // sin tags
    expect(m!.receivedAt).toBe('2026-07-05T09:30:00Z')
  })
  it('cae a bodyPreview si no hay body; null si no hay nada', () => {
    const m = parseGraphMessage({ from: { emailAddress: { address: 'x@y.com' } }, bodyPreview: 'hola' })
    expect(m!.body).toBe('hola')
    expect(parseGraphMessage({})).toBeNull()
    expect(parseGraphMessage(null)).toBeNull()
  })
  it('messageText junta asunto + cuerpo', () => {
    expect(messageText({ from: 'X', fromEmail: 'x@y.com', subject: 'Tema', body: 'cuerpo', receivedAt: null }))
      .toBe('Asunto: Tema\ncuerpo')
  })
})
