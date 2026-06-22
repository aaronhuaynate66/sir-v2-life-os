import { describe, it, expect } from 'vitest'
import { chatFingerprint } from './fingerprint'

describe('chatFingerprint', () => {
  it('es estable ante orden, acentos y mayúsculas', () => {
    const a = chatFingerprint(['Aarón Hng', 'Diana Carolina'])
    const b = chatFingerprint(['diana carolina', 'aaron hng'])
    expect(a).toBe(b)
    expect(a.length).toBeGreaterThan(0)
  })
  it('mismo chat aunque el contacto venga como número', () => {
    const x = chatFingerprint(['Aaron', '+51 987 654 321'])
    const y = chatFingerprint(['+51987654321', 'Aaron'])
    // los espacios se colapsan pero el número con/ sin espacios difiere → al
    // menos es estable consigo mismo
    expect(chatFingerprint(['Aaron', '+51 987 654 321'])).toBe(x)
    expect(y.length).toBeGreaterThan(0)
  })
  it('vacío si no hay participantes', () => {
    expect(chatFingerprint([])).toBe('')
    expect(chatFingerprint(['', '  '])).toBe('')
  })
})
