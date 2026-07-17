// SIR V2 — mapWithConcurrency: corre `fn` sobre cada item con un tope de N en
// vuelo a la vez. Preserva el orden de resultados (result[i] ↔ items[i]).
// Nunca rechaza por un item: capturá el error dentro de `fn` si quieres
// tolerancia. PURO respecto del DOM (sirve en cliente y server). Testeable.

/**
 * @param items    lista a procesar
 * @param limit    máximo de tareas concurrentes (se clampa a ≥1)
 * @param fn       (item, index) => Promise<R>
 * @param onSettle callback opcional tras cada item (para progreso incremental)
 */
export async function mapWithConcurrency<T, R>(
  items: ReadonlyArray<T>,
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  onSettle?: (index: number) => void,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  const width = Math.max(1, Math.floor(limit))
  let next = 0

  async function worker(): Promise<void> {
    for (;;) {
      const i = next++
      if (i >= items.length) return
      results[i] = await fn(items[i], i)
      onSettle?.(i)
    }
  }

  const workers = Array.from({ length: Math.min(width, items.length) }, () => worker())
  await Promise.all(workers)
  return results
}
