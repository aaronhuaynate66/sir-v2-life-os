// SIR V2 — Helpers puros para el UI de tokens.
//
// Vive separado de `tokens.ts` porque este último importa `crypto` (server)
// y arruinaría el bundle del cliente. Todo lo que necesite el UI vive acá.

/** Serializa "N min/horas/días atrás" para mostrar last_used_at / created_at. */
export function formatRelative(iso: string | null): string {
  if (!iso) return 'nunca usado'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return 'nunca usado'
  const diff = Date.now() - t
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'ahora mismo'
  if (mins < 60) return `hace ${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `hace ${hours}h`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'ayer'
  if (days < 30) return `hace ${days}d`
  return new Date(t).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })
}
