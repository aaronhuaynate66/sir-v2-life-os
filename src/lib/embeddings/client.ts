// SIR V2 — Generación de embeddings (Fase 3b, búsqueda semántica).
//
// Server-side ONLY. Usa la API de embeddings de OpenAI vía fetch (sin dep
// nueva). Modelo default: text-embedding-3-small (1536 dims) — debe
// coincidir con la dimensión de memories.embedding (migration 0015).
//
// Requiere OPENAI_API_KEY en el server (NO es NEXT_PUBLIC: solo se usa en
// route handlers). Si falta, embedText lanza un error claro que el endpoint
// traduce a 500.
//
// Para cambiar de proveedor (Voyage, Cohere, etc.): reemplazar la llamada
// fetch + ajustar EMBEDDING_MODEL/EMBEDDING_DIM + la dimensión en SQL.

export const EMBEDDING_MODEL = 'text-embedding-3-small'
export const EMBEDDING_DIM = 1536

const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings'

export class EmbeddingError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'EmbeddingError'
  }
}

interface OpenAIEmbeddingResponse {
  data: Array<{ embedding: number[]; index: number }>
}

/** Embeddea un batch de textos en una sola llamada. Preserva el orden de
 *  entrada (reordena por `index` por las dudas). */
export async function embedBatch(inputs: string[]): Promise<number[][]> {
  if (inputs.length === 0) return []
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new EmbeddingError('OPENAI_API_KEY no configurada en el server')
  }

  const res = await fetch(OPENAI_EMBEDDINGS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: inputs,
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new EmbeddingError(
      `Falló la API de embeddings (HTTP ${res.status}): ${detail.slice(0, 200)}`,
      res.status,
    )
  }

  const json = (await res.json()) as OpenAIEmbeddingResponse
  if (!json.data || json.data.length !== inputs.length) {
    throw new EmbeddingError('Respuesta de embeddings con cantidad inesperada')
  }
  const ordered = [...json.data].sort((a, b) => a.index - b.index)
  return ordered.map((d) => d.embedding)
}

/** Embeddea un solo texto. */
export async function embedText(input: string): Promise<number[]> {
  const [vec] = await embedBatch([input])
  return vec
}

/** Formatea un pgvector literal ("[0.1,0.2,...]") para pasarlo a Supabase. */
export function toPgVector(embedding: number[]): string {
  return `[${embedding.join(',')}]`
}
