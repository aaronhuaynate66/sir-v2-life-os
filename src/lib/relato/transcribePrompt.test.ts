// SIR V2 — Tests de la capa pura de transcripción por foto del relato.

import { describe, it, expect } from 'vitest'
import { RELATO_TRANSCRIBE_SYSTEM_PROMPT, cleanTranscription, NO_DATA_SENTINEL } from './transcribePrompt'

describe('RELATO_TRANSCRIBE_SYSTEM_PROMPT', () => {
  it('pide no inventar y fechas explícitas', () => {
    expect(RELATO_TRANSCRIBE_SYSTEM_PROMPT).toMatch(/NO inventes/i)
    expect(RELATO_TRANSCRIBE_SYSTEM_PROMPT).toContain('cumple el 31 de julio')
    expect(RELATO_TRANSCRIBE_SYSTEM_PROMPT).toContain(NO_DATA_SENTINEL)
  })
})

describe('cleanTranscription', () => {
  it('devuelve el texto tal cual si es útil', () => {
    expect(cleanTranscription('Alex Heilbrunn cumple el 31 de julio.')).toBe('Alex Heilbrunn cumple el 31 de julio.')
  })
  it('quita fences', () => {
    expect(cleanTranscription('```\nWalter Heilbrunn cumple el 31 de julio.\n```')).toBe('Walter Heilbrunn cumple el 31 de julio.')
  })
  it('null si viene el sentinel SIN_DATOS', () => {
    expect(cleanTranscription('SIN_DATOS')).toBeNull()
    expect(cleanTranscription('  sin_datos  ')).toBeNull()
  })
  it('null si viene vacío', () => {
    expect(cleanTranscription('')).toBeNull()
    expect(cleanTranscription('   ')).toBeNull()
  })
  it('recorta a max con elipsis', () => {
    const out = cleanTranscription('a'.repeat(50), 10)
    expect(out).toBe('aaaaaaaaaa…')
  })
})
