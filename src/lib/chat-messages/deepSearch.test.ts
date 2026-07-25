import { describe, it, expect } from 'vitest'
import {
  looksLikeArchiveQuery,
  buildQueryExpansionPrompt,
  parseExpansionQueries,
  mergeSearchHits,
  renderDeepSearchBlock,
} from './deepSearch'

describe('looksLikeArchiveQuery', () => {
  it('dispara con preguntas sobre algo dicho en el chat', () => {
    // Las preguntas REALES de Aaron del 24-jul que produjeron el falso negativo.
    expect(looksLikeArchiveQuery('y luego ella dice que me abonara o pagara algo?')).toBe(true)
    expect(looksLikeArchiveQuery('¿qué me dijo Diana del terreno?')).toBe(true)
    expect(looksLikeArchiveQuery('¿en qué quedamos con el pago?')).toBe(true)
    expect(looksLikeArchiveQuery('revisa el chat con Diana, ¿me debe plata?')).toBe(true)
    expect(looksLikeArchiveQuery('¿alguna vez hablamos de mudarnos?')).toBe(true)
    expect(looksLikeArchiveQuery('busca cuándo mencionó lo del carro')).toBe(true)
  })

  it('NO dispara con preguntas de estado actual ni frases muy cortas', () => {
    expect(looksLikeArchiveQuery('¿cómo está Diana?')).toBe(false)
    expect(looksLikeArchiveQuery('dame un consejo corto')).toBe(false)
    expect(looksLikeArchiveQuery('hola')).toBe(false)
    expect(looksLikeArchiveQuery('')).toBe(false)
  })

  it('no confunde subcadenas dentro de otra palabra', () => {
    // "mando" aparece dentro de "comandos" — \b lo evita.
    expect(looksLikeArchiveQuery('explícame los comandos de la app')).toBe(false)
  })
})

describe('buildQueryExpansionPrompt', () => {
  it('incluye la pregunta, la persona y pide JSON', () => {
    const p = buildQueryExpansionPrompt('¿me dijo que me iba a abonar?', 'Diana')
    expect(p).toContain('Diana')
    expect(p).toContain('abonar')
    expect(p).toContain('array JSON')
  })
})

describe('parseExpansionQueries', () => {
  it('parsea un array JSON', () => {
    expect(parseExpansionQueries('["te debo","yape","deposito"]')).toEqual(['te debo', 'yape', 'deposito'])
  })

  it('parsea JSON con prosa alrededor', () => {
    const raw = 'Claro, aquí van:\n["te debo", "me prestas"]\n¿Te sirve?'
    expect(parseExpansionQueries(raw)).toEqual(['te debo', 'me prestas'])
  })

  it('cae a modo líneas si no hay JSON', () => {
    expect(parseExpansionQueries('- te debo\n- yape\n- deposito')).toEqual(['te debo', 'yape', 'deposito'])
  })

  it('descarta lo inútil: muy corto, muy largo, más de 3 palabras, duplicados', () => {
    const raw = '["ok","te debo","TE DEBO","una frase larguísima que jamás sería una consulta útil de búsqueda","a b c d"]'
    expect(parseExpansionQueries(raw)).toEqual(['te debo'])
  })

  it('respeta el tope', () => {
    expect(parseExpansionQueries('["uno","dos","tres","cuatro"]', 2)).toEqual(['uno', 'dos'])
  })

  it('devuelve [] ante basura', () => {
    expect(parseExpansionQueries('')).toEqual([])
    expect(parseExpansionQueries('no')).toEqual([])
  })
})

describe('mergeSearchHits', () => {
  const hit = (d: string, content: string) => ({ sender: 'other', sent_at: `${d}T10:00:00Z`, content })

  it('round-robin: cada variante aporta su mejor hit antes del segundo de otra', () => {
    const a = [hit('2026-01-01', 'a1'), hit('2026-01-02', 'a2')]
    const b = [hit('2026-05-25', 'b1')]
    const out = mergeSearchHits([a, b], 2).map((h) => h.content)
    // a1 y b1 (los primeros de cada lista), ordenados cronológicamente.
    expect(out).toEqual(['a1', 'b1'])
  })

  it('dedupe por fecha+texto y orden cronológico ascendente', () => {
    const a = [hit('2026-05-25', 'te deposito lo que te debo')]
    const b = [hit('2026-05-25', 'te deposito lo que te debo'), hit('2026-02-01', 'antes')]
    const out = mergeSearchHits([a, b])
    expect(out.map((h) => h.content)).toEqual(['antes', 'te deposito lo que te debo'])
  })

  it('respeta el cap y tolera listas vacías', () => {
    expect(mergeSearchHits([[], []])).toEqual([])
    const many = Array.from({ length: 20 }, (_, i) => hit(`2026-01-${String(i + 1).padStart(2, '0')}`, `m${i}`))
    expect(mergeSearchHits([many], 5)).toHaveLength(5)
  })
})

describe('renderDeepSearchBlock', () => {
  const hits = [{ sender: 'other', sent_at: '2026-05-25T14:00:00Z', content: 'Amor hoy te deposito lo que te debo' }]

  it('sin queries no hay bloque', () => {
    expect(renderDeepSearchBlock(hits, 'Diana', [])).toBe('')
  })

  it('con hits: lista fecha, autor y las palabras usadas', () => {
    const out = renderDeepSearchBlock(hits, 'Diana', ['te debo', 'yape'])
    expect(out).toContain('"te debo", "yape"')
    expect(out).toContain('[2026-05-25] Diana: Amor hoy te deposito')
    expect(out).toContain('NO leíste el hilo completo')
  })

  it('sin hits: prohíbe explícitamente afirmar exhaustividad', () => {
    const out = renderDeepSearchBlock([], 'Diana', ['abonar'])
    expect(out).toContain('CERO coincidencias')
    expect(out).toContain('PROHIBIDO afirmar que revisaste todo el chat')
  })

  it('marca los mensajes propios como Aaron', () => {
    const out = renderDeepSearchBlock(
      [{ sender: 'user', sent_at: '2026-06-26T10:00:00Z', content: 'quedaron pendientes 793.90' }],
      'Diana', ['793'],
    )
    expect(out).toContain('Aaron: quedaron pendientes')
  })
})
