// SIR V2 — Cliente browser-side para memorias derivadas.
//
// Helper mínimo y tipado para descartar una memoria mala desde la ficha
// (mismo patrón que observations/client.discardObservation). Auth: las
// cookies de Supabase viajan automáticamente con fetch().

'use client'

class MemoryHttpError extends Error {
  status: number
  detail?: string
  constructor(status: number, message: string, detail?: string) {
    super(message)
    this.name = 'MemoryHttpError'
    this.status = status
    this.detail = detail
  }
}

async function readErrorBody(res: Response): Promise<{ error: string; detail?: string }> {
  try {
    return (await res.json()) as { error: string; detail?: string }
  } catch {
    return { error: `HTTP ${res.status}` }
  }
}

/**
 * PATCH /api/memories/{id} para DESCARTAR una memoria mal derivada
 * (is_obsolete=true). Deja de aparecer en la ficha. Soft-delete a propósito:
 * la fila queda como tombstone para que "Derivar" no la resucite. RLS
 * asegura ownership.
 */
export async function discardMemory(
  memoryId: string,
  reason?: string,
): Promise<{ ok: true }> {
  const res = await fetch(`/api/memories/${encodeURIComponent(memoryId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_obsolete: true, obsoleted_reason: reason }),
  })
  if (!res.ok) {
    const body = await readErrorBody(res)
    throw new MemoryHttpError(res.status, body.error, body.detail)
  }
  return { ok: true }
}

export { MemoryHttpError }
