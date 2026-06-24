// SIR V2 — Keywords de un EPISODIO para rastrear sus referencias en otras
// conversaciones (Paso 3). PURO. Saca de título+detalle las palabras
// DISTINTIVAS (descarta artículos/preposiciones y palabras genéricas de
// "episodio" como conflicto/pelea/tema que generarían falsos positivos).
// El usuario puede editarlas antes de barrer.

function deburr(s: string): string {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

const STOP = new Set([
  // artículos / preposiciones / conectores
  'por', 'para', 'con', 'sin', 'los', 'las', 'una', 'uno', 'unos', 'unas', 'del', 'que',
  'como', 'mas', 'pero', 'sus', 'esa', 'ese', 'esto', 'esta', 'estos', 'estas', 'mi', 'tu',
  'le', 'lo', 'se', 'su', 'de', 'el', 'la', 'en', 'al', 'y', 'o', 'a',
  // genéricas de "episodio" (causan ruido)
  'conflicto', 'problema', 'pelea', 'discusion', 'tema', 'situacion', 'asunto', 'cosa',
  'charla', 'momento', 'decision', 'tema', 'evento', 'episodio',
])

/** Palabras distintivas del episodio (deburr, len>=4, sin stopwords), únicas,
 *  en orden de aparición, cap `max`. */
export function episodeKeywords(title: string, detail = '', max = 6): string[] {
  const toks = deburr(`${title} ${detail}`).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w))
  return [...new Set(toks)].slice(0, max)
}
