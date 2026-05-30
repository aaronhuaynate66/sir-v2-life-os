'use client'
// SIR V2 — Browser-side helpers para notas de voz (#12).
//
// El audio se sube CLIENT-SIDE al bucket person-voice-notes (RLS por
// carpeta {userId}/...), luego se registra la observation vía
// POST /api/voice-notes. Playback usa signed URLs (bucket privado).

import { createClient } from '@/lib/supabase/client'
import type { Observation } from '@/lib/capture/observations/types'

const VOICE_BUCKET = 'person-voice-notes'

export interface VoiceNoteError {
  status: number
  message: string
  detail?: string
}

/** Extensión por mime (lo que MediaRecorder produzca). */
function extForMime(mime: string): string {
  if (mime.includes('webm')) return 'webm'
  if (mime.includes('mp4') || mime.includes('m4a')) return 'mp4'
  if (mime.includes('ogg')) return 'ogg'
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3'
  return 'bin'
}

export interface CreateVoiceNoteArgs {
  personId: string
  blob: Blob
  durationSec: number
  mime: string
}

/** Sube el audio a Storage y registra la observation. Devuelve la
 *  observation creada. Si el registro falla, el endpoint limpia el blob. */
export async function createVoiceNote(args: CreateVoiceNoteArgs): Promise<Observation> {
  const supabase = createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user?.id) {
    throw { status: 401, message: 'Sesión expirada. Recargá la página.' } as VoiceNoteError
  }
  const userId = authData.user.id
  const ext = extForMime(args.mime)
  const storagePath = `${userId}/${args.personId}/${crypto.randomUUID()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from(VOICE_BUCKET)
    .upload(storagePath, args.blob, { contentType: args.mime, upsert: false })
  if (uploadError) {
    throw { status: 0, message: `No se pudo subir el audio: ${uploadError.message}` } as VoiceNoteError
  }

  const res = await fetch('/api/voice-notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      person_id: args.personId,
      storage_path: storagePath,
      duration_sec: args.durationSec,
      mime: args.mime,
    }),
  })
  if (!res.ok) {
    let b: { error?: string; detail?: string } = {}
    try { b = await res.json() } catch { /* sin body */ }
    throw { status: res.status, message: b.error ?? `HTTP ${res.status}`, detail: b.detail } as VoiceNoteError
  }
  const json = (await res.json()) as { observation: Observation }
  return json.observation
}

/** Borrado suave (is_obsolete) + remove del blob. */
export async function deleteVoiceNote(observationId: string): Promise<void> {
  const res = await fetch('/api/voice-notes', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ observation_id: observationId }),
  })
  if (!res.ok) {
    let b: { error?: string; detail?: string } = {}
    try { b = await res.json() } catch { /* sin body */ }
    throw { status: res.status, message: b.error ?? `HTTP ${res.status}`, detail: b.detail } as VoiceNoteError
  }
}

/** Signed URL para reproducir (bucket privado). null si falla. */
export async function getVoiceNoteUrl(path: string, bucket = VOICE_BUCKET): Promise<string | null> {
  const supabase = createClient()
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}
