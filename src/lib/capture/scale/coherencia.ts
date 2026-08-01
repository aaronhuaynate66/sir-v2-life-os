// SIR V2 — Coherencia física de una captura de báscula. PURO.
//
// ═══ POR QUÉ EXISTE ═══════════════════════════════════════════════════════════
//
// El prompt de visión lista `muscle_mass_kg` y `skeletal_muscle_mass_kg` sin decir
// cuál es cuál, así que el modelo las CRUZA leyendo el pantallazo. Medido en la
// base el 1-ago-2026: **46 filas invertidas**, todas con `confidence: "high"`.
//
// El efecto no era cosmético. `askSir` lee `muscle_mass_kg` como la masa magra, y
// con las filas mezcladas la respuesta oscilaba entre **33 kg y 61 kg según el día
// que se preguntara** — 27 kg de diferencia en el mismo cuerpo, la misma semana.
//
// Reforzar el prompt no alcanza: el modelo ya decía "high" mientras las invertía.
// Esto SÍ, porque es aritmética y no criterio. Misma decisión que `deVoseo`: la
// regla en el prompt es útil, pero la garantía es el chequeo determinístico.
//
// ═══ LA INVARIANTE ════════════════════════════════════════════════════════════
//
// El músculo esquelético es una PARTE del músculo total: siempre menor. En un
// adulto ronda el 50-60% de la masa libre de grasa, y el músculo total/MLG ronda
// el 70-80% del peso. Así que `skeletal < muscle` no es una convención de este
// repo — es anatomía, y por eso se puede exigir sin miedo a falsos positivos.
//
// PURO: cero red, cero DB.

/** Las dos métricas de músculo de una captura. */
export interface Musculos {
  muscle_mass_kg?: number | null
  skeletal_muscle_mass_kg?: number | null
}

export interface Correccion<T> {
  metrics: T
  /** Qué se corrigió, para dejarlo en la nota de la fila. [] si nada. */
  correcciones: string[]
}

/** Un número usable, o null. PURA. */
function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Corrige el cruce de músculo total ↔ esquelético. PURO. No muta la entrada.
 *
 * Solo actúa cuando la inversión es INEQUÍVOCA: los dos valores presentes y el
 * esquelético mayor que el total. Con un solo valor presente no se puede saber si
 * está en el balde correcto sin el peso, así que se usa `corregirConPeso`.
 */
export function corregirMusculos<T extends Musculos>(metrics: T): Correccion<T> {
  const total = num(metrics?.muscle_mass_kg)
  const esq = num(metrics?.skeletal_muscle_mass_kg)
  if (total === null || esq === null || esq <= total) {
    return { metrics, correcciones: [] }
  }
  return {
    metrics: { ...metrics, muscle_mass_kg: esq, skeletal_muscle_mass_kg: total },
    correcciones: [`músculo total y esquelético venían invertidos (${total} / ${esq} kg): el esquelético es una parte del total, no puede ser mayor`],
  }
}

/** Fracción del peso que representa la masa libre de grasa / músculo total. */
export const RANGO_TOTAL: readonly [number, number] = [0.60, 0.90]
/** Fracción del peso que representa el músculo esquelético. */
export const RANGO_ESQUELETICO: readonly [number, number] = [0.30, 0.55]

/**
 * Corrige usando el PESO como árbitro, para cuando viene un solo valor. PURO.
 *
 * Con el peso se puede ubicar un valor suelto: 33 kg sobre 82 kg es 0.40 (rango
 * del esquelético) y 61 kg es 0.74 (rango del total). Los rangos no se solapan, así
 * que la decisión es limpia. Si el valor no cae claramente en ninguno, **no se
 * toca**: se prefiere un dato dudoso a uno movido por adivinanza.
 */
export function corregirConPeso<T extends Musculos>(metrics: T, pesoKg: number | null | undefined): Correccion<T> {
  const primero = corregirMusculos(metrics)
  const peso = num(pesoKg)
  if (peso === null) return primero

  const m = primero.metrics
  const correcciones = [...primero.correcciones]
  const total = num(m.muscle_mass_kg)
  const esq = num(m.skeletal_muscle_mass_kg)
  const enRango = (v: number, [a, b]: readonly [number, number]) => v / peso >= a && v / peso <= b

  // Solo el TOTAL presente y cae en el rango del esquelético → estaba en el balde equivocado.
  if (total !== null && esq === null && !enRango(total, RANGO_TOTAL) && enRango(total, RANGO_ESQUELETICO)) {
    correcciones.push(`${total} kg es ${(total / peso).toFixed(2)} del peso: es músculo esquelético, no total`)
    return { metrics: { ...m, muscle_mass_kg: null, skeletal_muscle_mass_kg: total }, correcciones }
  }
  // Solo el ESQUELÉTICO presente y cae en el rango del total → idem al revés.
  if (esq !== null && total === null && !enRango(esq, RANGO_ESQUELETICO) && enRango(esq, RANGO_TOTAL)) {
    correcciones.push(`${esq} kg es ${(esq / peso).toFixed(2)} del peso: es músculo total, no esquelético`)
    return { metrics: { ...m, muscle_mass_kg: esq, skeletal_muscle_mass_kg: null }, correcciones }
  }
  return { metrics: m, correcciones }
}
