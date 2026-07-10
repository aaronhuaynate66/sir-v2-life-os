// SIR V2 — Read-back verify para la captura de báscula.
//
// Tras persistir localmente (setState del store), el push a Supabase corre
// asíncrono en el sync engine. Antes la UI cantaba "guardado" ni bien hacía el
// setState — mentira si el push fallaba (offline), y las 13 métricas son
// irrecuperables si el usuario cierra la app creyendo que se guardaron. Este
// util confirma que los rows LLEGARON a DB antes de dar el OK.
//
// PURO/testeable: `checkConfirmed` y `sleep` se inyectan; sin I/O ni Date.now.

/** Cadencia del polling de confirmación: un intento inmediato + backoff.
 *  Suma ~8.5s — cubre el push normal (<1s) sin colgar la UI indefinidamente. */
export const CONFIRM_DELAYS_MS = [0, 300, 600, 1200, 2400, 4000] as const

export function defaultSleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Poll hasta que TODOS los `ids` estén confirmados en DB, o se agote la cadencia.
 *
 * @param checkConfirmed - cuántos de esos ids ya están en DB (un error de red
 *   se trata como 0 y se sigue reintentando).
 * @returns true si se confirmaron todos; false si expiró. Un false NO significa
 *   pérdida de datos: la fila queda en localStorage + pendingIds y se re-pushea
 *   al reconectar. El caller debe decir "guardado en este dispositivo", no error.
 */
export async function waitForRowsConfirmed(
  ids: string[],
  checkConfirmed: (ids: string[]) => Promise<number>,
  sleep: (ms: number) => Promise<void> = defaultSleep,
  delaysMs: readonly number[] = CONFIRM_DELAYS_MS,
): Promise<boolean> {
  if (ids.length === 0) return true
  for (const d of delaysMs) {
    if (d > 0) await sleep(d)
    let count = 0
    try {
      count = await checkConfirmed(ids)
    } catch {
      count = 0
    }
    if (count >= ids.length) return true
  }
  return false
}
