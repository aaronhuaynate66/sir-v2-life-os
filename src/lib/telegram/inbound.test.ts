import { describe, it, expect } from 'vitest'
import { parseTelegramUpdate } from './inbound'

describe('parseTelegramUpdate', () => {
  it('parsea un mensaje de texto', () => {
    const r = parseTelegramUpdate({
      update_id: 1,
      message: { message_id: 10, chat: { id: 12345 }, text: '  ¿cómo viene Diana?  ', from: { first_name: 'Aaron', last_name: 'H' } },
    })
    expect(r).toEqual({ chatId: 12345, messageId: 10, text: '¿cómo viene Diana?', isVoice: false, voiceFileId: null, fromName: 'Aaron H' })
  })

  it('detecta voz y captura el file_id', () => {
    const r = parseTelegramUpdate({ message: { message_id: 2, chat: { id: 9 }, voice: { file_id: 'abc' } } })
    expect(r?.isVoice).toBe(true)
    expect(r?.voiceFileId).toBe('abc')
    expect(r?.text).toBe('')
    expect(r?.chatId).toBe(9)
  })

  it('trata edited_message como mensaje nuevo', () => {
    const r = parseTelegramUpdate({ edited_message: { message_id: 3, chat: { id: 7 }, text: 'hola' } })
    expect(r?.text).toBe('hola')
    expect(r?.chatId).toBe(7)
  })

  it('devuelve null sin chat id', () => {
    expect(parseTelegramUpdate({ message: { message_id: 1, text: 'hola' } })).toBeNull()
  })

  it('devuelve null para un update sin message', () => {
    expect(parseTelegramUpdate({ update_id: 1, my_chat_member: {} })).toBeNull()
  })

  it('devuelve null para mensaje sin texto ni voz (ej. sticker)', () => {
    expect(parseTelegramUpdate({ message: { message_id: 1, chat: { id: 5 }, sticker: {} } })).toBeNull()
  })

  it('no lanza con basura', () => {
    expect(parseTelegramUpdate(null)).toBeNull()
    expect(parseTelegramUpdate('x')).toBeNull()
    expect(parseTelegramUpdate(42)).toBeNull()
  })
})
