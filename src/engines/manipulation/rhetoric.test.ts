// SIR V2 — Tests de la capa retórica del detector (16·M3, técnicas de propaganda).

import { describe, it, expect } from 'vitest'
import { detectRhetoric, detectManipulation } from './index'
import { TECHNIQUES } from './techniques'

function ids(text: string): string[] {
  return detectRhetoric(text).hits.map((h) => h.id)
}

describe('detectRhetoric — técnicas con firma léxica', () => {
  it('falso dilema', () => {
    expect(ids('O estás conmigo o estás en contra.')).toContain('false_dilemma')
  })
  it('whataboutism', () => {
    expect(ids('¿Me criticás a mí? Mirá quién habla.')).toContain('whataboutism')
  })
  it('apelación a la autoridad (propaganda)', () => {
    expect(ids('Los expertos dicen que es la única forma. Está comprobado.')).toContain('appeal_to_authority')
  })
  it('efecto arrastre (bandwagon)', () => {
    expect(ids('Todos lo hacen, no te quedes afuera.')).toContain('bandwagon')
  })
  it('cliché que corta el pensamiento', () => {
    expect(ids('No le des más vueltas, es lo que hay.')).toContain('thought_terminating')
  })
  it('apelación a la costumbre', () => {
    expect(ids('Siempre se hizo así, no vamos a cambiar ahora.')).toContain('appeal_to_popularity')
  })
  it('culpa por asociación', () => {
    expect(ids('Eso que proponés es de dictadores.')).toContain('reductio_ad_hitlerum')
  })
  it('ataque a la persona (ad hominem)', () => {
    expect(ids('¿Vos qué sabés? No tenés autoridad moral para opinar.')).toContain('ad_hominem')
  })
  it('funciona sin acentos', () => {
    expect(ids('o estas conmigo o estas en contra')).toContain('false_dilemma')
  })
  it('texto neutro → sin hits', () => {
    expect(detectRhetoric('¿Nos juntamos el viernes a almorzar?').hits).toHaveLength(0)
  })
  it('la evidencia conserva el original', () => {
    const h = detectRhetoric('Es lo que hay.').hits.find((x) => x.id === 'thought_terminating')
    expect(h?.evidence[0]?.toLowerCase()).toContain('es lo que hay')
  })
})

describe('la capa retórica NO afecta el riesgo de phishing', () => {
  it('un mensaje puramente retórico no dispara riesgo de ingeniería social', () => {
    const r = detectManipulation('Todos lo hacen, siempre se hizo así, es lo que hay.')
    expect(r.risk).toBe('none') // sin gatillos Cialdini
  })
})

describe('catálogo de técnicas', () => {
  it('tiene las 23 técnicas con id/label/categoría únicos', () => {
    expect(TECHNIQUES).toHaveLength(23)
    const ids = new Set(TECHNIQUES.map((t) => t.id))
    expect(ids.size).toBe(23)
    for (const t of TECHNIQUES) {
      expect(t.label.length).toBeGreaterThan(0)
      expect(t.definition.length).toBeGreaterThan(0)
    }
  })
})
