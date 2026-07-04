// SIR V2 — Granularidad emocional (13·M3). PURO.
//
// Barrett: nombrar la emoción con más precisión ("frustración" en vez de "mal")
// mejora la regulación. Al registrar ánimo, SIR PROPONE etiquetas más finas según
// el nivel — editable, nunca impuesta ni formulario vacío (principio doc/08). Con
// el tiempo, la diversidad de emociones nombradas es una señal de habilidad.

/** Vocabulario fino por banda de ánimo (1-10). Curado, en español rioplatense. */
const BY_BAND: { max: number; labels: string[] }[] = [
  { max: 3, labels: ['angustia', 'bronca', 'soledad', 'vacío', 'agobio', 'miedo', 'impotencia'] },
  { max: 5, labels: ['frustración', 'decepción', 'sobrecarga', 'ansiedad', 'desánimo', 'inquietud'] },
  { max: 6, labels: ['cansancio', 'desgano', 'indiferencia', 'aburrimiento', 'nostalgia'] },
  { max: 8, labels: ['calma', 'alivio', 'entusiasmo', 'conexión', 'satisfacción', 'curiosidad'] },
  { max: 10, labels: ['gratitud', 'orgullo', 'plenitud', 'euforia', 'inspiración', 'ternura'] },
]

/**
 * Etiquetas finas propuestas para un nivel de ánimo (1-10). Devuelve una lista
 * corta para ofrecer como chips; el usuario acepta/corrige. PURO.
 */
export function proposeEmotionLabels(moodValue: number, max = 6): string[] {
  if (!Number.isFinite(moodValue)) return []
  const v = Math.max(1, Math.min(10, moodValue))
  const band = BY_BAND.find((b) => v <= b.max) ?? BY_BAND[BY_BAND.length - 1]
  return band.labels.slice(0, max)
}

/** Todas las emociones finas conocidas (para medir diversidad). */
const ALL_EMOTIONS = new Set(BY_BAND.flatMap((b) => b.labels))

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}
const ALL_NORM = new Set([...ALL_EMOTIONS].map(norm))

export interface GranularityResult {
  /** Cuántas emociones finas DISTINTAS nombraste en el período. */
  distinct: number
  /** Las emociones usadas (normalizadas), ordenadas. */
  used: string[]
}

/**
 * Diversidad léxica emocional sobre un conjunto de notas: cuántas emociones finas
 * distintas aparecen. Señal de granularidad (más = mejor habilidad de nombrar).
 */
export function emotionalDiversity(notes: (string | null | undefined)[]): GranularityResult {
  const used = new Set<string>()
  for (const n of notes) {
    if (!n) continue
    const words = norm(n).split(/[^a-z]+/)
    for (const w of words) if (ALL_NORM.has(w)) used.add(w)
  }
  return { distinct: used.size, used: [...used].sort() }
}
