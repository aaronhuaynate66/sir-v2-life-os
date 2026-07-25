import { describe, it, expect } from 'vitest'
import { buildBriefThread } from './briefThread'
import type { MorningSignal } from '@/lib/push/morning'

const s = (section: MorningSignal['section'], text: string, slot = 'x'): MorningSignal => ({ slot, section, text })

describe('buildBriefThread', () => {
  it('parte en un mensaje por sección, en orden hoy → gente → metas', () => {
    const out = buildBriefThread([
      s('metas', 'Boticas Jhodaal cierra en 6 días y vas 0%'),
      s('gente', 'Hace 3 semanas sin hablar con tu mamá'),
      s('hoy', 'Hoy vence: UAT con Dayana'),
    ])
    expect(out.map((m) => m.section)).toEqual(['hoy', 'gente', 'metas'])
    expect(out[0].text).toContain('⚡ HOY')
    expect(out[1].text).toContain('💚 TU GENTE')
    expect(out[2].text).toContain('🎯 TUS METAS')
  })

  it('saluda solo en el primero y cierra solo en el último', () => {
    const out = buildBriefThread([s('hoy', 'a'), s('gente', 'b'), s('metas', 'c')])
    expect(out[0].text.startsWith('🌿 Buen día')).toBe(true)
    expect(out[1].text).not.toContain('Buen día')
    expect(out[2].text).toContain('Responde a cualquiera')
    expect(out[0].text).not.toContain('Responde a cualquiera')
  })

  it('con una sola sección, saludo y cierre van en el mismo mensaje', () => {
    const [only] = buildBriefThread([s('hoy', 'Hoy vence: UAT con Dayana')])
    expect(only.text).toContain('🌿 Buen día')
    expect(only.text).toContain('Responde a cualquiera')
    expect(only.text).toContain('Hoy vence: UAT con Dayana')
  })

  it('una señal va pelada; varias van con viñeta', () => {
    const [uno] = buildBriefThread([s('hoy', 'solo esto')])
    expect(uno.text).not.toContain('· solo esto')
    const [dos] = buildBriefThread([s('hoy', 'primero'), s('hoy', 'segundo')])
    expect(dos.text).toContain('· primero')
    expect(dos.text).toContain('· segundo')
  })

  it('secciones vacías no generan mensaje; sin señales devuelve []', () => {
    expect(buildBriefThread([]).length).toBe(0)
    expect(buildBriefThread([s('gente', 'x')]).length).toBe(1)
  })

  it('ignora señales sin texto', () => {
    expect(buildBriefThread([s('hoy', ''), s('gente', 'ok')]).length).toBe(1)
  })

  it('ningún mensaje se acerca al límite de Telegram', () => {
    const many = Array.from({ length: 8 }, (_, i) => s('gente', `señal larga número ${i} `.repeat(10)))
    for (const m of buildBriefThread(many)) expect(m.text.length).toBeLessThan(4000)
  })
})
