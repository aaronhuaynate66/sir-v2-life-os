// SIR V2 — Prosa del "patrón usual" del 2º horizonte (probabilístico). PURO.
//
// El motor entrega `usualPattern` como Δ% de cada señal en los picos vs el
// baseline (ej. friction +0.74). Mostrar "+74%" se lee clínico/instrumental —
// contra la línea ética del doc 17 (tendencia, no diagnóstico; para cuidar, no
// para gestionar). Este helper traduce esos números a una frase cualitativa y
// neutral en género ("suele aparecer más fricción o irritabilidad, algo de
// retiro…"), rankeada por magnitud. Sin LLM: determinístico y testeable.

export interface UsualPattern {
  friction: number
  withdrawal: number
  sensitivity: number
  somatic: number
}

/** Mismo umbral que usaba la UI de chips: por debajo, la señal es ruido. */
const MIN_DELTA = 0.05

/** Sustantivo neutral por dimensión (sin género — la persona puede ser él/ella). */
const NOUN: Record<keyof UsualPattern, string> = {
  friction: 'fricción o irritabilidad',
  withdrawal: 'retiro o distancia',
  sensitivity: 'sensibilidad emocional',
  somatic: 'molestias físicas (cansancio, dolores)',
}

/** Cuantificador cualitativo por intensidad del Δ. Reemplaza el "+74%". */
function intensity(delta: number): string {
  if (delta > 0.6) return 'bastante más'
  if (delta > 0.25) return 'más'
  return 'algo de'
}

/** Une una lista en español: "a", "a y b", "a, b y c". */
function joinEs(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`
}

/**
 * Traduce el `usualPattern` a una frase cualitativa, o null si ninguna señal
 * supera el umbral. Rankea de mayor a menor Δ. PURO.
 *
 * Ej. { friction: 0.74, withdrawal: 0.2 } → "bastante más fricción o
 * irritabilidad y algo de retiro o distancia".
 */
export function describeUsualPattern(p: UsualPattern | null | undefined): string | null {
  if (!p) return null
  const dims: Array<[keyof UsualPattern, number]> = [
    ['friction', p.friction],
    ['withdrawal', p.withdrawal],
    ['sensitivity', p.sensitivity],
    ['somatic', p.somatic],
  ]
  const active = dims
    .filter(([, v]) => typeof v === 'number' && v > MIN_DELTA)
    .sort((a, b) => b[1] - a[1])
  if (active.length === 0) return null
  return joinEs(active.map(([k, v]) => `${intensity(v)} ${NOUN[k]}`))
}
