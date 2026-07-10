// SIR V2 — Precompute del análisis conductual al marcar a alguien como MUJER.
//
// Al setear gender='female', su ficha habilita el 2º horizonte (forecast
// conductual). Correrlo AHORA (fire-and-forget) deja las señales + el forecast
// listos → cuando Aaron abre la ficha, no espera. El forecast lee el sustrato
// (#659), así que si su hilo ya está cargado, sale al toque.
//
// Best-effort: si falla (sin sustrato, sin sesión), no rompe nada — la ficha
// igual puede calcular on-demand. No bloquea la UI.

/** Dispara el cálculo del forecast conductual para una persona. No espera el
 *  resultado (fire-and-forget). Seguro de llamar aunque no aplique. */
export function precomputeBehavior(personId: string): void {
  if (!personId) return
  try {
    void fetch('/api/forecast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personId }),
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* no-op: nunca romper el flujo de guardar género */
  }
}
