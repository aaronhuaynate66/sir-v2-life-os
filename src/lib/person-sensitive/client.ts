'use client'
// SIR V2 — Cliente de información sensible por persona.
//
// Lee/escribe via /api/person-sensitive (RLS server-side) y sube la foto del
// documento directo al bucket PRIVADO person-documents (mismo patrón que las
// notas de voz). Nunca logueamos valores.

import { createClient } from '@/lib/supabase/client'
import type { PersonSensitiveData } from './types'

const DOCS_BUCKET = 'person-documents'

export interface SensitiveError {
  status: number
  message: string
  detail?: string
}

async function readErr(res: Response): Promise<{ error: string; detail?: string }> {
  try {
    return (await res.json()) as { error: string; detail?: string }
  } catch {
    return { error: `HTTP ${res.status}` }
  }
}

/** GET de los datos sensibles de una persona. Devuelve {} si no hay fila (o si
 *  la tabla aún no existe en prod → el endpoint responde vacío, no rompe). */
export async function getSensitiveData(personId: string): Promise<PersonSensitiveData> {
  const res = await fetch(`/api/person-sensitive?personId=${encodeURIComponent(personId)}`, {
    method: 'GET',
  })
  if (!res.ok) {
    const body = await readErr(res)
    throw { status: res.status, message: body.error, detail: body.detail } as SensitiveError
  }
  return (await res.json()) as PersonSensitiveData
}

/** Upsert de los datos sensibles. */
export async function saveSensitiveData(
  personId: string,
  data: PersonSensitiveData,
): Promise<PersonSensitiveData> {
  const res = await fetch('/api/person-sensitive', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ personId, ...data }),
  })
  if (!res.ok) {
    const body = await readErr(res)
    throw { status: res.status, message: body.error, detail: body.detail } as SensitiveError
  }
  return (await res.json()) as PersonSensitiveData
}

/** Sube la foto del documento al bucket privado. Devuelve el storage path. */
export async function uploadDocumentPhoto(personId: string, file: File): Promise<string> {
  const supabase = createClient()
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth?.user?.id
  if (!userId) throw { status: 401, message: 'No autenticado' } as SensitiveError

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  // Path con prefijo {userId}/ — requerido por la RLS del bucket.
  const path = `${userId}/${personId}/doc_${Date.now()}.${ext}`
  const { error } = await supabase.storage
    .from(DOCS_BUCKET)
    .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false })
  if (error) {
    throw { status: 0, message: `No se pudo subir la imagen: ${error.message}` } as SensitiveError
  }
  return path
}

/** URL firmada (temporal) para ver la foto del documento. null si falla. */
export async function getDocumentPhotoUrl(path: string): Promise<string | null> {
  const supabase = createClient()
  const { data, error } = await supabase.storage.from(DOCS_BUCKET).createSignedUrl(path, 3600)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}
