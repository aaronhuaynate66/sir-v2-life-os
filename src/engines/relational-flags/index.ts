// SIR V2 — Red flags de auto-protección (19·M3, doc 19).
//
// DISTINTO del detector de manipulación entrante (16·M3, Cialdini: autoridad/
// urgencia/miedo en UN mensaje). Esto detecta PATRONES RELACIONALES en cómo
// alguien te trata a lo largo del tiempo — control, aislamiento, gaslighting,
// devaluación — sobre TUS propias notas de person_logs.
//
// LÍNEA ÉTICA (doc 19): enfocado en TU seguridad, NO en rotular al otro. No es un
// diagnóstico ni una etiqueta clínica; son patrones que Tú anotaste, para que te
// cuides. Exige RECURRENCIA (≥2 entradas) antes de encender una señal: una sola
// mala nota no alcanza. Peligro real → hablarlo con alguien/un profesional, SIR
// no "trata". 100% puro y determinístico (heurística ES+EN), corre client-side.

export type RelationalFlag =
  | 'control'
  | 'isolation'
  | 'gaslighting'
  | 'devaluation'
  | 'blame_shift'
  | 'intermittent'

export interface RelationalFlagHit {
  flag: RelationalFlag
  label: string
  /** En cuántas entradas distintas apareció el patrón. */
  occurrences: number
  /** Consejo de auto-protección — apunta a ti, nunca a rotular al otro. */
  care: string
}

export type RelationalFlagLevel = 'none' | 'watch' | 'concern'

export interface RelationalFlagsResult {
  /** Flags recurrentes (≥2 entradas), ordenados por frecuencia desc. */
  flags: RelationalFlagHit[]
  level: RelationalFlagLevel
  /** true si el patrón amerita hablarlo con alguien de confianza / un profesional. */
  seekSupport: boolean
  entriesScanned: number
}

const LABELS: Record<RelationalFlag, string> = {
  control: 'Control',
  isolation: 'Aislamiento',
  gaslighting: 'Te hacen dudar de ti',
  devaluation: 'Devaluación',
  blame_shift: 'Todo es tu culpa',
  intermittent: 'Frío y cariño intermitente',
}

const CARE: Record<RelationalFlag, string> = {
  control: 'Mantén decisiones y espacios propios. El control no es cuidado.',
  isolation: 'Cuida tus vínculos: mantén cerca a amigos y familia. El aislamiento te deja sin red.',
  gaslighting: 'Confía en tu memoria — anota los hechos cuando pasan. Que dudes de ti mismo ES la señal.',
  devaluation: 'Cómo te hablan importa. Sentirte menos de forma repetida no es tu valor real.',
  blame_shift: 'Fíjate si SIEMPRE terminas siendo el culpable. La responsabilidad se reparte.',
  intermittent: 'El ciclo de frío y cariño engancha. Buscas consistencia, no migajas.',
}

const PATTERNS: Record<RelationalFlag, RegExp[]> = {
  control: [
    /\bme controla\b/i, /\bno me deja\b/i, /\bme proh[ií]be\b/i, /\bme vigila\b/i,
    /revisa mi (tel[eé]fono|celular|chat|whats)/i, /me dice qu[ée] (hacer|ponerme|decir)/i,
    /pedir(le)? permiso/i, /\bcontrolador\b/i, /\bcontrolling\b/i, /checks my phone/i, /won'?t let me/i,
  ],
  isolation: [
    /me alej[óo] de/i, /no quiere que (vea|hable|salga)/i, /me a[ií]sl/i,
    /me separ[óo] de (mis|mi)/i, /\bisolat/i, /cut me off/i, /alejarme de/i,
    /no me deja (ver|salir|hablar)/i,
  ],
  gaslighting: [
    /me hace dudar/i, /dice que (estoy loc|exager|invent)/i, /\bnunca pas[óo]\b/i,
    /niega que/i, /me confunde/i, /\bgaslight/i, /making me doubt/i, /says i'?m crazy/i,
    /me hace sentir que (estoy|soy) el problema/i,
  ],
  devaluation: [
    /me humilla/i, /me menosprecia/i, /me hace sentir (menos|inútil|est[úu]pid|una basura)/i,
    /me insulta/i, /me grita/i, /\bdesprecio\b/i, /humillaci[óo]n/i, /puts me down/i,
    /\bbelittl/i, /\bworthless\b/i,
  ],
  blame_shift: [
    /siempre es mi culpa/i, /me culpa de todo/i, /por mi culpa/i, /todo lo malo soy yo/i,
    /nunca se disculpa/i, /it'?s always my fault/i, /blames me/i,
  ],
  intermittent: [
    /ley del hielo/i, /castigo del silencio/i, /caliente y fr[íi]o/i, /hot and cold/i,
    /silent treatment/i, /love.?bomb/i, /me idealiza.{0,20}(despu[eé]s|luego|y luego)/i,
    /un d[íi]a bien.{0,15}(otro|al otro).{0,10}mal/i,
  ],
}

const FLAGS = Object.keys(PATTERNS) as RelationalFlag[]
const MIN_RECURRENCE = 2

function matches(flag: RelationalFlag, text: string): boolean {
  return PATTERNS[flag].some((re) => re.test(text))
}

/**
 * Escanea las notas (típicamente person_logs.note de una persona) y devuelve los
 * patrones de trato que RECURREN, con su consejo de auto-protección. Honesto:
 * sin recurrencia no afirma nada.
 */
export function detectRelationalFlags(notes: (string | null | undefined)[]): RelationalFlagsResult {
  const texts = notes.filter((n): n is string => typeof n === 'string' && n.trim().length > 0)

  const counts = new Map<RelationalFlag, number>()
  for (const text of texts) {
    for (const flag of FLAGS) {
      if (matches(flag, text)) counts.set(flag, (counts.get(flag) ?? 0) + 1)
    }
  }

  const flags: RelationalFlagHit[] = FLAGS.map((flag) => ({
    flag,
    label: LABELS[flag],
    occurrences: counts.get(flag) ?? 0,
    care: CARE[flag],
  }))
    .filter((h) => h.occurrences >= MIN_RECURRENCE)
    .sort((a, b) => b.occurrences - a.occurrences)

  // Nivel: 'concern' si un patrón se repite fuerte (≥3) o hay ≥2 patrones a la vez.
  let level: RelationalFlagLevel = 'none'
  if (flags.length > 0) {
    const strong = flags.some((f) => f.occurrences >= 3) || flags.length >= 2
    level = strong ? 'concern' : 'watch'
  }

  return {
    flags,
    level,
    seekSupport: level === 'concern',
    entriesScanned: texts.length,
  }
}
