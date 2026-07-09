// SIR V2 — Transcripción de audio (Whisper, OpenAI). Server-only.
//
// Las notas de voz de WhatsApp llegan como ogg/opus. Claude no transcribe audio;
// usamos Whisper (OpenAI, la misma key que los embeddings). Devuelve el texto o
// lanza. El caller lo pasa por el pipeline de relato (runRelatoIngest).

const WHISPER_URL = 'https://api.openai.com/v1/audio/transcriptions'

export function isAudioTranscriptionConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY
}

/** Mapea el MIME del audio a la extensión que Whisper usa para detectar formato. */
function extFor(mimeType: string): string {
  const m = mimeType.toLowerCase()
  if (m.includes('ogg') || m.includes('opus')) return 'ogg'
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3'
  if (m.includes('mp4') || m.includes('m4a') || m.includes('aac')) return 'm4a'
  if (m.includes('wav')) return 'wav'
  if (m.includes('webm')) return 'webm'
  return 'ogg'
}

/**
 * Transcribe un audio a texto con Whisper. `lang` sesga el idioma (default 'es').
 * Lanza Error con `.status` en fallas de API para que el caller lo mapee.
 */
export async function transcribeAudio(bytes: ArrayBuffer, mimeType: string, lang = 'es'): Promise<string> {
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) {
    const e = new Error('OPENAI_API_KEY no configurada') as Error & { status?: number }
    e.status = 501
    throw e
  }
  const form = new FormData()
  form.append('file', new Blob([bytes], { type: mimeType }), `audio.${extFor(mimeType)}`)
  form.append('model', 'whisper-1')
  form.append('language', lang)
  form.append('response_format', 'text')

  const res = await fetch(WHISPER_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  })
  if (!res.ok) {
    const t = await res.text()
    const e = new Error(`Whisper API ${res.status}: ${t.slice(0, 200)}`) as Error & { status?: number }
    e.status = 502
    throw e
  }
  // response_format=text → el body es el texto plano.
  return (await res.text()).trim()
}
