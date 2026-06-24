// SIR V2 — Limpieza de fechas importadas antes de adjuntarlas a una persona
// (#130/#131/#132). PURO. Resuelve: (1) dedup contra las YA guardadas y entre
// sí (mismo evento ×2-3 con títulos casi iguales → una sola), (2) descarta
// genéricas/no-personales (Día de la Madre, etc.), (3) no agrega el cumpleaños
// como fecha suelta si la persona ya tiene fecha de nacimiento (evita el
// conflicto 6-oct vs 17-oct).
import type { SpecialDate } from '@/types'

export interface IncomingDate { label: string; date: string; recurring?: boolean }

function deburr(s: string): string {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}
const STOP = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'a', 'en', 'con', 'y', 'o', 'su', 'un', 'una', 'para', 'por'])
// Fechas genéricas / no-personales que NO son hitos de la persona.
const GENERIC = [
  'dia de la madre', 'dia del padre', 'dia de la mujer', 'dia del trabajo', 'dia del nino',
  'navidad', 'nochebuena', 'ano nuevo', 'fin de ano', 'ano viejo', 'dia de los muertos',
  'san valentin', 'dia del amigo', 'dia de la independencia', 'fiestas patrias',
]

function tokens(label: string, personName?: string): Set<string> {
  const nameToks = new Set(deburr(personName ?? '').split(/[^a-z0-9]+/).filter(Boolean))
  return new Set(
    deburr(label).split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !STOP.has(t) && !nameToks.has(t)),
  )
}
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter += 1
  return inter / (a.size + b.size - inter)
}
function isGeneric(label: string): boolean {
  const d = deburr(label)
  return GENERIC.some((g) => d.includes(g))
}
function monthDay(iso: string): string { return (iso || '').slice(5, 10) } // MM-DD
function looksLikeBirthday(label: string): boolean {
  return /\bcumple|cumpleanos|nacimiento\b/.test(deburr(label))
}

/** Devuelve SOLO las fechas NUEVAS y limpias a agregar (con id). PURO. */
export function cleanImportDates(
  incoming: IncomingDate[],
  existing: SpecialDate[],
  birthDateISO?: string | null,
  personName?: string,
  genId: () => string = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`),
): SpecialDate[] {
  const bdayMD = birthDateISO ? monthDay(birthDateISO) : null
  // Acumulador: arranca con las existentes (para deduplicar contra ellas).
  const kept: { label: string; date: string; recurring: boolean; toks: Set<string> }[] =
    existing.map((e) => ({ label: e.label, date: e.date, recurring: !!e.recurring, toks: tokens(e.label, personName) }))
  const added: SpecialDate[] = []

  for (const raw of incoming) {
    const date = (raw.date || '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    const label = (raw.label || '').trim()
    if (!label) continue
    const recurring = !!raw.recurring
    if (isGeneric(label)) continue
    // Cumpleaños de ESTA persona ya cubierto por fecha de nacimiento → no duplicar.
    if (looksLikeBirthday(label) && (bdayMD ? monthDay(date) === bdayMD : !!birthDateISO)) continue
    if (looksLikeBirthday(label) && birthDateISO) continue
    const toks = tokens(label, personName)
    // Dup si ya hay algo MUY parecido: recurrente → mismo mes-día + overlap;
    // puntual → misma fecha + overlap de tokens.
    const dup = kept.some((k) => {
      if (recurring && k.recurring) return monthDay(k.date) === monthDay(date) && jaccard(k.toks, toks) >= 0.4
      return k.date === date && jaccard(k.toks, toks) >= 0.5
    })
    if (dup) continue
    kept.push({ label, date, recurring, toks })
    added.push({ id: genId(), label, date, recurring })
  }
  return added
}
