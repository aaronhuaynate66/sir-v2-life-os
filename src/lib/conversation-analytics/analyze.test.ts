import { describe, it, expect } from 'vitest'
import { analyzeConversation, type ConvMsg } from './analyze'

const DAY = 86_400_000
const NOW = 1_780_000_000_000 // epoch fijo (sin Date.now)

/** Genera mensajes: `perWeek` mensajes por semana durante `weeks`, alternando autor. */
function gen(weeks: number, perWeek: number, startDaysAgo: number, opts: { text?: string } = {}): ConvMsg[] {
  const out: ConvMsg[] = []
  const start = NOW - startDaysAgo * DAY
  for (let w = 0; w < weeks; w++) {
    for (let i = 0; i < perWeek; i++) {
      out.push({ fromMe: i % 2 === 0, at: start + w * 7 * DAY + i * 3600_000, text: opts.text ?? `mensaje ${w}-${i}` })
    }
  }
  return out
}

describe('analyzeConversation', () => {
  it('insufficient con <6 mensajes', () => {
    const r = analyzeConversation(gen(1, 2, 30), NOW)
    expect(r.total).toBe(2)
    expect(r.volume).toBeNull()
    expect(r.insufficient).toContain('pocos mensajes (<6)')
  })

  it('cuenta totales y myShare', () => {
    const r = analyzeConversation(gen(4, 4, 30), NOW)
    expect(r.total).toBe(16)
    expect(r.byMe + r.byThem).toBe(16)
    expect(r.myShare).toBeGreaterThan(0)
  })

  it('detecta volumen enfriándose (semanas decrecientes)', () => {
    const msgs: ConvMsg[] = []
    const start = NOW - 60 * DAY
    const perWeek = [10, 8, 5, 3, 1]
    perWeek.forEach((n, w) => { for (let i = 0; i < n; i++) msgs.push({ fromMe: i % 2 === 0, at: start + w * 7 * DAY + i * 3600_000, text: 'x y z w' }) })
    const r = analyzeConversation(msgs, NOW)
    expect(r.volume).not.toBeNull()
    expect(r.volume!.slopePerWeek).toBeLessThan(0)
    expect(r.volume!.direction).toBe('enfriándose')
  })

  it('cadencia y próximo contacto con múltiples sesiones', () => {
    // 3 sesiones separadas ~7 días
    const msgs: ConvMsg[] = []
    for (let s = 0; s < 3; s++) {
      const base = NOW - (30 - s * 7) * DAY
      msgs.push({ fromMe: true, at: base, text: 'hola' }, { fromMe: false, at: base + 120000, text: 'hola!' }, { fromMe: true, at: base + 240000, text: 'todo bien' })
    }
    const r = analyzeConversation(msgs, NOW)
    expect(r.cadence).not.toBeNull()
    expect(r.cadence!.sessions).toBe(3)
    expect(r.cadence!.medianGapDays).toBeGreaterThan(5)
    expect(r.cadence!.nextContactAt).toBeGreaterThan(r.lastAt!)
    // Aaron inició las 3 sesiones
    expect(r.myInitiationShare).toBe(1)
  })

  it('tono positivo vs negativo', () => {
    const pos = analyzeConversation(gen(3, 4, 40, { text: 'gracias genial perfecto 👍' }), NOW)
    const neg = analyzeConversation(gen(3, 4, 40, { text: 'problema error mal tarde 👎' }), NOW)
    expect(pos.tone!.index).toBeGreaterThan(0)
    expect(neg.tone!.index).toBeLessThan(0)
  })

  it('temas: top y rising', () => {
    const msgs: ConvMsg[] = []
    const start = NOW - 40 * DAY
    // viejo: proyecto; reciente: mudanza
    for (let i = 0; i < 8; i++) msgs.push({ fromMe: i % 2 === 0, at: start + i * DAY, text: 'proyecto avance proyecto' })
    for (let i = 0; i < 8; i++) msgs.push({ fromMe: i % 2 === 0, at: NOW - (5 - 0) * DAY + i * 3600_000, text: 'mudanza casa mudanza' })
    const r = analyzeConversation(msgs, NOW)
    expect(r.topics).not.toBeNull()
    expect(r.topics!.top).toContain('proyecto')
    expect(r.topics!.rising).toContain('mudanza')
  })

  it('temas: excluye ruido de WhatsApp ([media] y URLs)', () => {
    const msgs: ConvMsg[] = []
    const start = NOW - 40 * DAY
    // Muchos [media] + URLs mezclados con un tema real ("cumpleaños").
    for (let i = 0; i < 10; i++) msgs.push({ fromMe: i % 2 === 0, at: start + i * DAY, text: '[media]' })
    for (let i = 0; i < 6; i++) msgs.push({ fromMe: i % 2 === 0, at: start + (i + 10) * DAY, text: 'mira https://youtu.be/abc123 www.ejemplo.com' })
    for (let i = 0; i < 6; i++) msgs.push({ fromMe: i % 2 === 0, at: NOW - (6 - i) * DAY, text: 'cumpleaños fiesta cumpleaños' })
    const r = analyzeConversation(msgs, NOW)
    expect(r.topics).not.toBeNull()
    expect(r.topics!.top).toContain('cumpleanos')
    expect(r.topics!.top).not.toContain('media')
    expect(r.topics!.top).not.toContain('https')
    expect(r.topics!.top).not.toContain('www')
    expect(r.topics!.top).not.toContain('ejemplo') // dominio de la URL, tampoco
  })

  it('temas: fading (lo que se dejó de hablar)', () => {
    const msgs: ConvMsg[] = []
    const start = NOW - 40 * DAY
    // "proyecto" muy hablado al principio, desaparece; "mudanza" aparece al final.
    for (let i = 0; i < 8; i++) msgs.push({ fromMe: i % 2 === 0, at: start + i * DAY, text: 'proyecto avance proyecto' })
    for (let i = 0; i < 8; i++) msgs.push({ fromMe: i % 2 === 0, at: NOW - 5 * DAY + i * 3600_000, text: 'mudanza casa mudanza' })
    const r = analyzeConversation(msgs, NOW)
    expect(r.topics!.fading).toContain('proyecto')
    expect(r.topics!.fading).not.toContain('mudanza') // mudanza sube, no baja
  })
})
