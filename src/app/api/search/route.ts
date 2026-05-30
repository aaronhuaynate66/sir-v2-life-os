// SIR V2 — POST /api/search (Fase 3b: búsqueda semántica)
//
// Embeddea la query del usuario y la matchea contra memories.embedding vía
// el RPC match_memories (cosine). Devuelve memorias rankeadas por similitud.
//
// Gate de Fase 3b: "Usuario puede preguntar 'que paso cuando me sentia
// ansioso por trabajo' y obtener resultados".
//
// Body JSON: { query: string, limit?: number, threshold?: number }
// Response 200: { results: SemanticSearchResult[], model }
//
// Requiere OPENAI_API_KEY (502 si falla la API) + memories embeddeadas
// (correr /api/memories/embed primero). RLS: el RPC filtra auth.uid().

import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { embedText, toPgVector, EMBEDDING_MODEL, EmbeddingError } from '@/lib/embeddings/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export interface SemanticSearchResult {
  id: string
  title: string
  content: string
  type: string
  personId: string | null
  occurredAt: string
  importance: number | null
  similarity: number
}

interface ErrorBody {
  error: string
  detail?: string
}
function errorJson(status: number, error: string, detail?: string): NextResponse<ErrorBody> {
  return NextResponse.json({ error, detail }, { status })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')
  }

  let body: { query?: unknown; limit?: unknown; threshold?: unknown }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return errorJson(400, 'Body JSON invalido')
  }
  if (typeof body.query !== 'string' || body.query.trim().length === 0) {
    return errorJson(400, 'query requerido (string no vacio)')
  }
  const query = body.query.trim().slice(0, 1000)
  const limit =
    typeof body.limit === 'number' && Number.isFinite(body.limit)
      ? Math.max(1, Math.min(50, Math.floor(body.limit)))
      : 10
  const threshold =
    typeof body.threshold === 'number' && Number.isFinite(body.threshold)
      ? Math.max(0, Math.min(1, body.threshold))
      : 0.0

  // 1. Embeddear la query.
  let queryEmbedding: number[]
  try {
    queryEmbedding = await embedText(query)
  } catch (e) {
    if (e instanceof EmbeddingError) {
      return errorJson(502, 'Falló la generación del embedding de la consulta', e.message)
    }
    return errorJson(500, 'Error inesperado embeddeando la consulta', e instanceof Error ? e.message : String(e))
  }

  // 2. RPC de similitud (RLS-scoped por auth.uid()).
  const { data, error } = await supabase.rpc('match_memories', {
    query_embedding: toPgVector(queryEmbedding),
    match_count: limit,
    similarity_threshold: threshold,
  })
  if (error) {
    return errorJson(500, 'Falló la búsqueda por similitud', error.message)
  }

  const results: SemanticSearchResult[] = ((data as Record<string, unknown>[]) ?? []).map((r) => ({
    id: r.id as string,
    title: (r.title as string) ?? '',
    content: (r.content as string) ?? '',
    type: (r.type as string) ?? '',
    personId: (r.person_id as string | null) ?? null,
    occurredAt: r.occurred_at as string,
    importance: r.importance !== null && r.importance !== undefined ? Number(r.importance) : null,
    similarity: Number(r.similarity) || 0,
  }))

  return NextResponse.json({ results, model: EMBEDDING_MODEL }, { status: 200 })
}
