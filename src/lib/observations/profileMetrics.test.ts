import { describe, it, expect } from 'vitest'
import { profileMetricSeries, lastDelta, type ProfileMetricPoint } from './profileMetrics'

const pts: ProfileMetricPoint[] = [
  { observedAt: '2026-06-10T15:00:00.000Z', followers: 1346, following: 1375, posts: 23 },
  { observedAt: '2026-06-18T15:00:00.000Z', followers: 1344, following: 1381, posts: 23 },
]

describe('profileMetricSeries', () => {
  it('arma serie de seguidores por día', () => {
    const s = profileMetricSeries(pts, 'followers')
    expect(s.map((x) => x.value)).toEqual([1346, 1344])
  })
  it('descarta puntos sin el campo', () => {
    const s = profileMetricSeries([{ observedAt: '2026-06-10T15:00:00Z', followers: null, following: 10, posts: null }], 'followers')
    expect(s).toHaveLength(0)
  })
})

describe('lastDelta', () => {
  it('seguidores: 1346 → 1344 = -2', () => {
    expect(lastDelta(profileMetricSeries(pts, 'followers'))).toBe(-2)
  })
  it('seguidos: 1375 → 1381 = +6', () => {
    expect(lastDelta(profileMetricSeries(pts, 'following'))).toBe(6)
  })
  it('un solo punto → null', () => {
    expect(lastDelta(profileMetricSeries([pts[0]], 'followers'))).toBeNull()
  })
})
