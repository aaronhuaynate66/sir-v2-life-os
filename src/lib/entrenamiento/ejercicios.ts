// SIR V2 — Ejercicios de una sesión: parseo de lo que Aaron dicta, volumen y
// PROGRESIÓN de carga.
//
// POR QUÉ EXISTE. `training_sessions` (0169) mide si entrenó, no si está
// progresando. Y para el Mundial esa es LA pregunta: su categoría es 80 kg+ y su
// estrategia decidida es RECOMPONER —más músculo, mismo peso— no bajar. Se puede
// entrenar fuerza tres meses moviendo siempre los mismos kilos y no ganar nada;
// "intensidad alta" no distingue esos dos casos. La carga sí.
//
// El bloque 1 (BASE, fuerza pesada 3×/semana) arrancó el 28-jul-2026 y quedan ~14
// semanas hasta el pesaje.
//
// PURO: cero red, cero IA, cero Date.now() implícito. El parseo es determinístico
// a propósito — que un LLM interprete "3x12 con 80" es caro, lento y peor: si el
// modelo se equivoca en un número, la serie histórica queda envenenada y nadie se
// entera. Los números se leen con regex; el LLM solo pasa el texto.

/** Una serie: repeticiones y carga. `kg` null = a peso corporal. */
export interface WorkSet {
  reps: number
  kg: number | null
}

export interface ParsedExercise {
  /** Nombre como lo dijo ("press banca"). */
  name: string
  /** Normalizado — agrupa el mismo ejercicio escrito distinto entre sesiones. */
  nameKey: string
  sets: WorkSet[]
  unit: 'kg' | 'lb'
  bodyweight: boolean
}

const LB_A_KG = 0.45359237
/** Cotas de cordura: fuera de esto es un número mal leído, no un dato. */
const MAX_REPS = 200
const MAX_KG = 500
const MAX_SETS = 20

export function normalizeExerciseName(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Ejercicios que se hacen sin carga externa → el volumen en kg no aplica igual. */
const PESO_CORPORAL = /\b(dominada|dominadas|pull\s?up|fondo|fondos|dip|dips|flexion|flexiones|push\s?up|plancha|abdominal|abdominales|burpee|burpees|salto|saltos|barra|paralelas)\b/

/** Palabras de arrastre que no son parte del nombre del ejercicio. Incluye la
 *  prosa con la que se arranca a dictar ("hoy hice pesas: banca 3x10…"), que si
 *  no se saca termina como nombre del ejercicio. */
const RUIDO = /\b(hoy|ayer|hice|hicimos|meti|meti(?:o|mos)?|entrene|entrenamos|entrenamiento|sesion|pesas|gym|gimnasio|de|con|a|al|por|en|serie|series|repes|reps|rep|repeticiones|x|kilos|kilo|kg|kgs|libras|lb|lbs|y|luego|despues|tambien)\b/g

/**
 * Parsea UNA línea de ejercicio. Acepta las formas en que se dicta de verdad:
 *
 *   "banca 3x12 con 80"      "press banca 3x12x80"     "sentadilla 4x8 100kg"
 *   "peso muerto 5x5 @120"   "curl 3 series de 10 con 20"   "dominadas 4x8"
 *   "banca 3x12 con 80 lb"   "remo 12,10,8 con 60"
 *
 * Devuelve null si no encuentra ni nombre ni series — mejor nada que una fila con
 * ceros que después mienta en la progresión.
 */
export function parseExerciseLine(raw: string): ParsedExercise | null {
  const linea = (raw || '').trim()
  if (!linea) return null

  const unit: 'kg' | 'lb' = /\b(lb|lbs|libras)\b/i.test(linea) ? 'lb' : 'kg'

  // La carga, POR PRIORIDAD. El orden importa: un `de N` suelto es ambiguo porque
  // "3 series DE 10" usa "de" para las REPS. Leerlo primero hacía que
  // "curl 3 series de 10 con 20" registrara 10 kg en vez de 20 — un dato falso que
  // después envenena la progresión sin que nadie se entere.
  let kg: number | null = null
  const candidatos = [
    // 1) Marcador inequívoco de carga.
    /(?:@|con\s+)(\d+(?:[.,]\d+)?)\s*(?:kg|kgs|kilos?|lb|lbs|libras)?\b/i,
    // 2) Unidad explícita pegada al número.
    /(\d+(?:[.,]\d+)?)\s*(?:kg|kgs|kilos?|lb|lbs|libras)\b/i,
    // 3) `de N` — SOLO si no es el "de" de las series.
    /\bserie/i.test(linea) ? null : /\bde\s+(\d+(?:[.,]\d+)?)\b/i,
  ].filter((r): r is RegExp => r !== null)

  for (const re of candidatos) {
    const m = linea.match(re)
    if (!m) continue
    const n = Number(m[1].replace(',', '.'))
    if (Number.isFinite(n) && n > 0) { kg = unit === 'lb' ? Math.round(n * LB_A_KG * 10) / 10 : n; break }
  }

  // Series. Tres formas: "3x12", "3 series de 12", o una lista "12,10,8".
  let sets: WorkSet[] = []
  const mSxR = linea.match(/(\d{1,2})\s*[x×]\s*(\d{1,3})/i)
  const mSeriesDe = linea.match(/(\d{1,2})\s*series?\s*(?:de\s*)?(\d{1,3})/i)
  const mLista = linea.match(/\b(\d{1,3}(?:\s*,\s*\d{1,3}){1,9})\b/)

  if (mSxR || mSeriesDe) {
    const m = (mSxR ?? mSeriesDe) as RegExpMatchArray
    const nSets = Number(m[1])
    const reps = Number(m[2])
    if (nSets > 0 && nSets <= MAX_SETS && reps > 0 && reps <= MAX_REPS) {
      sets = Array.from({ length: nSets }, () => ({ reps, kg }))
    }
  } else if (mLista) {
    const nums = mLista[1].split(',').map((s) => Number(s.trim()))
    if (nums.every((n) => Number.isFinite(n) && n > 0 && n <= MAX_REPS) && nums.length <= MAX_SETS) {
      sets = nums.map((reps) => ({ reps, kg }))
    }
  }
  if (sets.length === 0) return null
  if (kg !== null && (kg <= 0 || kg > MAX_KG)) {
    // Carga absurda → se guarda la serie SIN peso antes que con un peso inventado.
    sets = sets.map((s) => ({ ...s, kg: null }))
    kg = null
  }

  // El nombre: lo que queda al sacar números, unidades y palabras de arrastre.
  const name = linea
    .replace(/\d+(?:[.,]\d+)?/g, ' ')
    .replace(/[@×x]/gi, ' ')
    .replace(RUIDO, ' ')
    // Puntuación suelta que queda al sacar números y ruido (":", ",", "-").
    .replace(/[.,;:!?()[\]{}«»"'\-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!name) return null

  const nameKey = normalizeExerciseName(name)
  const bodyweight = kg === null && PESO_CORPORAL.test(nameKey)
  return { name: name.slice(0, 80), nameKey, sets, unit, bodyweight }
}

/**
 * Parsea varios ejercicios de un mensaje. Corta por saltos de línea, comas entre
 * ejercicios, " y " o ";". Descarta lo que no parsea en vez de inventarlo.
 */
export function parseExercises(text: string): ParsedExercise[] {
  const partes = (text || '')
    // Corta por: salto de línea, ';', ':' (el "hoy hice pesas: banca…"), " y ",
    // y por coma SEGUIDA DE LETRA.
    //
    // La condición correcta es lo que viene DESPUÉS de la coma, no antes: pedir
    // una letra antes fallaba en "…con 90, sentadilla 5x5 con 120" (antes de la
    // coma hay un número) y fusionaba dos ejercicios en uno, perdiendo la carga
    // del segundo. Mirando hacia adelante, la lista de reps "12,10,8" tampoco se
    // corta, porque después de esas comas viene un dígito.
    .split(/\n|;|:|,\s*(?=[a-zA-Z])|\s+y\s+(?=[a-zA-Z])/)
    .map((p) => p.trim())
    .filter(Boolean)
  const out: ParsedExercise[] = []
  const vistos = new Set<string>()
  for (const p of partes) {
    const ex = parseExerciseLine(p)
    if (!ex || vistos.has(ex.nameKey)) continue
    vistos.add(ex.nameKey)
    out.push(ex)
  }
  return out
}

/** Volumen de un ejercicio: Σ reps × kg. null si es a peso corporal (no comparable). */
export function exerciseVolume(ex: { sets: WorkSet[] }): number | null {
  let total = 0
  let conCarga = false
  for (const s of ex.sets) {
    if (s.kg === null) continue
    conCarga = true
    total += s.reps * s.kg
  }
  return conCarga ? Math.round(total) : null
}

/** Volumen de la sesión: suma de los ejercicios con carga. */
export function sessionVolume(exercises: Array<{ sets: WorkSet[] }>): number {
  return exercises.reduce((acc, ex) => acc + (exerciseVolume(ex) ?? 0), 0)
}

/** Carga máxima movida en un ejercicio (el mejor set). null si peso corporal. */
export function topSet(ex: { sets: WorkSet[] }): WorkSet | null {
  let best: WorkSet | null = null
  for (const s of ex.sets) {
    if (s.kg === null) continue
    if (!best || s.kg > best.kg! || (s.kg === best.kg && s.reps > best.reps)) best = s
  }
  return best
}

export interface ExerciseHistoryPoint {
  /** YYYY-MM-DD. */
  date: string
  sets: WorkSet[]
}

export type ProgressionTrend = 'subiendo' | 'estancado' | 'bajando' | 'sin_datos'

export interface Progression {
  trend: ProgressionTrend
  /** Mejor carga de la primera mitad vs la segunda, en kg. */
  fromKg: number | null
  toKg: number | null
  sessions: number
  message: string
}

/**
 * ¿La carga de un ejercicio está subiendo?
 *
 * Compara el mejor set de la primera mitad del historial contra el de la segunda.
 * Necesita al menos 3 sesiones: con 2 puntos cualquier ruido parece tendencia, y
 * este dato va a alimentar una decisión de recomposición — no conviene apurarlo.
 *
 * `sin_datos` es una respuesta legítima y se dice: es la regla de honestidad de
 * cobertura del repo (no concluir desde una ventana insuficiente).
 */
export function progressionFor(name: string, history: ExerciseHistoryPoint[]): Progression {
  const orden = [...history].sort((a, b) => a.date.localeCompare(b.date))
  const puntos = orden
    .map((h) => ({ date: h.date, top: topSet(h) }))
    .filter((p): p is { date: string; top: WorkSet } => p.top !== null)

  if (puntos.length < 3) {
    return {
      trend: 'sin_datos', fromKg: null, toKg: null, sessions: puntos.length,
      message: `Todavía no puedo decir si tu ${name} progresa: tengo ${puntos.length} sesión(es) con carga y necesito al menos 3.`,
    }
  }

  const mitad = Math.floor(puntos.length / 2)
  const maxDe = (arr: typeof puntos) => Math.max(...arr.map((p) => p.top.kg as number))
  const antes = maxDe(puntos.slice(0, mitad))
  const despues = maxDe(puntos.slice(mitad))
  const delta = despues - antes
  // 2.5 kg = el disco más chico de cada lado. Menos que eso es ruido de barra.
  const UMBRAL = 2.5

  const trend: ProgressionTrend = delta >= UMBRAL ? 'subiendo' : delta <= -UMBRAL ? 'bajando' : 'estancado'
  const message = trend === 'subiendo'
    ? `Tu ${name} viene subiendo: de ${antes} a ${despues} kg en ${puntos.length} sesiones. Eso es el músculo que la categoría te pide.`
    : trend === 'bajando'
      ? `Tu ${name} viene bajando: de ${antes} a ${despues} kg. Con el peso justo al piso de categoría, perder fuerza es lo que no conviene.`
      : `Tu ${name} está estancado en ~${despues} kg desde hace ${puntos.length} sesiones. Si la idea es recomponer, la carga tiene que subir.`

  return { trend, fromKg: antes, toKg: despues, sessions: puntos.length, message }
}
