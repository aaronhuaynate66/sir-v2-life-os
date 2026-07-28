import { describe, it, expect } from 'vitest'
import { parseDevIntent } from './classifyDevMessage'
import { devInboxId } from './inboxLog'

/** Arma un cuerpo de respuesta de Anthropic con el texto dado. */
const body = (text: string) => ({ content: [{ text }] })

describe('parseDevIntent', () => {
  it('pedido con título → request', () => {
    expect(parseDevIntent(body('{"kind":"request","title":"Arreglar el botón de guardar"}')))
      .toEqual({ kind: 'request', title: 'Arreglar el botón de guardar' })
  })

  it('tolera el fence de markdown que a veces mete el modelo', () => {
    expect(parseDevIntent(body('```json\n{"kind":"status"}\n```')))
      .toEqual({ kind: 'status' })
  })

  it('recorta títulos largos a 70', () => {
    const r = parseDevIntent(body(JSON.stringify({ kind: 'request', title: 'x'.repeat(200) })))
    expect(r.kind).toBe('request')
    expect(r.kind === 'request' && r.title.length).toBe(70)
  })

  it('status EXPLÍCITO del modelo se respeta (es un juicio real)', () => {
    expect(parseDevIntent(body('{"kind":"status"}'))).toEqual({ kind: 'status' })
  })

  // ── El corazón del fix: no hacer pasar un fallo por "es una pregunta" ──────
  // Antes TODO esto devolvía 'status' → un PEDIDO se contestaba como pregunta de
  // estado y desaparecía sin dejar rastro.
  it('JSON no parseable → unknown, NO status', () => {
    expect(parseDevIntent(body('perdón, no entendí')).kind).toBe('unknown')
  })

  it('respuesta vacía → unknown', () => {
    expect(parseDevIntent(body('')).kind).toBe('unknown')
    expect(parseDevIntent({}).kind).toBe('unknown')
    expect(parseDevIntent(null).kind).toBe('unknown')
  })

  it('kind inesperado → unknown', () => {
    expect(parseDevIntent(body('{"kind":"otra_cosa"}')).kind).toBe('unknown')
  })

  it('request SIN título no es un juicio válido → unknown', () => {
    // Crear un issue sin título es peor que admitir que no sabemos.
    expect(parseDevIntent(body('{"kind":"request"}')).kind).toBe('unknown')
    expect(parseDevIntent(body('{"kind":"request","title":"   "}')).kind).toBe('unknown')
  })

  it('unknown siempre trae una razón para el log', () => {
    const r = parseDevIntent(body('roto'))
    expect(r.kind === 'unknown' && r.reason.length).toBeGreaterThan(0)
  })
})

describe('devInboxId', () => {
  it('mismo mensaje de Telegram → mismo id (los reintentos no duplican)', () => {
    expect(devInboxId(123, 77, 'hola')).toBe(devInboxId(123, 77, 'hola'))
  })
  it('distinto message_id → distinto id', () => {
    expect(devInboxId(123, 77, 'hola')).not.toBe(devInboxId(123, 78, 'hola'))
  })
  it('sin message_id cae al texto y sigue siendo estable', () => {
    expect(devInboxId(123, undefined, 'hola')).toBe(devInboxId(123, undefined, 'hola'))
    expect(devInboxId(123, undefined, 'hola')).not.toBe(devInboxId(123, undefined, 'chau'))
  })
})
