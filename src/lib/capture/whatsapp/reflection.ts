// SIR V2 — Persistencia del toggle "Pedir preguntas reflexivas" (Nivel C).
// SSR-safe: usa localStorage solo si window existe.

const KEY = 'sir-v2-whatsapp-reflection'

export function getReflection(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(KEY) === 'on'
  } catch {
    return false
  }
}

export function setReflection(on: boolean): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY, on ? 'on' : 'off')
  } catch {
    // localStorage puede estar lleno o deshabilitado; ignorar silenciosamente.
  }
}
