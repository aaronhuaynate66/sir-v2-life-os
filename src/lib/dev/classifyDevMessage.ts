// SIR V2 — Clasifica un mensaje al bot de dev: ¿PREGUNTA de estado (Q&A actual)
// o PEDIDO de dev (bug/feature/cambio) que hay que capturar como issue?
// Anthropic directo (Haiku, liviano — mismo patrón que askDev).
//
// TRES resultados, y la distinción importa (fallo real del 28-jul-2026):
//   'status'  → el modelo JUZGÓ que es una pregunta.
//   'request' → el modelo juzgó que es un pedido → issue.
//   'unknown' → el clasificador NO PUDO correr (sin key, API caída, JSON malo).
//
// Antes los tres colapsaban en 'status'. Eso mezcla "Aaron preguntó algo" con
// "no tenemos idea de qué escribió", y un PEDIDO caído en el segundo caso se
// contestaba como pregunta de estado y desaparecía sin dejar rastro. El 25-jul el
// crédito de Anthropic se agotó: ese día TODO habría caído a 'status', pedidos
// incluidos. 'unknown' sigue siendo conservador —tampoco crea issues solo— pero
// deja que el caller avise y lo marque para revisión (`dev_inbox_messages`,
// mig 0172) en vez de tragárselo.

const SYS = `Clasificas un mensaje que Aaron le mandó al bot de DEV de su proyecto SIR (por Telegram).
Decide si es:
- "status": una PREGUNTA sobre el estado del repo/deploy/CI (ej: "¿pasó CI?", "¿qué PRs hay?", "¿se deployó?", "¿último commit?", "¿cómo viene X?").
- "request": un PEDIDO DE DESARROLLO — reportar un bug, pedir un arreglo, una mejora o un cambio (ej: "el botón X no anda", "arregla Y", "quiero que Z", "falta A", "cuando hago B pasa C", "estaría bueno que...").
Si es "request", genera un TÍTULO corto para un issue de GitHub: máx 70 chars, imperativo/descriptivo, español, sin comillas.
Ante la duda, elige "status" (es más seguro no crear un issue de más).
Devuelve SOLO JSON, sin texto extra ni markdown: {"kind":"status"} o {"kind":"request","title":"..."}.`

export type DevIntent =
  | { kind: 'status' }
  | { kind: 'request'; title: string }
  /** El clasificador no pudo juzgar. `reason` queda en el log, no se le muestra. */
  | { kind: 'unknown'; reason: string }

/** Extrae el veredicto del cuerpo de la respuesta de Anthropic. PURO —
 *  separado para poder testear el parseo sin red. */
export function parseDevIntent(body: unknown): DevIntent {
  try {
    const content = (body as { content?: Array<{ text?: string }> })?.content
    const raw = (content?.[0]?.text || '').trim()
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/, '')
      .trim()
    if (!raw) return { kind: 'unknown', reason: 'respuesta vacía' }
    const parsed = JSON.parse(raw)
    if (parsed?.kind === 'request' && typeof parsed.title === 'string' && parsed.title.trim()) {
      return { kind: 'request', title: parsed.title.trim().slice(0, 70) }
    }
    // Un 'status' EXPLÍCITO del modelo es un juicio real y se respeta.
    if (parsed?.kind === 'status') return { kind: 'status' }
    // Cualquier otra cosa (kind raro, request sin título) no es un juicio válido.
    return { kind: 'unknown', reason: `kind inesperado: ${JSON.stringify(parsed?.kind ?? null)}` }
  } catch {
    return { kind: 'unknown', reason: 'JSON no parseable' }
  }
}

export async function classifyDevMessage(text: string): Promise<DevIntent> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return { kind: 'unknown', reason: 'sin ANTHROPIC_API_KEY' }
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 120,
        system: SYS,
        messages: [{ role: 'user', content: text }],
      }),
    })
    // Incluye el 400 de "credit balance too low" que tumbó todo el 25-jul.
    if (!res.ok) return { kind: 'unknown', reason: `API ${res.status}` }
    return parseDevIntent(await res.json())
  } catch {
    return { kind: 'unknown', reason: 'error de red' }
  }
}
