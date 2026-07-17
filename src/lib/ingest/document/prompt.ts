// SIR V2 — Prompt + parser de la ingestión documental.
//
// El route arma el input desde el TEXTO ya extraído del documento (pdfjs
// client-side o texto pegado) y le pide a Sonnet una síntesis + memorias
// notables en JSON. El parser es PURO y tolerante (extrae el primer bloque
// JSON aunque venga con prosa/fences) → testeable sin red ni LLM.
//
// INVARIANTES (mismos guardrails que la derivación de memorias):
//   - Sólo hechos presentes en el documento. PROHIBIDO inventar.
//   - Sin diagnóstico clínico, etiquetas de salud mental ni consejo médico.
//   - Sin causalidad ni predicción salvo que el propio documento la afirme
//     (y en ese caso, atribuida al documento, no como verdad de SIR).
//   - Honesto: si el texto es ilegible/vacío, legible=false y memories=[].

import type { DocKind, DocMemoryProposal, DocMemoryType } from './types'

export const DOCUMENT_INGEST_SYSTEM_PROMPT = `Eres el módulo de ingestión documental de SIR, un sistema operativo personal centrado en el bienestar del usuario.

Recibes el TEXTO de un documento que el usuario subió (un informe, un artículo/paper, una entrada de journal, un contrato, una nota). El texto puede venir con ruido de extracción (saltos raros, números de página, encabezados repetidos). Tu tarea es destilarlo en una síntesis breve + una lista de MEMORIAS notables y reutilizables, en JSON.

Devuelve EXCLUSIVAMENTE un objeto JSON con esta forma (sin texto adicional, sin markdown fences):
{
  "title": "título corto y descriptivo del documento",
  "docKind": "informe" | "articulo" | "journal" | "contrato" | "nota" | "otro",
  "legible": true | false,
  "summary": "2-5 oraciones en prosa que resuman de qué trata y por qué importa. Español neutro, sobrio.",
  "memories": [
    {
      "type": "semantic" | "episodic" | "emotional" | "temporal",
      "title": "string corto",
      "content": "1-3 oraciones factuales, en tercera persona, autocontenidas (que se entiendan sin el documento)",
      "importance": 1..10,
      "tags": ["string", ...]
    }
  ]
}

QUÉ EXTRAER:
- Los HECHOS, datos, conclusiones o compromisos NOTABLES del documento — los que valga la pena que SIR recuerde después.
- Cada memoria debe ser AUTOCONTENIDA: al leerla sin el documento, se entiende.
- Prefiere 'semantic' para conocimiento/datos estables; 'episodic' para un evento fechado; 'temporal' para plazos/fechas; 'emotional' SÓLO si el documento reporta un estado emocional explícito (típico en un journal).
- Carga 'importance' según cuánto importa el dato para el usuario (un plazo o una cifra clave = alto; un detalle marginal = bajo).

REGLAS ESTRICTAS:
- Entre 3 y 12 memorias. Si el documento es pobre, menos. Calidad > cantidad, pero no subextraigas un documento rico.
- Usa SOLO información presente en el texto. PROHIBIDO inventar hechos, nombres, fechas o cifras.
- PROHIBIDO: diagnóstico clínico, etiquetas de salud mental, consejo médico/psicológico. Si el documento es médico, reporta lo que DICE ("el informe indica X") sin interpretar ni diagnosticar.
- Sin dramatizar. Tono observacional. Español del Perú (peruano neutro, de Lima); registro liviano en el resumen si quieres, pero factual. Escribe SIEMPRE en español del Perú (tuteo con "tú"); PROHIBIDO el voseo y los giros argentinos ("vos", "sos", "tenés", "querés", "mirá", "che", "dale").
- Si el texto está vacío, es ilegible, o es sólo ruido de extracción (un scan sin texto real), devuelve legible=false, summary explicando el problema, y memories=[].`

/** Recorte defensivo del texto para no inflar el input al LLM. */
const MAX_INPUT_CHARS = 40_000

export function buildDocumentInput(
  filename: string,
  text: string,
  opts: { pagesRead?: number; totalPages?: number } = {},
): string {
  const clipped = text.length > MAX_INPUT_CHARS ? text.slice(0, MAX_INPUT_CHARS) : text
  const truncated = text.length > MAX_INPUT_CHARS
  const parts: string[] = []
  parts.push(`Archivo: ${filename || '(sin nombre)'}`)
  if (opts.totalPages) {
    parts.push(`Páginas: ${opts.pagesRead ?? '?'} leídas de ${opts.totalPages}`)
  }
  if (truncated) {
    parts.push(`(Texto recortado a ${MAX_INPUT_CHARS} caracteres — se procesa el comienzo.)`)
  }
  parts.push('', 'TEXTO DEL DOCUMENTO:', '"""', clipped, '"""', '', 'Destila la síntesis y las memorias en el JSON especificado.')
  return parts.join('\n')
}

// ─── Parser puro y tolerante ─────────────────────────────────────────

const VALID_DOC_KINDS: readonly DocKind[] = ['informe', 'articulo', 'journal', 'contrato', 'nota', 'otro']
const VALID_MEMORY_TYPES: readonly DocMemoryType[] = ['semantic', 'episodic', 'emotional', 'temporal']

export interface ParsedDocumentResponse {
  title: string
  docKind: DocKind
  legible: boolean
  summary: string
  memories: DocMemoryProposal[]
}

function clampImportance(x: unknown): number {
  const n = typeof x === 'number' && Number.isFinite(x) ? Math.round(x) : 5
  return Math.min(10, Math.max(1, n))
}

function coerceType(x: unknown): DocMemoryType {
  return VALID_MEMORY_TYPES.includes(x as DocMemoryType) ? (x as DocMemoryType) : 'semantic'
}

function coerceKind(x: unknown): DocKind {
  return VALID_DOC_KINDS.includes(x as DocKind) ? (x as DocKind) : 'otro'
}

function cleanStr(x: unknown, cap: number): string {
  return typeof x === 'string' ? x.trim().slice(0, cap) : ''
}

/**
 * Parsea la respuesta del LLM. Tolerante: extrae el primer bloque {...} aunque
 * venga con prosa o fences. Devuelve null si no hay JSON válido (el caller
 * decide el fallback / error). Nunca lanza.
 */
export function parseDocumentResponse(raw: string): ParsedDocumentResponse | null {
  if (!raw || typeof raw !== 'string') return null
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const obj = parsed as Record<string, unknown>

  const rawMemories = Array.isArray(obj.memories) ? obj.memories : []
  const memories: DocMemoryProposal[] = []
  for (const m of rawMemories) {
    if (typeof m !== 'object' || m === null) continue
    const mo = m as Record<string, unknown>
    const content = cleanStr(mo.content, 800)
    if (content.length === 0) continue // una memoria sin contenido no sirve
    memories.push({
      type: coerceType(mo.type),
      title: cleanStr(mo.title, 160) || content.slice(0, 60),
      content,
      importance: clampImportance(mo.importance),
      tags: Array.isArray(mo.tags)
        ? mo.tags.filter((t): t is string => typeof t === 'string').map((t) => t.trim().slice(0, 40)).filter(Boolean).slice(0, 8)
        : [],
    })
  }

  // legible: respetamos el flag del LLM, pero si NO hay memorias lo forzamos a
  // false (un documento del que no salió nada no es "legible" a efectos útiles).
  const legibleFlag = obj.legible !== false
  const legible = legibleFlag && memories.length > 0

  return {
    title: cleanStr(obj.title, 160) || 'Documento',
    docKind: coerceKind(obj.docKind),
    legible,
    summary: cleanStr(obj.summary, 1200),
    memories,
  }
}
