// SIR V2 — Capa de contexto externo (Motor #8 fase 2): eventos por LUGAR.
// Construye la consulta a GDELT desde la ubicación de un objetivo-viaje y
// normaliza los artículos. PURO (la red vive en la ruta). Regla del #8:
// PROPONE, no afirma — esto es contexto a confirmar, no una alarma.

export interface ExternalEvent {
  title: string
  url: string
  domain: string
  date: string | null   // ISO YYYY-MM-DD
}

// Mapas mínimos es→en para que GDELT (mayormente inglés) matchee países comunes.
const COUNTRY_ES_EN: Record<string, string> = {
  'arabia saudi': 'Saudi Arabia', 'arabia saudita': 'Saudi Arabia',
  'peru': 'Peru', 'venezuela': 'Venezuela', 'espana': 'Spain', 'estados unidos': 'United States',
}
const STRIP = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Tokens útiles de una ubicación libre ("Al Khobar, Arabia Saudí") → términos de búsqueda. */
export function locationTerms(location: string): string[] {
  const parts = location.split(',').map((p) => p.trim()).filter(Boolean)
  const terms = new Set<string>()
  for (const p of parts) {
    const en = COUNTRY_ES_EN[STRIP(p)]
    if (en) terms.add(en)
    if (p.split(/\s+/).length <= 3 && p.length >= 4) terms.add(p)
  }
  return Array.from(terms)
}

/** Query GDELT: (lugares) AND (tema viaje/seguridad). Vacío si no hay lugar. */
export function buildEventsQuery(location: string): string | null {
  const terms = locationTerms(location)
  if (terms.length === 0) return null
  const places = terms.map((t) => (t.includes(' ') ? `"${t}"` : t)).join(' OR ')
  return `(${places}) (travel OR airport OR flight OR security OR unrest OR conflict OR advisory)`
}

/** Normaliza la respuesta artlist de GDELT a ExternalEvent[]. */
export function parseGdeltArticles(raw: unknown, max = 4): ExternalEvent[] {
  const arts = (raw as { articles?: unknown })?.articles
  if (!Array.isArray(arts)) return []
  const out: ExternalEvent[] = []
  for (const a of arts) {
    const o = a as { title?: unknown; url?: unknown; domain?: unknown; seendate?: unknown }
    const title = typeof o.title === 'string' ? o.title.trim() : ''
    const url = typeof o.url === 'string' ? o.url : ''
    if (!title || !url) continue
    let date: string | null = null
    if (typeof o.seendate === 'string') {
      const m = o.seendate.match(/^(\d{4})(\d{2})(\d{2})/)
      if (m) date = `${m[1]}-${m[2]}-${m[3]}`
    }
    out.push({ title, url, domain: typeof o.domain === 'string' ? o.domain : '', date })
    if (out.length >= max) break
  }
  return out
}
