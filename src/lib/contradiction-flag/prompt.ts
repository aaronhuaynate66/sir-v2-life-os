// SIR V2 — Flag "⚠ contradice una nota": capa PURA (prompt + parseo).
//
// Cruza las NOTAS MANUALES que Aaron cargó sobre una persona (lo que él CREE /
// afirmó) contra el HILO REAL de la conversación (el sustrato canónico
// chat_messages, mig 0141) y marca contradicciones concretas, con el porqué y
// una cita del chat como evidencia. NO pisa la nota — solo la señala.
//
// Fuentes de notas (todas MANUALES / de Aaron, nunca derivadas por IA):
//   - people.notes            → "quién es" (texto libre).
//   - people.relational_notes → fricción / fortalezas / metas en común.
//   - observations manual_note → notas fechadas de "Anotar algo ahora".
// NUNCA person_sensitive_data.private_notes (aislada de la IA por diseño; el
// endpoint directamente no la lee).
//
// Diseño: conservador. Solo se reportan contradicciones REALES y sostenibles
// con una cita del hilo; la ausencia de evidencia NO es contradicción. Estos
// helpers son PUROS (testeables); la llamada al LLM vive en el route.

/** El origen de una nota — para etiquetarla en el prompt y en la UI. */
export type ManualNoteSource =
  | 'perfil' // people.notes ("quién es")
  | 'friccion' // relational_notes.tensions
  | 'fortaleza' // relational_notes.strengths
  | 'meta' // relational_notes.sharedGoals
  | 'nota_fechada' // observation manual_note

/** Etiqueta humana de cada fuente, para el prompt y la UI. */
export const NOTE_SOURCE_LABEL: Record<ManualNoteSource, string> = {
  perfil: 'Perfil',
  friccion: 'Fricción',
  fortaleza: 'Fortaleza',
  meta: 'Meta en común',
  nota_fechada: 'Nota fechada',
}

/** Una nota manual a contrastar contra el hilo. */
export interface ManualNote {
  /** Índice estable dentro de la lista enviada (el modelo lo referencia). */
  ref: number
  source: ManualNoteSource
  text: string
  /** YYYY-MM-DD si la nota es fechada (manual_note). */
  date?: string | null
}

/** Una contradicción detectada entre una nota y el hilo real. */
export interface ContradictionFinding {
  /** ref de la nota contradicha (para re-mostrar su texto/fuente en la UI). */
  noteRef: number
  /** Qué muestra la conversación que choca con la nota (el porqué). */
  observation: string
  /** Cita corta y verbatim del hilo que sostiene la contradicción. */
  quote: string
  /** Confianza del modelo en que es una contradicción REAL. */
  confidence: 'alta' | 'media'
}

const OWNER_LABEL = 'Aaron'
const DEFAULT_BUDGET = 14_000

export const CONTRADICTION_SYSTEM = `Eres el módulo de verificación de notas de SIR, un sistema operativo personal.

Tu tarea: contrastar las NOTAS MANUALES que el usuario (Aaron) escribió sobre una persona contra una MUESTRA REAL Y RECIENTE de su conversación de WhatsApp, y señalar SOLO las contradicciones genuinas — cosas que la nota afirma pero que la conversación real desmiente.

QUÉ ES UNA CONTRADICCIÓN (reportála):
- La nota afirma un hecho que el chat contradice ("no tiene pareja" vs. el chat habla de su novio).
- La nota describe una dinámica que el chat desmiente ("nunca responde rápido" vs. responde en minutos, seguido).
- La nota da por resuelto/cerrado algo que el chat muestra abierto o al revés.

QUÉ NO ES UNA CONTRADICCIÓN (NO lo reportes):
- Que el chat simplemente no mencione el tema de la nota. La AUSENCIA de evidencia NO es contradicción.
- Matices, cambios de tono normales, o que la nota esté incompleta.
- Que la nota sea vieja y el chat más nuevo, si no hay choque real de contenido.
- Especulación. Si no puedes citar una línea concreta del chat que lo sostenga, no lo reportes.

REGLAS ESTRICTAS:
- Sé CONSERVADOR. Ante la duda, NO reportes. Es mejor no marcar nada que marcar un falso positivo: cada marca le cuesta atención al usuario.
- Toda contradicción DEBE apoyarse en una cita corta y textual del hilo (campo "quote"), copiada tal cual aparece.
- Observacional, NO diagnóstico. Describes el choque de información; no etiquetas ni psicoanalizas a nadie.
- No inventes contenido que no esté en el chat ni en las notas.
- Si no hay ninguna contradicción real, devolvé una lista vacía. Es un resultado válido y frecuente.

FORMATO DE SALIDA — SOLO un objeto JSON válido, sin markdown, sin texto alrededor:
{"findings":[{"noteRef":<número de la nota>,"observation":"<qué muestra el chat que contradice la nota>","quote":"<cita textual y corta del hilo>","confidence":"alta"|"media"}]}
Si no hay contradicciones: {"findings":[]}`

/** Arma el transcript "Autor: texto" con la cola MÁS RECIENTE hasta `budget`
 *  caracteres. Filtra media/vacíos. PURO. (Gemelo del de fromSubstrate, acá
 *  local para no acoplar módulos.) */
export function buildTranscript(
  rows: ReadonlyArray<{ sender: string; content: string; is_media?: boolean | null }>,
  personName: string,
  budget: number = DEFAULT_BUDGET,
): string {
  const lines = rows
    .filter((r) => r.is_media !== true && (r.content ?? '').trim() && (r.content ?? '').trim() !== '[media]')
    .map((r) => `${r.sender === 'user' ? OWNER_LABEL : personName}: ${(r.content ?? '').replace(/\s+/g, ' ').trim()}`)
  const out: string[] = []
  let total = 0
  for (let i = lines.length - 1; i >= 0; i--) {
    total += lines[i].length + 1
    if (total > budget) break
    out.unshift(lines[i])
  }
  return out.join('\n')
}

/** Construye el mensaje de usuario: notas numeradas + transcript real. PURO. */
export function buildContradictionInput(
  personName: string,
  notes: ReadonlyArray<ManualNote>,
  transcript: string,
  msgCount: number,
): string {
  const parts: string[] = [
    `Persona: ${personName}`,
    '',
    `NOTAS MANUALES de Aaron sobre ${personName} (cada una con su número de referencia):`,
  ]
  for (const n of notes) {
    const dated = n.date ? ` · ${n.date}` : ''
    parts.push(`  [${n.ref}] (${NOTE_SOURCE_LABEL[n.source]}${dated}) ${n.text}`)
  }
  parts.push(
    '',
    `Muestra reciente y textual de la conversación real de WhatsApp entre Aaron y ${personName} (${msgCount} mensajes):`,
    '',
    transcript,
    '',
    `Devuelve el JSON con las contradicciones reales entre estas notas y la conversación. Si no hay ninguna, "findings":[].`,
  )
  return parts.join('\n')
}

/** Recorta el bloque JSON de una respuesta del modelo (tolera cercas ```json,
 *  prosa alrededor). Devuelve el substring del primer '{' al último '}'. */
function extractJsonBlock(raw: string): string {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return ''
  return raw.slice(start, end + 1)
}

/** Parseo TOLERANTE de la respuesta del modelo a findings validados. Descarta
 *  entradas mal formadas, refs fuera de rango, o sin cita. Idempotente. PURO. */
export function parseContradictionFindings(raw: string, validRefs: ReadonlySet<number>): ContradictionFinding[] {
  const block = extractJsonBlock(raw)
  if (!block) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(block)
  } catch {
    return []
  }
  const arr =
    parsed && typeof parsed === 'object' && Array.isArray((parsed as { findings?: unknown }).findings)
      ? (parsed as { findings: unknown[] }).findings
      : []
  const out: ContradictionFinding[] = []
  for (const el of arr) {
    if (!el || typeof el !== 'object') continue
    const o = el as Record<string, unknown>
    const noteRef = typeof o.noteRef === 'number' ? o.noteRef : Number(o.noteRef)
    if (!Number.isInteger(noteRef) || !validRefs.has(noteRef)) continue
    const observation = typeof o.observation === 'string' ? o.observation.trim() : ''
    const quote = typeof o.quote === 'string' ? o.quote.trim() : ''
    if (!observation || !quote) continue // sin porqué o sin evidencia → se descarta
    const confidence = o.confidence === 'alta' ? 'alta' : 'media'
    out.push({ noteRef, observation, quote, confidence })
  }
  return out
}
