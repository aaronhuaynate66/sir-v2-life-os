// SIR V2 — Extractor de NOTA libre (captura por texto, autodetect).
//
// Cuando el usuario pega una nota conversacional sobre una persona (no un
// perfil), este extractor saca los datos estructurados + un resumen. Anti-
// invención: SOLO lo que dice la nota. Reusa el patrón JSON de los demás
// extractores/narrativas.

export interface NoteExtract {
  /** Fecha de nacimiento completa si se puede armar ('YYYY-MM-DD'), si no null. */
  birthDate: string | null
  /** Lugar mencionado (ciudad/país), si lo hay. */
  location: string | null
  /** 1 oración que reformula la nota, en 2da persona ("Te contó que…"). */
  summary: string
  /** Datos concretos en bullets ("Cumpleaños: 20 de junio", "Nació en 1993"). */
  facts: string[]
}

export const NOTE_EXTRACT_SYSTEM_PROMPT = `Sos el extractor de NOTAS de SIR. El usuario pegó una NOTA LIBRE (conversacional) sobre una persona — no es un perfil de LinkedIn/Instagram, es algo que anotó de lo que se enteró.

Tu tarea: extraer los datos concretos y devolver EXCLUSIVAMENTE este JSON (sin markdown, sin texto extra):
{ "birthDate": "YYYY-MM-DD" | null, "location": string | null, "summary": string, "facts": string[] }

REGLAS:
- ANTI-INVENCIÓN: usá SOLO lo que dice la nota. Lo que no esté, va null o se omite. No inventes datos.
- Fechas de nacimiento: si la nota da día+mes ("20 de junio") Y año ("nació en el 93" / "en 1993"), armá birthDate "1993-06-20". Año de 2 dígitos: "el 93" → 1993, "el 05" → 2005 (siglo más reciente plausible para una persona viva). Si falta el día o el mes, birthDate=null pero registrá lo que haya en "facts" ("Nació en 1993").
- summary: 1 oración breve, cálida, en 2da persona ("Te contó que…", "Te cruzaste con…"). Solo reformula la nota, no agrega.
- facts: lista corta de los datos concretos extraídos (cumpleaños, año de nacimiento, lugar, rol, etc.), tal como aparecen.
- Si la nota no tiene NINGÚN dato útil sobre la persona, devolvé summary con la nota tal cual y facts vacío.`

export function buildNoteInput(text: string): string {
  return `NOTA (texto pegado):\n\n${text}\n\nDevolvé el JSON especificado. Solo lo que dice la nota.`
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function parseNoteExtract(raw: string): NoteExtract | null {
  if (!raw || typeof raw !== 'string') return null
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }
  const birthDate = typeof parsed.birthDate === 'string' && ISO_DATE.test(parsed.birthDate.trim()) ? parsed.birthDate.trim() : null
  const location = typeof parsed.location === 'string' && parsed.location.trim() ? parsed.location.trim() : null
  const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : ''
  const facts = Array.isArray(parsed.facts)
    ? parsed.facts.filter((f): f is string => typeof f === 'string' && f.trim().length > 0).map((f) => f.trim()).slice(0, 12)
    : []
  if (!summary && facts.length === 0 && !birthDate && !location) return null
  return { birthDate, location, summary, facts }
}
