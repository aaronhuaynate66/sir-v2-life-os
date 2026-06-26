// SIR V2 — Hábitos: formato de hora del check-in (display). La hora se guarda
// en habit_checkins.created_at; acá la mostramos en hora de Lima HH:MM para
// matar la duda "¿a qué hora marqué esto?".
export function limaTimeHHMM(iso: string | null | undefined): string | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  try {
    return new Intl.DateTimeFormat('es-PE', {
      timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(t))
  } catch { return null }
}
