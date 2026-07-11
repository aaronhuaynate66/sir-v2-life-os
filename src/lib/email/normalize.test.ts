// SIR V2 — Tests del normalizador de correo scrapeado (Outlook Web → Graph).

import { describe, it, expect } from 'vitest'
import {
  stableHash, extractEmail, normalizeReceivedAt, emailDedupKey,
  normalizeScrapedEmail, normalizeScrapedEmails,
} from './normalize'

// Un "ahora" fijo para resolver fechas relativas de forma determinística.
const NOW = Date.parse('2026-07-10T15:00:00.000Z')

describe('stableHash', () => {
  it('es determinístico y hex de 8', () => {
    expect(stableHash('hola')).toBe(stableHash('hola'))
    expect(stableHash('hola')).toMatch(/^[0-9a-f]{8}$/)
    expect(stableHash('hola')).not.toBe(stableHash('chau'))
  })
})

describe('extractEmail', () => {
  it('saca el email de un string libre', () => {
    expect(extractEmail('Diana Díaz <diana@x.com>')).toBe('diana@x.com')
    expect(extractEmail('DIANA@X.COM')).toBe('diana@x.com')
    expect(extractEmail('sin email')).toBe('')
    expect(extractEmail(null)).toBe('')
  })
})

describe('normalizeReceivedAt', () => {
  it('pasa ISO / fecha absoluta a ISO', () => {
    expect(normalizeReceivedAt('2026-07-02T10:00:00Z', NOW)).toBe('2026-07-02T10:00:00.000Z')
  })
  it('resuelve HH:MM (24h y a.m./p.m.) contra nowMs → hoy', () => {
    expect(normalizeReceivedAt('10:32', NOW)).toBe('2026-07-10T10:32:00.000Z')
    // 3:05 p. m. = 15:05 (UTC, determinístico)
    expect(normalizeReceivedAt('3:05 p. m.', NOW)).toBe('2026-07-10T15:05:00.000Z')
    // 12:00 a. m. = medianoche
    expect(normalizeReceivedAt('12:00 am', NOW)).toBe('2026-07-10T00:00:00.000Z')
  })
  it('resuelve hoy / ayer', () => {
    expect(normalizeReceivedAt('hoy', NOW)!.startsWith('2026-07-10')).toBe(true)
    expect(normalizeReceivedAt('ayer', NOW)!.startsWith('2026-07-09')).toBe(true)
  })
  it('devuelve el crudo si no lo entiende, y null si vacío', () => {
    expect(normalizeReceivedAt('mar 9:15', NOW)).toBe('mar 9:15')
    expect(normalizeReceivedAt('', NOW)).toBeNull()
    expect(normalizeReceivedAt(null, NOW)).toBeNull()
  })
})

describe('emailDedupKey', () => {
  it('usa messageId cuando está', () => {
    expect(emailDedupKey({ messageId: 'AAA123', from: 'x', subject: 'y' })).toBe('mid:AAA123')
  })
  it('sin messageId → hash estable de from+subject+receivedAt (crudo)', () => {
    const k1 = emailDedupKey({ from: 'Diana', subject: 'Hola', receivedAt: '10:32' })
    const k2 = emailDedupKey({ from: 'Diana', subject: 'Hola', receivedAt: '10:32' })
    expect(k1).toBe(k2)
    expect(k1).toMatch(/^h:[0-9a-f]{8}$/)
    // cambia el asunto → cambia la llave
    expect(emailDedupKey({ from: 'Diana', subject: 'Otro', receivedAt: '10:32' })).not.toBe(k1)
  })
  it('prefiere el email al nombre para el hash', () => {
    const a = emailDedupKey({ from: 'Diana', fromEmail: 'diana@x.com', subject: 'H', receivedAt: 't' })
    const b = emailDedupKey({ from: 'Otro nombre', fromEmail: 'diana@x.com', subject: 'H', receivedAt: 't' })
    expect(a).toBe(b)
  })
})

describe('normalizeScrapedEmail', () => {
  it('correo completo → shape de Graph + dedupKey', () => {
    const n = normalizeScrapedEmail({
      from: 'Diana Díaz <diana@x.com>', subject: 'Reunión', receivedAt: '2026-07-02T10:00:00Z',
      body: 'Nos vemos el jueves', messageId: 'M1',
    }, NOW)
    expect(n).toMatchObject({
      from: 'Diana Díaz', fromEmail: 'diana@x.com', subject: 'Reunión',
      body: 'Nos vemos el jueves', receivedAt: '2026-07-02T10:00:00.000Z', dedupKey: 'mid:M1',
    })
  })
  it('sin body usa el snippet de la lista', () => {
    const n = normalizeScrapedEmail({ from: 'Alex', subject: 'Update', snippet: 'preview corto…' }, NOW)
    expect(n?.body).toBe('preview corto…')
  })
  it('sin messageId cae al hash', () => {
    const n = normalizeScrapedEmail({ from: 'Alex', subject: 'Update', receivedAt: '10:00' }, NOW)
    expect(n?.dedupKey).toMatch(/^h:[0-9a-f]{8}$/)
  })
  it('sin email visible deja fromEmail vacío pero conserva el nombre', () => {
    const n = normalizeScrapedEmail({ from: 'Marita', subject: 'x', snippet: 'y' }, NOW)
    expect(n?.fromEmail).toBe('')
    expect(n?.from).toBe('Marita')
  })
  it('descarta ruido sin contenido', () => {
    expect(normalizeScrapedEmail({}, NOW)).toBeNull()
    expect(normalizeScrapedEmail(null, NOW)).toBeNull()
    expect(normalizeScrapedEmail('no-objeto', NOW)).toBeNull()
  })
  it('descarta el correo cuando el scraper tomó la HORA como remitente (sin email)', () => {
    // Bug de OWA: los selectores fallan y el fallback toma "15:15" como remitente.
    expect(normalizeScrapedEmail({ from: '15:15', subject: 'Ayúdanos con la compra' }, NOW)).toBeNull()
    expect(normalizeScrapedEmail({ from: '3:05 p. m.', subject: 'x' }, NOW)).toBeNull()
  })
  it('pero conserva el correo si hay email real, aunque el nombre parezca hora', () => {
    const n = normalizeScrapedEmail({ from: '15:15', fromEmail: 'jefe@work.com', subject: 'x' }, NOW)
    expect(n).not.toBeNull()
    expect(n?.fromEmail).toBe('jefe@work.com')
  })
})

describe('normalizeScrapedEmails (dedup de re-scrapes)', () => {
  it('colapsa correos repetidos por dedupKey', () => {
    const list = [
      { from: 'Diana', subject: 'Hola', receivedAt: '10:32', snippet: 'preview', messageId: 'M1' },
      { from: 'Diana', subject: 'Hola', receivedAt: '10:32', snippet: 'preview', messageId: 'M1' }, // re-scrape
      { from: 'Alex', subject: 'Otro', receivedAt: '11:00', messageId: 'M2' },
    ]
    const out = normalizeScrapedEmails(list, NOW)
    expect(out).toHaveLength(2)
    expect(out.map((m) => m.dedupKey).sort()).toEqual(['mid:M1', 'mid:M2'])
  })
  it('ante la misma llave se queda con la variante de cuerpo más largo (lista→snippet vs abierto→body)', () => {
    const list = [
      { from: 'Diana', subject: 'Hola', messageId: 'M1', snippet: 'corto' },        // primero, de la lista
      { from: 'Diana', subject: 'Hola', messageId: 'M1', body: 'cuerpo completo y largo' }, // luego, abierto
    ]
    const out = normalizeScrapedEmails(list, NOW)
    expect(out).toHaveLength(1)
    expect(out[0].body).toBe('cuerpo completo y largo')
  })
  it('lista vacía / no-array → []', () => {
    expect(normalizeScrapedEmails(null, NOW)).toEqual([])
    expect(normalizeScrapedEmails('x', NOW)).toEqual([])
    expect(normalizeScrapedEmails([{}], NOW)).toEqual([])
  })
})
