// SIR V2 — Chequeo de coherencia con valores/identidad (14·M6).
//
// Refuerzo de la dimensión `values`: cuando una decisión sale en contra de tus
// valores, SIR trae tus ANCLAS (el ancla del año + quién sos) para que revises la
// decisión contra ellas. NO veta ni finge una respuesta limpia (los valores
// compiten entre sí): nombra la tensión y te deja mirarla. PURO.

export interface CoherenceSources {
  /** Título del objetivo marcado como ancla del año (Goal.isAnchor), o null. */
  yearAnchor?: string | null
  /** Bio / "quién sos" del perfil de identidad. */
  identityBio?: string
}

export interface AnchorCheck {
  label: string
  text: string
}

/** Anclas no vacías a contrastar, con su etiqueta. Orden: el ancla del año
 *  (la más concreta y específica) primero, luego quién sos. */
export function anchorsToCheck(s: CoherenceSources | null | undefined): AnchorCheck[] {
  if (!s) return []
  const out: AnchorCheck[] = []
  const push = (label: string, text?: string | null) => {
    const t = (text ?? '').trim()
    if (t) out.push({ label, text: t })
  }
  push('Tu ancla del año', s.yearAnchor)
  push('Quién eres', s.identityBio)
  return out
}
