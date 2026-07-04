// SIR V2 — "Qué le importa a esta persona" (15·8).
//
// Base científica: mantenimiento relacional — el contacto que rinde es el que le
// habla a lo que a la persona le importa, no genérico (ver `docs/15`). Este motor
// destila, de forma PURA y determinística, los TEMAS RECURRENTES de las memorias
// de una persona: los términos distintivos que aparecen ≥2 veces. No es "sus
// valores profundos" (eso lo infiere el LLM en /plantear y /ensayo) — es una
// pista barata y siempre disponible de "por dónde va", para que el contacto sea
// real. Honesto: es frecuencia, no significado; se rotula como "temas recurrentes".

function deburr(s: string): string {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

// Stopwords ES: artículos/preposiciones/conectores/pronombres + verbos y
// palabras genéricas de "relato" que generarían ruido.
const STOP = new Set([
  'por', 'para', 'con', 'sin', 'los', 'las', 'una', 'uno', 'unos', 'unas', 'del', 'que',
  'como', 'mas', 'pero', 'sus', 'esa', 'ese', 'eso', 'esto', 'esta', 'estos', 'estas',
  'aquel', 'aquella', 'porque', 'cuando', 'donde', 'quien', 'cual', 'cuales', 'entre',
  'sobre', 'desde', 'hasta', 'muy', 'todo', 'toda', 'todos', 'todas', 'algo', 'nada',
  'poco', 'mucho', 'mucha', 'tanto', 'cada', 'otro', 'otra', 'otros', 'otras', 'mismo',
  'tambien', 'ademas', 'entonces', 'ahora', 'antes', 'despues', 'siempre', 'nunca',
  'hoy', 'ayer', 'manana', 'dia', 'dias', 'vez', 'veces', 'ano', 'anos', 'mes', 'meses',
  'ser', 'estar', 'tener', 'hacer', 'haber', 'decir', 'poder', 'querer', 'saber', 'dar',
  'esta', 'estan', 'estaba', 'tiene', 'tienen', 'tenia', 'hace', 'hizo', 'dice', 'dijo',
  'fue', 'fueron', 'sido', 'son', 'era', 'eran', 'hay', 'muy', 'bien', 'mal', 'asi',
  'ella', 'ellos', 'ellas', 'nos', 'les', 'me', 'te', 'mi', 'tu', 'su',
  // genéricas de relato (ruido)
  'persona', 'gente', 'cosa', 'cosas', 'tema', 'temas', 'momento', 'situacion', 'charla',
  'conversacion', 'nota', 'importa', 'importante', 'sobre',
])

export interface WhatMattersTheme { term: string; count: number }
export interface WhatMattersResult {
  themes: WhatMattersTheme[]
  /** Tags curados de la persona (señal de "qué le importa" de mayor confianza). */
  tags: string[]
}

interface Opts {
  tags?: string[]
  /** Nombre de la persona → sus tokens se excluyen (no son un "tema"). */
  excludeName?: string
  max?: number
  /** Frecuencia mínima para considerar un tema RECURRENTE. Default 2. */
  minCount?: number
}

/**
 * Extrae los temas recurrentes de las memorias de una persona. Determinístico.
 * `memories` = textos de memorias VISIBLES (lo privado nunca debería llegar acá).
 */
export function extractWhatMatters(memories: string[], opts: Opts = {}): WhatMattersResult {
  const max = opts.max ?? 8
  const minCount = opts.minCount ?? 2
  const exclude = new Set(deburr(opts.excludeName ?? '').split(/[^a-z0-9]+/).filter((w) => w.length >= 3))

  const count = new Map<string, number>()
  const firstIndex = new Map<string, number>()
  let seen = 0
  for (const mem of memories) {
    const toks = deburr(mem).split(/[^a-z0-9]+/)
    // Dentro de UNA memoria, contamos cada término una sola vez (evita que una
    // memoria repetitiva infle un término).
    const inThis = new Set<string>()
    for (const w of toks) {
      if (w.length < 4 || STOP.has(w) || exclude.has(w) || /^\d+$/.test(w)) continue
      if (inThis.has(w)) continue
      inThis.add(w)
      count.set(w, (count.get(w) ?? 0) + 1)
      if (!firstIndex.has(w)) firstIndex.set(w, seen)
      seen++
    }
  }

  const themes: WhatMattersTheme[] = [...count.entries()]
    .filter(([, c]) => c >= minCount)
    .sort((a, b) => b[1] - a[1] || (firstIndex.get(a[0]) ?? 0) - (firstIndex.get(b[0]) ?? 0))
    .slice(0, max)
    .map(([term, c]) => ({ term, count: c }))

  const tags = (opts.tags ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 8)
  return { themes, tags }
}
