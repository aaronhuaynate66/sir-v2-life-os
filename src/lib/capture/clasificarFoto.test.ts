// SIR V2 — Tests del clasificador de fotos de Telegram.
//
// Aaron, 2-ago-2026: *"hay cosas que le envié a SIR por Telegram y no pudo
// identificar"*. El webhook mandaba toda foto al detector social y, si no era una
// story, la DESCARTABA sin dejar rastro. La regla que estos tests protegen: nada
// de lo que él manda se descarta.
import { describe, it, expect } from 'vitest'
import {
  parseFotoClasificada, necesitaRevision, respuestaDeFoto, CLASIFICAR_FOTO_PROMPT,
  type FotoClasificada,
} from './clasificarFoto'

const ok = (tipo: string, texto: string, resumen = 'algo') =>
  JSON.stringify({ tipo, texto, resumen })

describe('la regla dura: NUNCA se pierde', () => {
  it('un JSON roto igual devuelve algo guardable, no null', () => {
    const f = parseFotoClasificada('esto no es json {{{')
    expect(f.tipo).toBe('unknown')
    expect(f.texto).toContain('esto no es json')
    expect(f.resumen).toContain('guardé')
  })

  it('una respuesta vacía tampoco rompe', () => {
    expect(parseFotoClasificada('').tipo).toBe('unknown')
    expect(parseFotoClasificada(null as unknown as string).tipo).toBe('unknown')
  })

  it('un tipo inventado por el modelo cae a unknown, no se propaga', () => {
    expect(parseFotoClasificada(ok('recibo_de_luz', 'texto')).tipo).toBe('unknown')
  })

  it('la respuesta al usuario SIEMPRE dice que quedó guardado', () => {
    for (const t of ['scale', 'manual_note', 'dm_conversation', 'unknown']) {
      expect(respuestaDeFoto(parseFotoClasificada(ok(t, 'algo de texto')))).toMatch(/[Gg]uardad/)
    }
  })
})

describe('clasificación', () => {
  it('lee el tipo y el texto', () => {
    const f = parseFotoClasificada(ok('scale', 'Peso 81.6 kg\nGrasa 25.2%', 'Báscula del 2-ago'))
    expect(f.tipo).toBe('scale')
    expect(f.texto).toContain('81.6')
    expect(f.resumen).toBe('Báscula del 2-ago')
  })

  it('tolera markdown y prosa alrededor del JSON', () => {
    const f = parseFotoClasificada('```json\n' + ok('manual_note', 'Hemoglobina 14.2') + '\n```')
    expect(f.tipo).toBe('manual_note')
    expect(f.texto).toContain('Hemoglobina')
  })

  it('acota textos gigantes en vez de reventar', () => {
    const f = parseFotoClasificada(ok('manual_note', 'x'.repeat(50_000)))
    expect(f.texto.length).toBeLessThanOrEqual(8000)
  })
})

describe('qué merece revisión a mano', () => {
  it('lo desconocido y lo que no dejó texto', () => {
    expect(necesitaRevision({ tipo: 'unknown', texto: 'algo', resumen: '' })).toBe(true)
    expect(necesitaRevision({ tipo: 'manual_note', texto: '   ', resumen: '' })).toBe(true)
  })

  it('una captura entendida y con texto no molesta', () => {
    expect(necesitaRevision({ tipo: 'scale', texto: 'Peso 81.6', resumen: '' })).toBe(false)
  })
})

describe('lo que le responde', () => {
  it('sin texto, le pide que le diga qué es', () => {
    const f: FotoClasificada = { tipo: 'unknown', texto: '', resumen: 'x' }
    expect(respuestaDeFoto(f)).toContain('¿Qué es?')
  })

  it('con texto pero sin tipo, avisa que lo dejó anotado', () => {
    const f: FotoClasificada = { tipo: 'unknown', texto: 'Dr. Campos Soto', resumen: 'x' }
    expect(respuestaDeFoto(f)).toContain('le saqué el texto')
  })

  it('nunca repite el "no parece una story" que descartaba', () => {
    for (const t of ['scale', 'manual_note', 'unknown']) {
      expect(respuestaDeFoto(parseFotoClasificada(ok(t, 'x')))).not.toContain('no parece')
    }
  })
})

describe('el prompt', () => {
  it('exige transcribir SIEMPRE, aunque no sepa el tipo', () => {
    expect(CLASIFICAR_FOTO_PROMPT).toContain('OBLIGATORIO')
    expect(CLASIFICAR_FOTO_PROMPT).toContain('aunque el tipo sea "unknown"')
  })

  it('ante la duda manda a manual_note, no a unknown', () => {
    expect(CLASIFICAR_FOTO_PROMPT).toContain('elige "manual_note"')
  })

  it('prohíbe inventar y pide español peruano', () => {
    expect(CLASIFICAR_FOTO_PROMPT).toContain('NO inventes')
    expect(CLASIFICAR_FOTO_PROMPT).toContain('Nada de voseo')
  })
})
