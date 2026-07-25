// SIR V2 — Búsqueda PROFUNDA en el historial de chat + honestidad de cobertura.
//
// POR QUÉ EXISTE (bug real, 2026-07-24): Aaron preguntó "¿Diana quedó en
// abonarme algo?" y SIR respondió «Revisé TODO el chat con Diana (72,003
// mensajes)... no encontré ningún mensaje». Falso por partida doble:
//   1. NO revisó nada: el contexto trae 6 hits de FTS (search.ts) sobre los
//      términos LITERALES de la pregunta, más una ventana reciente.
//   2. El mensaje SÍ existía — con OTRAS palabras: "Amor hoy te deposito lo que
//      te debo" (25-may-2026). Aaron dijo "abonar", ella dijo "depositar".
// Un falso negativo afirmado como exhaustivo es peor que no buscar: Aaron toma
// decisiones con eso.
//
// Qué hace este módulo:
//   a) DETECTA que la pregunta es de archivo ("¿qué me dijo?", "quedó en…").
//   b) EXPANDE la consulta a varias formas léxicas reales de WhatsApp peruano
//      (abonar → depositar / yape / plin / "te debo"), vía LLM barato.
//   c) BUSCA cada variante en el hilo completo y funde los resultados.
//   d) RENDERIZA un bloque que dice EXPLÍCITAMENTE con qué palabras se buscó y
//      que esto NO es lectura completa del hilo — el prompt prohíbe afirmar
//      exhaustividad a partir de él.
//
// Todo FAIL-OPEN: si la expansión o la búsqueda fallan, se cae al camino previo.

import type { SupabaseClient } from '@supabase/supabase-js'
import { complete } from '@/lib/llm/complete'
import type { ChatSearchHit } from './search'

/** Máximo de variantes léxicas que se buscan por turno. */
export const MAX_EXPANSION_QUERIES = 6
/** Hits que se piden por variante (antes de fundir). */
export const HITS_PER_QUERY = 4
/** Tope de mensajes que entran al prompt tras fundir todas las variantes. */
export const MAX_MERGED_HITS = 12

// Verbos/giros de "algo se dijo en la conversación" — el disparador honesto de
// una búsqueda de archivo. Se usan con \b para no pegar dentro de otra palabra.
const SAY_PATTERNS = [
  'dijo', 'dijiste', 'dije', 'dijimos', 'dicho', 'decia', 'decias', 'dice que',
  'menciono', 'mencionaste', 'comento', 'comentaste', 'conto', 'contaste',
  'prometio', 'prometiste', 'quedo en', 'quedamos', 'quedaste', 'acordamos', 'acordaste',
  'hablamos de', 'hablaron de', 'escribio', 'mando', 'pidio', 'ofrecio', 'avisó', 'aviso',
]
const SEARCH_PATTERNS = [
  'busca', 'buscar', 'buscaste', 'revisa', 'revisaste', 'encuentra', 'encontraste',
  'rastrea', 'en el chat', 'en la conversacion', 'en el historial', 'los mensajes',
  'alguna vez', 'recuerdas cuando', 'te acuerdas', 'me acuerdo',
]

function normalize(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * ¿La pregunta busca ALGO DICHO en el historial (y no el estado actual)? PURA.
 * Conservadora: pide al menos 3 palabras y una señal explícita de "se dijo" o
 * de "búscalo". Un falso positivo solo cuesta una expansión barata; un falso
 * negativo devuelve al recall superficial que produjo el bug.
 */
export function looksLikeArchiveQuery(text: string): boolean {
  const t = normalize(text)
  if (t.split(' ').filter(Boolean).length < 3) return false
  const hit = (p: string) =>
    p.includes(' ') ? t.includes(p) : new RegExp(`\\b${p}\\b`).test(t)
  return SAY_PATTERNS.some(hit) || SEARCH_PATTERNS.some(hit)
}

/** Prompt de expansión léxica. PURO. */
export function buildQueryExpansionPrompt(question: string, personName: string): string {
  return [
    `Aaron busca algo en su historial de WhatsApp con ${personName}.`,
    `Su pregunta: "${(question || '').slice(0, 400)}"`,
    '',
    'Devuelve las palabras/frases con las que ESA conversación pudo haberse escrito de verdad,',
    'en el español coloquial del Perú que se usa por WhatsApp (incluye jerga y sinónimos:',
    'plata/soles/luca, yape/plin/transferencia/depósito, "te debo"/"me prestas", etc.).',
    'No uses las palabras de la pregunta solamente: pon las VARIANTES que usaría la otra persona.',
    '',
    'Reglas:',
    `- Entre 3 y ${MAX_EXPANSION_QUERIES} consultas, de 1 a 3 palabras cada una.`,
    '- Deben ser trozos LITERALES tal como se tipean en el celular: sin tildes, en la persona en que se escribiría ("te debo", no "cuánto te debo"; "deposito", no "depositar").',
    '- Sin nombres propios, sin signos de pregunta, sin explicaciones.',
    '- Responde SOLO un array JSON de strings. Ejemplo: ["te debo","yape","deposito"]',
  ].join('\n')
}

/** Parsea la respuesta del expansor. Conservador y PURO: [] si no hay nada útil. */
export function parseExpansionQueries(raw: string, max = MAX_EXPANSION_QUERIES): string[] {
  const text = String(raw ?? '')
  let items: string[] = []
  const arr = text.slice(text.indexOf('['), text.lastIndexOf(']') + 1)
  if (arr.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(arr)
      if (Array.isArray(parsed)) items = parsed.map((v) => String(v ?? ''))
    } catch { /* cae al modo líneas */ }
  }
  if (items.length === 0) {
    items = text.split('\n').map((l) => l.replace(/^[\s\-*\d.)"']+/, '').replace(/["',]+$/, ''))
  }
  const seen = new Set<string>()
  const out: string[] = []
  for (const it of items) {
    const q = it.trim().replace(/^["']|["']$/g, '').trim()
    if (q.length < 3 || q.length > 40) continue
    if (q.split(/\s+/).length > 3) continue
    const key = normalize(q)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(q)
    if (out.length >= max) break
  }
  return out
}

/**
 * Pide al modelo barato las variantes léxicas. Fail-open → [] (el caller cae a
 * la búsqueda literal de siempre).
 */
export async function expandSearchQueries(
  question: string,
  personName: string,
  opts: { supabase?: SupabaseClient; userId?: string } = {},
): Promise<string[]> {
  try {
    const res = await complete({
      task: 'chat_deep_search_expansion',
      tier: 'cheap',
      sensitivity: 'third_party',
      maxTokens: 200,
      temperature: 0,
      messages: [{ role: 'user', content: buildQueryExpansionPrompt(question, personName) }],
    }, { supabase: opts.supabase as never, userId: opts.userId })
    return parseExpansionQueries(res.text)
  } catch {
    return []
  }
}

/**
 * Funde las listas de hits (una por variante) SIN perder diversidad léxica:
 * round-robin —el mejor de cada variante primero— y dedupe por fecha+texto.
 * Devuelve en orden cronológico ascendente, listo para leer. PURA.
 */
export function mergeSearchHits(lists: ChatSearchHit[][], cap = MAX_MERGED_HITS): ChatSearchHit[] {
  const picked: ChatSearchHit[] = []
  const seen = new Set<string>()
  const depth = Math.max(0, ...lists.map((l) => l.length))
  for (let i = 0; i < depth && picked.length < cap; i++) {
    for (const list of lists) {
      if (picked.length >= cap) break
      const h = list[i]
      if (!h) continue
      const key = `${h.sent_at ?? ''}|${(h.content ?? '').slice(0, 80)}`
      if (seen.has(key)) continue
      seen.add(key)
      picked.push(h)
    }
  }
  return picked.sort((a, b) => (a.sent_at ?? '').localeCompare(b.sent_at ?? ''))
}

/** Busca UNA variante en el hilo completo de una persona. Fail-open → []. */
async function searchOne(
  supabase: SupabaseClient,
  userId: string,
  personId: string,
  query: string,
  limit: number,
): Promise<ChatSearchHit[]> {
  const run = async (mode: 'fts' | 'ilike') => {
    let q = supabase
      .from('chat_messages')
      .select('sender, sent_at, content')
      .eq('user_id', userId)
      .eq('person_id', personId)
    q = mode === 'fts'
      ? q.textSearch('content', query, { type: 'websearch', config: 'spanish' })
      : q.ilike('content', `%${query}%`)
    const { data, error } = await q.order('sent_at', { ascending: false }).limit(limit)
    if (error || !data) return [] as ChatSearchHit[]
    return data as ChatSearchHit[]
  }
  try {
    // LITERAL PRIMERO. El FTS websearch trata una variante de 2-3 palabras como
    // AND de lemas ("cuanto te debo" ≠ "te debo") y se pierde justo la frase que
    // se buscaba; el ILIKE la encuentra tal cual está escrita ("Amor hoy te
    // deposito lo que te debo"). Si la frase exacta no aparece, el FTS aporta el
    // recall por lema (plural, conjugación, tildes).
    const literal = await run('ilike')
    if (literal.length > 0) return literal
    return await run('fts')
  } catch {
    return []
  }
}

/**
 * Búsqueda profunda: corre todas las variantes en paralelo sobre el hilo
 * completo y funde. Fail-open → []. `queries` viene de expandSearchQueries (+
 * los términos literales de la pregunta, que el caller antepone).
 */
export async function searchChatMessagesDeep(
  supabase: SupabaseClient,
  userId: string,
  personId: string,
  queries: string[],
  opts: { perQuery?: number; cap?: number } = {},
): Promise<ChatSearchHit[]> {
  const qs = queries.filter((q) => q && q.trim().length >= 3).slice(0, MAX_EXPANSION_QUERIES)
  if (qs.length === 0) return []
  const lists = await Promise.all(
    qs.map((q) => searchOne(supabase, userId, personId, q, opts.perQuery ?? HITS_PER_QUERY)),
  )
  return mergeSearchHits(lists, opts.cap ?? MAX_MERGED_HITS)
}

/**
 * Bloque para el prompt. Dice SIEMPRE con qué palabras se buscó y que esto no
 * es lectura completa del hilo — incluso (sobre todo) cuando no hubo
 * coincidencias, que es donde SIR mentía. PURO. '' si no se buscó nada.
 */
export function renderDeepSearchBlock(
  hits: ChatSearchHit[],
  personName: string,
  queries: string[],
): string {
  const qs = queries.filter(Boolean)
  if (qs.length === 0) return ''
  const palabras = qs.map((q) => `"${q}"`).join(', ')
  const head = `BÚSQUEDA EN EL HISTORIAL con ${personName} — búsqueda POR PALABRAS sobre todo el hilo (NO leíste el hilo completo).`
  const buscado = `Palabras buscadas: ${palabras}.`
  if (hits.length === 0) {
    return [
      head,
      buscado,
      'Resultado: CERO coincidencias con esas palabras.',
      'Eso NO prueba que no se haya dicho — puede estar dicho de otra forma. Responde diciendo con qué palabras buscaste y ofrece reintentar con otras o con una fecha aproximada. PROHIBIDO afirmar que revisaste todo el chat, cuántos mensajes revisaste, o que eso nunca pasó.',
    ].join('\n')
  }
  const lines = [head, buscado, `Encontrados ${hits.length} mensajes (los más relevantes por esas palabras, no todos):`]
  for (const h of hits) {
    const who = h.sender === 'user' ? 'Aaron' : personName
    const when = (h.sent_at ?? '').slice(0, 10)
    lines.push(`  [${when}] ${who}: ${(h.content ?? '').slice(0, 180)}`)
  }
  lines.push('Cita la FECHA y quién lo dijo cuando uses uno de estos mensajes.')
  return lines.join('\n')
}
