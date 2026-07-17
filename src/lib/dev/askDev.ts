// SIR V2 — Cerebro del bot de dev: responde una pregunta técnica sobre el repo
// usando el estado de GitHub como contexto. Anthropic directo (liviano). Fail-open:
// sin API key → devuelve el estado formateado tal cual (igual es útil).

import { formatGithubStatus, type GithubStatus } from '@/lib/dev/githubStatus'

const SYS = `Eres el asistente técnico de SIR (proyecto de Aaron), respondiendo por Telegram al bot de dev. Escribe SIEMPRE en español del Perú (tuteo con "tú"); PROHIBIDO el voseo y los giros argentinos ("vos", "sos", "tenés", "querés", "mirá", "che", "dale"). Te paso el ESTADO REAL del repo (commits, CI, PRs). Responde la pregunta de Aaron de forma BREVE y concreta, en español, texto plano (sin markdown). Si la pregunta no se puede responder con el estado dado, dilo. No inventes.`

export async function askDev(question: string, status: GithubStatus): Promise<string> {
  const statusText = formatGithubStatus(status)
  const key = process.env.ANTHROPIC_API_KEY
  // Sin key → el estado crudo ya responde la mayoría de las preguntas.
  if (!key) return statusText
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 600,
        system: SYS,
        messages: [{ role: 'user', content: `ESTADO DEL REPO:\n${statusText}\n\nPREGUNTA: ${question}` }],
      }),
    })
    if (!res.ok) return statusText
    const j = await res.json()
    const answer = (j.content?.[0]?.text || '').trim()
    return answer || statusText
  } catch {
    return statusText
  }
}
