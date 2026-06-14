// SIR V2 — Empresa Fase B: extracción de info para una ficha de empresa/holding.
// PURO + testeable. Dos fuentes:
//   - TEXTO pegado (camino robusto): el modelo estructura description/sectors/
//     notes SIN inventar (sitios JS-rendered no se scrapean fiable).
//   - URL: metaFromHtml saca meta description / og:* / <title> del HTML como
//     prefill best-effort (lo único confiable sin render).
// No persiste nada: alimenta el form de EditOrgProfile para REVISIÓN antes de
// guardar (vía el POST /api/empresas/profile existente).

export const EXTRACT_SYSTEM_PROMPT = `Sos un asistente que estructura información PÚBLICA de una empresa a partir de texto que el usuario pegó (de su web, LinkedIn, etc.).

Devolvé EXCLUSIVAMENTE un objeto JSON válido, sin texto alrededor, con esta forma:
{"description": string, "sectors": string[], "notes": string}

Reglas:
- SOLO usá lo que está en el texto. NO inventes datos, cifras, nombres ni sectores que no aparezcan.
- "description": 1-3 frases en español, qué es la empresa/grupo y a qué se dedica. Sin marketing vacío.
- "sectors": lista corta de sectores/rubros explícitos (ej. "seguridad", "construcción"). [] si no hay.
- "notes": contexto útil que valga la pena recordar (sede, sub-empresas/portafolio, fundadores, hitos). Vacío "" si no hay.
- Si el texto no alcanza para algo, dejá el campo vacío. Nunca rellenes con suposiciones.`

export interface ExtractInput {
  text: string
  label?: string | null
}

export function buildExtractInput(input: ExtractInput): string {
  const head = input.label ? `Empresa: ${input.label}\n\n` : ''
  return `${head}Texto pegado:\n"""\n${input.text.slice(0, 12000)}\n"""\n\nDevolvé el JSON.`
}

export interface ExtractedProfile {
  description: string
  sectors: string[]
  notes: string
}

function cap(s: unknown, max: number): string {
  return typeof s === 'string' ? s.trim().slice(0, max) : ''
}

/** Parsea la respuesta del modelo (JSON, tolera fences/ruido) → perfil saneado.
 *  null si no hay nada utilizable. */
export function parseExtraction(raw: string): ExtractedProfile | null {
  if (!raw) return null
  // Aislar el primer objeto {...} aunque venga con ```json o texto.
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }
  const description = cap(obj.description, 2000)
  const sectors = Array.isArray(obj.sectors)
    ? obj.sectors
        .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
        .slice(0, 12)
        .map((x) => x.trim().slice(0, 60))
    : []
  const notes = cap(obj.notes, 4000)
  if (!description && sectors.length === 0 && !notes) return null
  return { description, sectors, notes }
}

/** Pliega los sectores en una línea de notas (el POST de profile no guarda
 *  sectors como columna; van al texto de notas, legible). */
export function foldNotes(notes: string, sectors: string[]): string {
  if (sectors.length === 0) return notes
  const line = `Sectores: ${sectors.join(', ')}.`
  return notes ? `${line}\n${notes}` : line
}

export interface HtmlMeta {
  description: string
  name: string
  website: string
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim()
}

/** Lee el atributo `attr` de un tag <meta ...> (tolera orden y comillas). */
function metaContent(html: string, key: 'name' | 'property', value: string): string {
  // <meta name="description" content="..."> o con content primero.
  const tagRe = /<meta\b[^>]*>/gi
  let m: RegExpExecArray | null
  while ((m = tagRe.exec(html)) !== null) {
    const tag = m[0]
    const kv = new RegExp(`${key}\\s*=\\s*["']${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i')
    if (!kv.test(tag)) continue
    const c = /content\s*=\s*["']([^"']*)["']/i.exec(tag)
    if (c) return decodeEntities(c[1])
  }
  return ''
}

/** Extrae meta description / og:* / <title> del HTML crudo. PURO.
 *  Sirve como prefill best-effort cuando el usuario da una URL. */
export function metaFromHtml(html: string, url?: string): HtmlMeta {
  const safe = html ?? ''
  const description =
    metaContent(safe, 'property', 'og:description') ||
    metaContent(safe, 'name', 'description') ||
    metaContent(safe, 'name', 'twitter:description')
  const ogSite = metaContent(safe, 'property', 'og:site_name')
  const titleM = /<title[^>]*>([^<]*)<\/title>/i.exec(safe)
  const name = ogSite || (titleM ? decodeEntities(titleM[1]) : '')
  const ogUrl = metaContent(safe, 'property', 'og:url')
  return {
    description,
    name: name.slice(0, 160),
    website: (ogUrl || url || '').slice(0, 300),
  }
}
