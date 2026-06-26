import { describe, it, expect } from 'vitest'
import { locationTerms, buildEventsQuery, parseGdeltArticles } from './events'
describe('locationTerms', () => {
  it('mapea Arabia Saudí → Saudi Arabia y conserva ciudad', () => {
    const t = locationTerms('Al Khobar, Arabia Saudí')
    expect(t).toContain('Saudi Arabia'); expect(t).toContain('Al Khobar')
  })
})
describe('buildEventsQuery', () => {
  it('arma query con lugares + tema', () => {
    const q = buildEventsQuery('Al Khobar, Arabia Saudí')!
    expect(q).toContain('"Saudi Arabia"'); expect(q.toLowerCase()).toContain('travel')
  })
  it('null si no hay lugar', () => { expect(buildEventsQuery('')).toBeNull() })
})
describe('parseGdeltArticles', () => {
  it('normaliza artículos y fecha', () => {
    const r = parseGdeltArticles({ articles: [{ title: 'X', url: 'http://a', domain: 'a.com', seendate: '20261101T120000Z' }] })
    expect(r[0]).toEqual({ title: 'X', url: 'http://a', domain: 'a.com', date: '2026-11-01' })
  })
  it('descarta sin título/url', () => { expect(parseGdeltArticles({ articles: [{ title: '' }] })).toEqual([]) })
})
