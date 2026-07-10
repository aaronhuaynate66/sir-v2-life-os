// SIR V2 — Tests del cruce por ubicación (proximity).

import { describe, it, expect } from 'vitest'

import {
  normalizeZone,
  buildProximityClusters,
  zoneMatesOf,
  type ProximityPerson,
} from './proximity'

function person(over: Partial<ProximityPerson> & { id: string }): ProximityPerson {
  return {
    name: over.name ?? over.id,
    ...over,
  }
}

describe('normalizeZone', () => {
  it('separa distrito (token fino) y ciudad', () => {
    expect(normalizeZone('Barranco, Lima')).toEqual({
      key: 'barranco',
      label: 'Barranco',
      city: 'Lima',
    })
  })

  it('un solo segmento → sólo zona, sin ciudad', () => {
    expect(normalizeZone('Miraflores')).toEqual({ key: 'miraflores', label: 'Miraflores' })
  })

  it('deburr: acentos y mayúsculas no rompen el agrupamiento', () => {
    expect(normalizeZone('  SÁN Isidro , Lima ')?.key).toBe('san isidro')
  })

  it('vacío / basura → null', () => {
    expect(normalizeZone('')).toBeNull()
    expect(normalizeZone(undefined)).toBeNull()
    expect(normalizeZone(null)).toBeNull()
    expect(normalizeZone('  ,  ')).toBeNull()
  })

  it('junta segmentos extra como ciudad', () => {
    expect(normalizeZone('Barranco, Lima, Perú')).toEqual({
      key: 'barranco',
      label: 'Barranco',
      city: 'Lima, Perú',
    })
  })
})

describe('buildProximityClusters', () => {
  it('agrupa 2+ personas de la misma zona', () => {
    const clusters = buildProximityClusters([
      person({ id: 'a', name: 'Diana', location: 'Barranco, Lima' }),
      person({ id: 'b', name: 'Juan', location: 'Barranco, Lima' }),
    ])
    expect(clusters).toHaveLength(1)
    expect(clusters[0].zoneLabel).toBe('Barranco')
    expect(clusters[0].city).toBe('Lima')
    expect(clusters[0].people.map((p) => p.name)).toEqual(['Diana', 'Juan'])
  })

  it('NO inventa cercanía: personas en zonas distintas → sin clusters', () => {
    const clusters = buildProximityClusters([
      person({ id: 'a', location: 'Barranco, Lima' }),
      person({ id: 'b', location: 'Miraflores, Lima' }),
    ])
    expect(clusters).toEqual([])
  })

  it('distrito fino no se funde con ciudad genérica', () => {
    // "Barranco, Lima" vs "Lima" a secas: distritos distintos → no agrupan.
    const clusters = buildProximityClusters([
      person({ id: 'a', location: 'Barranco, Lima' }),
      person({ id: 'b', location: 'Lima' }),
    ])
    expect(clusters).toEqual([])
  })

  it('ignora personas sin ubicación', () => {
    const clusters = buildProximityClusters([
      person({ id: 'a', location: 'Surco' }),
      person({ id: 'b' }),
      person({ id: 'c', location: '' }),
    ])
    expect(clusters).toEqual([])
  })

  it('ordena personas del cluster por importancia desc', () => {
    const clusters = buildProximityClusters([
      person({ id: 'a', name: 'Ana', location: 'Surco', importanceScore: 3 }),
      person({ id: 'b', name: 'Beto', location: 'Surco', importanceScore: 9 }),
    ])
    expect(clusters[0].people.map((p) => p.name)).toEqual(['Beto', 'Ana'])
  })

  it('ordena clusters por tamaño desc', () => {
    const clusters = buildProximityClusters([
      person({ id: 'a', location: 'Surco' }),
      person({ id: 'b', location: 'Surco' }),
      person({ id: 'c', location: 'Barranco' }),
      person({ id: 'd', location: 'Barranco' }),
      person({ id: 'e', location: 'Barranco' }),
    ])
    expect(clusters.map((c) => c.zoneLabel)).toEqual(['Barranco', 'Surco'])
  })

  it('respeta maxClusters', () => {
    const clusters = buildProximityClusters(
      [
        person({ id: 'a', location: 'Surco' }),
        person({ id: 'b', location: 'Surco' }),
        person({ id: 'c', location: 'Barranco' }),
        person({ id: 'd', location: 'Barranco' }),
      ],
      { maxClusters: 1 },
    )
    expect(clusters).toHaveLength(1)
  })

  it('respeta minClusterSize', () => {
    const clusters = buildProximityClusters(
      [
        person({ id: 'a', location: 'Surco' }),
        person({ id: 'b', location: 'Surco' }),
        person({ id: 'c', location: 'Surco' }),
      ],
      { minClusterSize: 3 },
    )
    expect(clusters).toHaveLength(1)
    expect(clusters[0].people).toHaveLength(3)
  })

  it('lista vacía → []', () => {
    expect(buildProximityClusters([])).toEqual([])
  })
})

describe('zoneMatesOf', () => {
  const people = [
    person({ id: 'a', name: 'Diana', location: 'Barranco, Lima', importanceScore: 5 }),
    person({ id: 'b', name: 'Juan', location: 'Barranco', importanceScore: 8 }),
    person({ id: 'c', name: 'Pedro', location: 'Miraflores' }),
  ]

  it('devuelve los otros de la misma zona, sin la propia persona', () => {
    const res = zoneMatesOf(people[0], people)
    expect(res).not.toBeNull()
    expect(res!.zone.key).toBe('barranco')
    expect(res!.mates.map((p) => p.name)).toEqual(['Juan'])
  })

  it('nadie más en la zona → null', () => {
    const res = zoneMatesOf(people[2], people)
    expect(res).toBeNull()
  })

  it('persona sin ubicación → null', () => {
    const res = zoneMatesOf(person({ id: 'x' }), people)
    expect(res).toBeNull()
  })
})
