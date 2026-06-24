import { describe, it, expect } from 'vitest'
import { episodeKeywords } from './keywords'

describe('episodeKeywords', () => {
  it('saca las distintivas y descarta genéricas/stopwords', () => {
    expect(episodeKeywords('Conflicto por el Mundial de Bomberos')).toEqual(['mundial', 'bomberos'])
  })
  it('suma del detalle, dedup y acentos', () => {
    const k = episodeKeywords('Pelea', 'Birmingham y el campeonato; Birmingham otra vez')
    expect(k).toContain('birmingham')
    expect(k).toContain('campeonato')
    expect(k.filter((x) => x === 'birmingham')).toHaveLength(1)
  })
  it('respeta el cap', () => {
    expect(episodeKeywords('alfa beta gamma delta epsilon zeta eta', '').length).toBe(6)
  })
  it('vacío seguro', () => {
    expect(episodeKeywords('', '')).toEqual([])
  })
})
