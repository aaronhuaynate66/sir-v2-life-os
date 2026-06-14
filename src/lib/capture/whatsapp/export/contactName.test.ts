import { describe, it, expect } from 'vitest'
import { cleanExportFileName, inferContactName } from './contactName'

describe('cleanExportFileName', () => {
  it('quita el prefijo "WhatsApp Chat - " y la extensión .zip', () => {
    expect(cleanExportFileName('WhatsApp Chat - Fernando Brañes Papa.zip')).toBe(
      'Fernando Brañes Papa',
    )
  })

  it('quita el prefijo en español y la extensión .txt', () => {
    expect(cleanExportFileName('Chat de WhatsApp con Ana Pérez.txt')).toBe('Ana Pérez')
  })

  it('quita el sufijo de hash que agregan los uploads', () => {
    expect(cleanExportFileName('WhatsApp Chat - Nicolle Huaynate Espinoza-528af339.zip')).toBe(
      'Nicolle Huaynate Espinoza',
    )
  })

  it('deja intacto un nombre sin prefijos conocidos', () => {
    expect(cleanExportFileName('lau_113@hotmail.com.zip')).toBe('lau_113@hotmail.com')
  })
})

describe('inferContactName', () => {
  it('prioriza el nombre del archivo', () => {
    expect(
      inferContactName({
        fileName: 'WhatsApp Chat - Victor Rodriguez.zip',
        participants: ['Aaron Huaynate', 'Victor Rodriguez'],
      }),
    ).toBe('Victor Rodriguez')
  })

  it('devuelve el display EXACTO del participante cuando matchea (mejor casing)', () => {
    // El archivo trae "ana perez" pero el participante tiene acentos/casing.
    expect(
      inferContactName({
        fileName: 'WhatsApp Chat - ana perez.zip',
        participants: ['Aaron', 'Ana Pérez'],
      }),
    ).toBe('Ana Pérez')
  })

  it('sin pista de archivo y un solo participante, devuelve ese', () => {
    expect(inferContactName({ participants: ['Delicia Paredes'] })).toBe('Delicia Paredes')
  })

  it('sin archivo ni participantes, devuelve cadena vacía', () => {
    expect(inferContactName({})).toBe('')
  })
})
