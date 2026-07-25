import { describe, it, expect } from 'vitest'
import { parseTelegramUpdate, parseTelegramCallback } from './inbound'

describe('parseTelegramUpdate', () => {
  it('parsea un mensaje de texto', () => {
    const r = parseTelegramUpdate({
      update_id: 1,
      message: { message_id: 10, chat: { id: 12345 }, text: '  ¿cómo viene Diana?  ', from: { first_name: 'Aaron', last_name: 'H' } },
    })
    expect(r).toEqual({ chatId: 12345, messageId: 10, text: '¿cómo viene Diana?', isVoice: false, voiceFileId: null, photoFileId: null, caption: '', fromName: 'Aaron H', replyTo: null })
  })

  it('captura el mensaje CITADO cuando Aaron responde al brief', () => {
    const r = parseTelegramUpdate({
      message: {
        message_id: 20, chat: { id: 1 }, text: 'ciérralo',
        reply_to_message: {
          message_id: 19,
          text: '💚 TU GENTE\n\nHace 3 semanas sin hablar con Maria Isabel — tu mamá',
          from: { is_bot: true, first_name: 'SIR' },
        },
      },
    })
    expect(r?.replyTo).toEqual({
      messageId: 19,
      text: '💚 TU GENTE\n\nHace 3 semanas sin hablar con Maria Isabel — tu mamá',
      fromBot: true,
    })
  })

  it('marca fromBot=false si se cita un mensaje propio (no aporta contexto)', () => {
    const r = parseTelegramUpdate({
      message: {
        message_id: 21, chat: { id: 1 }, text: 'esto',
        reply_to_message: { message_id: 5, text: 'algo que escribí yo', from: { is_bot: false } },
      },
    })
    expect(r?.replyTo?.fromBot).toBe(false)
  })

  it('usa el caption si el mensaje citado era una foto', () => {
    const r = parseTelegramUpdate({
      message: {
        message_id: 22, chat: { id: 1 }, text: 'sí',
        reply_to_message: { message_id: 6, caption: 'la story de Dayana', from: { is_bot: true } },
      },
    })
    expect(r?.replyTo?.text).toBe('la story de Dayana')
  })

  it('sin cita, replyTo es null (y una cita sin texto tampoco cuenta)', () => {
    expect(parseTelegramUpdate({ message: { message_id: 1, chat: { id: 1 }, text: 'hola' } })?.replyTo).toBeNull()
    expect(parseTelegramUpdate({
      message: { message_id: 2, chat: { id: 1 }, text: 'hola', reply_to_message: { message_id: 1, from: { is_bot: true } } },
    })?.replyTo).toBeNull()
  })

  it('detecta voz y captura el file_id', () => {
    const r = parseTelegramUpdate({ message: { message_id: 2, chat: { id: 9 }, voice: { file_id: 'abc' } } })
    expect(r?.isVoice).toBe(true)
    expect(r?.voiceFileId).toBe('abc')
    expect(r?.text).toBe('')
    expect(r?.chatId).toBe(9)
  })

  it('captura una FOTO (array photo → la más grande) + caption', () => {
    const r = parseTelegramUpdate({ message: {
      message_id: 4, chat: { id: 9 }, caption: 'mira la story',
      photo: [{ file_id: 'small' }, { file_id: 'big' }],
    } })
    expect(r?.photoFileId).toBe('big')
    expect(r?.caption).toBe('mira la story')
  })

  it('captura un document con mime image/* como foto', () => {
    const r = parseTelegramUpdate({ message: { message_id: 5, chat: { id: 9 }, document: { file_id: 'doc1', mime_type: 'image/png' } } })
    expect(r?.photoFileId).toBe('doc1')
  })

  it('un document NO imagen no cuenta como foto', () => {
    expect(parseTelegramUpdate({ message: { message_id: 6, chat: { id: 9 }, document: { file_id: 'd', mime_type: 'application/pdf' } } })).toBeNull()
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

describe('parseTelegramCallback', () => {
  it('parsea el tap de un botón inline', () => {
    const r = parseTelegramCallback({
      callback_query: { id: 'cbq1', data: 'sv|abc|1', message: { message_id: 55, chat: { id: 774532238 } } },
    })
    expect(r).toEqual({ callbackId: 'cbq1', chatId: 774532238, messageId: 55, data: 'sv|abc|1' })
  })

  it('devuelve null si no es callback_query (mensaje normal)', () => {
    expect(parseTelegramCallback({ message: { message_id: 1, chat: { id: 5 }, text: 'hola' } })).toBeNull()
  })

  it('devuelve null sin data o sin chat', () => {
    expect(parseTelegramCallback({ callback_query: { id: 'x', message: { chat: { id: 1 } } } })).toBeNull()
    expect(parseTelegramCallback({ callback_query: { id: 'x', data: 'sv|a|1' } })).toBeNull()
  })

  it('no lanza con basura', () => {
    expect(parseTelegramCallback(null)).toBeNull()
    expect(parseTelegramCallback(42)).toBeNull()
  })
})
