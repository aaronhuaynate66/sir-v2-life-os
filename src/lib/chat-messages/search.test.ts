import { describe, it, expect } from 'vitest'
import { extractSearchTerms, renderChatSearchBlock, type ChatSearchHit } from './search'

describe('extractSearchTerms', () => {
  it('saca términos salientes, sin tildes ni stopwords, más largos primero', () => {
    const t = extractSearchTerms('¿Qué me dijo mi papá sobre el terreno de Chosica?')
    expect(t).toContain('terreno')
    expect(t).toContain('chosica')
    // stopwords fuera
    expect(t).not.toContain('sobre')
    expect(t).not.toContain('dijo')
    // sin palabras cortas
    expect(t.every((w) => w.length >= 4)).toBe(true)
  })

  it('quita tildes (normaliza) para matchear el índice', () => {
    const t = extractSearchTerms('cuándo fue la operación de mamá')
    expect(t).toContain('operacion')
  })

  it('devuelve [] para una consulta trivial', () => {
    expect(extractSearchTerms('¿y eso por qué?')).toEqual([])
    expect(extractSearchTerms('')).toEqual([])
  })

  it('cap al máximo pedido', () => {
    const t = extractSearchTerms('terreno chosica herencia abogado notaria escritura testamento', 3)
    expect(t).toHaveLength(3)
  })
})

describe('renderChatSearchBlock', () => {
  const hits: ChatSearchHit[] = [
    { sender: 'other', sent_at: '2022-05-01T10:00:00Z', content: 'el terreno de Chosica sigue en trámite' },
    { sender: 'user', sent_at: '2022-03-01T10:00:00Z', content: 'avanzaste con lo del terreno?' },
  ]
  it('arma el bloque en orden cronológico con nombres', () => {
    const b = renderChatSearchBlock(hits, 'Papá')
    expect(b).toMatch(/relevantes a la consulta/i)
    // el de marzo (más viejo) va antes que el de mayo
    expect(b.indexOf('avanzaste')).toBeLessThan(b.indexOf('sigue en trámite'))
    expect(b).toContain('Aaron: avanzaste')
    expect(b).toContain('Papá: el terreno')
  })
  it("'' si no hay hits", () => {
    expect(renderChatSearchBlock([], 'X')).toBe('')
  })
})
