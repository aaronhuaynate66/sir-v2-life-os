// SIR V2 — Decisiones pasadas parecidas (14·M5). PURO.
//
// El outside view (Kahneman) contra la planning fallacy: al evaluar una decisión,
// recuperar las previas SIMILARES y, si guardaste cómo salieron, traerlo. La
// similitud combina solapamiento de palabras (título+contexto) con coincidencia
// de la dimensión de mayor riesgo. Determinístico, sin IA.

export interface PastDecision {
  id: string
  title: string
  description?: string | null
  verdict: 'go' | 'caution' | 'hold'
  topRisk?: string | null
  outcome?: string | null
  createdAt: string
}

export interface SimilarMatch {
  decision: PastDecision
  score: number
}

const STOP = new Set([
  'que', 'con', 'por', 'para', 'una', 'uno', 'los', 'las', 'del', 'the', 'and', 'for',
  'esto', 'este', 'esta', 'como', 'más', 'mas', 'pero', 'sin', 'ser', 'mi', 'me', 'de',
  'en', 'el', 'la', 'un', 'a', 'y', 'o', 'si', 'no',
])

function tokens(s: string | null | undefined): Set<string> {
  return new Set(
    (s ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3 && !STOP.has(w)),
  )
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  const union = a.size + b.size - inter
  return union === 0 ? 0 : inter / union
}

const MIN_SCORE = 0.12

/**
 * Decisiones pasadas más parecidas a la actual, ordenadas por score desc.
 * Excluye la misma decisión (por título normalizado). PURO.
 */
export function findSimilarDecisions(
  current: { title: string; description?: string | null; topRisk?: string | null },
  past: PastDecision[],
  max = 3,
): SimilarMatch[] {
  const curTokens = new Set([...tokens(current.title), ...tokens(current.description)])
  const curTitleNorm = current.title.trim().toLowerCase()

  const matches: SimilarMatch[] = []
  for (const d of past) {
    if (d.title.trim().toLowerCase() === curTitleNorm) continue // es la misma
    const dTokens = new Set([...tokens(d.title), ...tokens(d.description)])
    let score = jaccard(curTokens, dTokens)
    // Bonus si comparten la dimensión de mayor riesgo.
    if (current.topRisk && d.topRisk && current.topRisk === d.topRisk) score += 0.3
    if (score >= MIN_SCORE) matches.push({ decision: d, score: Math.round(score * 100) / 100 })
  }

  return matches.sort((a, b) => b.score - a.score).slice(0, max)
}
