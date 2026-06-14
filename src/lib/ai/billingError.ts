// SIR V2 — clasificador de errores de facturación/créditos de la API de Anthropic.
//
// IMPORTANTE: la API de Anthropic NO expone el saldo restante (no hay endpoint
// de balance; sólo el Admin/Usage API da consumo/costo, no saldo). Por eso no
// se puede mostrar un medidor de "créditos restantes". Lo único confiable es
// DETECTAR el error cuando una llamada falla por créditos y avisar claro.
// El control proactivo real (auto-reload + alertas de uso) se activa en la
// consola de Anthropic, no acá.

/** Mensaje único para el banner y los errores de endpoints. */
export const AI_CREDIT_BANNER =
  'Sin créditos de IA. Las funciones con IA (capturas, briefings, intake, síntesis) están pausadas. Recargá créditos en Anthropic → Plans & Billing.'

/** Señales textuales del error de Anthropic cuando se agotan los créditos. */
const CREDIT_SIGNALS = [
  'credit balance is too low',
  'insufficient credits',
  'purchase credits',
  'plans & billing',
  'plans and billing',
] as const

function extractText(input: unknown): string {
  if (input == null) return ''
  if (typeof input === 'string') return input
  if (input instanceof Error) return input.message
  if (typeof input === 'object') {
    try { return JSON.stringify(input) } catch { return String(input) }
  }
  return String(input)
}

/** True si el error/mensaje corresponde a falta de créditos/facturación de Anthropic. */
export function isAiCreditError(input: unknown): boolean {
  const text = extractText(input).toLowerCase()
  if (!text) return false
  return CREDIT_SIGNALS.some((s) => text.includes(s))
}
