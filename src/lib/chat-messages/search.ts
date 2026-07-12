// SIR V2 — Búsqueda full-text sobre el sustrato de chat (mig 0145).
//
// Complementa la VENTANA RECIENTE (read.ts) con recuperación por RELEVANCIA sobre
// TODO el historial de una persona: para preguntas sobre algo viejo y específico
// ("¿qué me dijo del terreno?") encuentra ese mensaje entre los miles del hilo.
//
// Usa el índice GIN to_tsvector('spanish', content). Todo FAIL-OPEN: sin índice,
// sin coincidencias o ante cualquier error → []. `extractSearchTerms` es PURO.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface ChatSearchHit {
  sender: string
  sent_at: string | null
  content: string
}

// Stopwords ES frecuentes (no aportan a la búsqueda; evitan queries triviales).
const STOP = new Set([
  'que', 'como', 'cual', 'cuando', 'donde', 'quien', 'para', 'por', 'con', 'sin',
  'los', 'las', 'una', 'unos', 'unas', 'del', 'este', 'esta', 'esto', 'eso', 'esa',
  'mas', 'muy', 'pero', 'porque', 'sobre', 'entre', 'hasta', 'desde', 'ese', 'esos',
  'algo', 'todo', 'todos', 'nada', 'hace', 'hola', 'dime', 'dice', 'dijo', 'sabes',
  'cuenta', 'contame', 'recuerdas', 'acuerdas', 'paso', 'pasa', 'tengo', 'tiene',
])

/**
 * Términos salientes de la pregunta para armar el tsquery (OR entre ellos, para
 * favorecer recall). PURO. Devuelve [] si no hay nada útil (query trivial).
 */
export function extractSearchTerms(text: string, max = 4): string[] {
  const words = (text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // sin tildes
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP.has(w))
  const seen = new Set<string>()
  const out: string[] = []
  // Más largas primero (suelen ser las más específicas/informativas).
  for (const w of words.sort((a, b) => b.length - a.length)) {
    if (seen.has(w)) continue
    seen.add(w)
    out.push(w)
    if (out.length >= max) break
  }
  return out
}

/**
 * Busca en el historial COMPLETO de una persona los mensajes más relevantes a la
 * consulta (FTS español, OR de términos salientes). Devuelve hasta `limit`, más
 * recientes primero. Fail-open → [].
 */
export async function searchChatMessages(
  supabase: SupabaseClient,
  userId: string,
  personId: string,
  query: string,
  limit = 6,
): Promise<ChatSearchHit[]> {
  const terms = extractSearchTerms(query)
  if (terms.length === 0) return []
  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('sender, sent_at, content')
      .eq('user_id', userId)
      .eq('person_id', personId)
      .textSearch('content', terms.join(' or '), { type: 'websearch', config: 'spanish' })
      .order('sent_at', { ascending: false })
      .limit(limit)
    if (error || !data) return []
    return data as ChatSearchHit[]
  } catch {
    return []
  }
}

/** Renderiza los hits como bloque para el prompt. '' si no hay. PURO. */
export function renderChatSearchBlock(hits: ChatSearchHit[], personName: string): string {
  if (!hits.length) return ''
  const lines = [`Mensajes del historial con ${personName} relevantes a la consulta (búsqueda en todo el chat):`]
  // Cronológico ascendente para leerlos como contexto.
  const asc = [...hits].sort((a, b) => (a.sent_at ?? '').localeCompare(b.sent_at ?? ''))
  for (const h of asc) {
    const who = h.sender === 'user' ? 'Aaron' : personName
    const when = (h.sent_at ?? '').slice(0, 10)
    lines.push(`  [${when}] ${who}: ${(h.content ?? '').slice(0, 220)}`)
  }
  return lines.join('\n')
}
