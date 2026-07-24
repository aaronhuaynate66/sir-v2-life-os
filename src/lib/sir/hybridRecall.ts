// SIR V2 — Ola 3: helper del recall HÍBRIDO de memorias (vector + FTS, RRF).
//
// El RPC match_memories_hybrid (mig 0164) recibe, además del embedding, un
// `query_text` para la rama full-text. NO le pasamos el retrievalText crudo (hasta
// 1500 chars): websearch_to_tsquery ANDea los términos por defecto → un blob largo
// no matchea casi nada. Reusamos el mismo extractor que la búsqueda de chat (0145):
// términos salientes (sin stopwords, sin tildes) unidos con OR para favorecer recall.

import { extractSearchTerms } from '../chat-messages/search'

/**
 * Arma el `query_text` para la rama FTS del recall híbrido: términos salientes de la
 * consulta unidos con OR. PURO. Devuelve '' si no hay término útil (query trivial) →
 * el RPC cae a vector puro. Mismo criterio que searchChatMessages.
 */
export function buildMemoryFtsQuery(retrievalText: string): string {
  const terms = extractSearchTerms(retrievalText)
  if (terms.length === 0) return ''
  return terms.join(' or ')
}
