// SIR V2 — Re-inferencia de tono desde la nota (backfill).
//
// Contexto: el 92% de los person_logs kind='interaction' quedaron con value=3
// porque la tool no tenía rúbrica y el LLM hedge-eaba al medio (arreglado para
// adelante en el schema). Este módulo re-infiere el tono de los logs viejos
// LEYENDO la nota que Aaron ya escribió (no inventa: lee sus palabras).
//
// PURO: prompt + parser. La llamada al LLM y la escritura viven en el endpoint.
//
// LÍNEA ÉTICA: solo re-lee lo que Aaron dijo para asignar un número más fiel;
// no fabrica interacciones ni tono donde no hay nota.

/** Prompt de sistema para clasificar tono en lote. */
export const TONE_BATCH_SYSTEM = `Eres un clasificador de tono. Te doy notas que Aaron escribió sobre interacciones con personas de su vida. Para CADA nota infiere el tono que tuvo esa interacción PARA ÉL, en escala 1-5:
1 = muy mal (pelea, corte, tensión fuerte)
2 = tenso / incómodo
3 = neutro / rutinario (sin carga emocional real)
4 = cálido / buena
5 = excelente / muy conectados

Lee la carga emocional real de lo que cuenta ("le molestó" → 2, "buena charla / buen humor" → 4, "hermoso día juntos" → 5, "pelea fea" → 1). Ante duda GENUINA (nota sin señal), 3.

Devuelve SOLO un array JSON de enteros 1-5, uno por nota EN ORDEN, misma cantidad que notas recibidas. Sin texto extra, sin explicación.`

/** Arma el contenido de usuario: notas numeradas. */
export function buildToneBatchPrompt(notes: string[]): string {
  return notes.map((n, i) => `${i + 1}. ${(n ?? '').replace(/\s+/g, ' ').trim().slice(0, 220)}`).join('\n')
}

/**
 * Parsea la respuesta del LLM a un array de enteros 1-5 de longitud `n`.
 * Tolerante: extrae el primer array JSON del texto. Devuelve null si no matchea
 * la cantidad esperada o algún valor cae fuera de 1-5 (no aplicamos basura).
 */
export function parseToneBatch(text: string, n: number): number[] | null {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start < 0 || end <= start) return null
  let arr: unknown
  try {
    arr = JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
  if (!Array.isArray(arr) || arr.length !== n) return null
  const out: number[] = []
  for (const v of arr) {
    const num = typeof v === 'number' ? Math.round(v) : Number.parseInt(String(v), 10)
    if (!Number.isInteger(num) || num < 1 || num > 5) return null
    out.push(num)
  }
  return out
}
