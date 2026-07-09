// SIR V2 — Tests del webhook inbound de WhatsApp (firma + parseo). PURO.

import { describe, it, expect } from 'vitest'
import { createHmac } from 'crypto'
import { verifyWebhookSignature, parseInboundMessages, normalizePhone } from './inbound'

const SECRET = 'app-secret-123'
const sign = (body: string) => 'sha256=' + createHmac('sha256', SECRET).update(body, 'utf8').digest('hex')

describe('verifyWebhookSignature', () => {
  it('acepta una firma válida', () => {
    const body = '{"hello":"world"}'
    expect(verifyWebhookSignature(body, sign(body), SECRET)).toBe(true)
  })
  it('rechaza firma de otro body (tamper)', () => {
    expect(verifyWebhookSignature('{"a":1}', sign('{"a":2}'), SECRET)).toBe(false)
  })
  it('rechaza secret equivocado', () => {
    const body = 'x'
    expect(verifyWebhookSignature(body, sign(body), 'otro-secret')).toBe(false)
  })
  it('rechaza header ausente o mal formado', () => {
    expect(verifyWebhookSignature('x', null, SECRET)).toBe(false)
    expect(verifyWebhookSignature('x', 'abc', SECRET)).toBe(false)
    expect(verifyWebhookSignature('x', 'sha1=deadbeef', SECRET)).toBe(false)
  })
})

describe('normalizePhone', () => {
  it('deja solo dígitos', () => {
    expect(normalizePhone('+51 987 654 321')).toBe('51987654321')
    expect(normalizePhone(null)).toBe('')
  })
})

describe('parseInboundMessages', () => {
  const textPayload = {
    entry: [{
      changes: [{
        value: {
          contacts: [{ profile: { name: 'Aaron' }, wa_id: '51999' }],
          messages: [{ from: '51999', id: 'wamid.1', type: 'text', text: { body: '  Vi a Diana hoy  ' } }],
        },
      }],
    }],
  }

  it('extrae un mensaje de texto (trim + from normalizado + profileName)', () => {
    const [m] = parseInboundMessages(textPayload)
    expect(m).toMatchObject({ from: '51999', messageId: 'wamid.1', type: 'text', text: 'Vi a Diana hoy', profileName: 'Aaron' })
  })

  it('marca no-texto sin text', () => {
    const audio = { entry: [{ changes: [{ value: { messages: [{ from: '51999', id: 'a', type: 'audio' }] } }] }] }
    const [m] = parseInboundMessages(audio)
    expect(m.type).toBe('audio')
    expect(m.text).toBeUndefined()
  })

  it('ignora eventos de estado (sin messages)', () => {
    const status = { entry: [{ changes: [{ value: { statuses: [{ status: 'delivered' }] } }] }] }
    expect(parseInboundMessages(status)).toEqual([])
  })

  it('payload basura → []', () => {
    expect(parseInboundMessages(null)).toEqual([])
    expect(parseInboundMessages({})).toEqual([])
  })
})
