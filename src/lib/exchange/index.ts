// SIR V2 — Exchange rate service (USD <-> PEN)
//
// Public, free-tier endpoint open.er-api.com. No API key required.
// Cached in memory by ISO date (YYYY-MM-DD) so a session that picks
// USD multiple times only hits the network once per day. On any failure
// (offline, timeout, malformed response) the service falls back to a
// hardcoded PEN rate and signals it via isFallback so callers can warn
// the user.
//
// Client-side only. The fetch runs in the browser; AbortSignal.timeout
// guards against hung requests.

const EXCHANGE_API_BASE = 'https://open.er-api.com/v6/latest'
export const FALLBACK_USD_PEN = 3.76
export const EXCHANGE_TIMEOUT_MS = 5000

interface CachedRate {
  date: string
  rate: number
}

const cache = new Map<string, CachedRate>()

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

export interface FetchRateResult {
  rate: number
  isFallback: boolean
  cached: boolean
}

export async function fetchUsdToPenRate(): Promise<FetchRateResult> {
  const key = 'USD_PEN'
  const today = todayISO()
  const cached = cache.get(key)
  if (cached && cached.date === today) {
    return { rate: cached.rate, isFallback: false, cached: true }
  }

  try {
    const res = await fetch(`${EXCHANGE_API_BASE}/USD`, {
      signal: AbortSignal.timeout(EXCHANGE_TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data: unknown = await res.json()
    const rate = extractPenRate(data)
    if (rate === null) throw new Error('PEN rate missing in API response')
    cache.set(key, { date: today, rate })
    return { rate, isFallback: false, cached: false }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[exchange] USD->PEN fetch failed, using fallback', err)
    return { rate: FALLBACK_USD_PEN, isFallback: true, cached: false }
  }
}

function extractPenRate(data: unknown): number | null {
  if (!data || typeof data !== 'object') return null
  const rates = (data as { rates?: unknown }).rates
  if (!rates || typeof rates !== 'object') return null
  const pen = (rates as { PEN?: unknown }).PEN
  return typeof pen === 'number' && pen > 0 ? pen : null
}
