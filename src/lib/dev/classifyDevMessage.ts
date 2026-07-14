// SIR V2 — Clasifica un mensaje al bot de dev: ¿PREGUNTA de estado (Q&A actual)
// o PEDIDO de dev (bug/feature/cambio) que hay que capturar como issue?
// Anthropic directo (Haiku, liviano — mismo patrón que askDev). Fallback SEGURO:
// 'status' → nunca crea issues por accidente si el LLM no está o falla/parsea mal.

const SYS = `Clasificás un mensaje que Aaron le mandó al bot de DEV de su proyecto SIR (por Telegram).
Decidí si es:
- "status": una PREGUNTA sobre el estado del repo/deploy/CI (ej: "¿pasó CI?", "¿qué PRs hay?", "¿se deployó?", "¿último commit?", "¿cómo viene X?").
- "request": un PEDIDO DE DESARROLLO — reportar un bug, pedir un arreglo, una mejora o un cambio (ej: "el botón X no anda", "arreglá Y", "quiero que Z", "falta A", "cuando hago B pasa C", "estaría bueno que...").
Si es "request", generá un TÍTULO corto para un issue de GitHub: máx 70 chars, imperativo/descriptivo, español, sin comillas.
Ante la duda, elegí "status" (es más seguro no crear un issue de más).
Devolvé SOLO JSON, sin texto extra ni markdown: {"kind":"status"} o {"kind":"request","title":"..."}.`

export type DevIntent = { kind: 'status' } | { kind: 'request'; title: string }

export async function classifyDevMessage(text: string): Promise<DevIntent> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return { kind: 'status' }
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
    if (!res.ok) return { kind: 'status' }
    const j = await res.json()
    const raw = (j.content?.[0]?.text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
    const parsed = JSON.parse(raw)
    if (parsed?.kind === 'request' && typeof parsed.title === 'string' && parsed.title.trim()) {
      return { kind: 'request', title: parsed.title.trim().slice(0, 70) }
    }
    return { kind: 'status' }
  } catch {
    return { kind: 'status' }
  }
}
