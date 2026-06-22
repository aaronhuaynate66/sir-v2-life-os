// SIR V2 — Transcripción de audio (server-only) vía OpenAI Whisper.
// Reusa la misma OPENAI_API_KEY de los embeddings (Etapa 2). Sin dep nueva:
// fetch + multipart con FormData/Blob (Node 20 en Vercel los trae globales).
// Modelo whisper-1: ~US$0.006/min, soporta español, hasta 25MB por archivo.

const OPENAI_TRANSCRIBE_URL = 'https://api.openai.com/v1/audio/transcriptions'
const MODEL = 'whisper-1'

export class TranscribeError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'TranscribeError'
  }
}

/** Transcribe un buffer de audio a texto. language='es' para anclar español
 *  (igual auto-detecta, pero ayuda con audio mixto/ruidoso). */
export async function transcribeAudio(
  buffer: ArrayBuffer,
  filename: string,
  mime: string,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new TranscribeError('OPENAI_API_KEY no configurada en el server')

  const form = new FormData()
  form.append('file', new Blob([buffer], { type: mime || 'application/octet-stream' }), filename || 'audio')
  form.append('model', MODEL)
  form.append('language', 'es')

  const res = await fetch(OPENAI_TRANSCRIBE_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new TranscribeError(`Falló la transcripción (HTTP ${res.status}): ${detail.slice(0, 200)}`, res.status)
  }
  const json = (await res.json()) as { text?: string }
  const text = typeof json.text === 'string' ? json.text.trim() : ''
  if (!text) throw new TranscribeError('La transcripción volvió vacía')
  return text
}
