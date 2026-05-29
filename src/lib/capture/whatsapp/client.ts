// SIR V2 — Cliente para captura WhatsApp.
//
// 3 funciones publicas:
//   - extractWhatsAppCapture(blob, reflection): POST /api/capture/whatsapp
//   - persistWhatsAppCapture(args): upload Storage + append a relationships.history
//   - findPersonByName(name, userId): auto-match contra people por name/alias

'use client'

import type { Relationship, RelationshipEvent } from '@/types'
import { compressImage } from '@/lib/capture/scale/compress'
import { createClient } from '@/lib/supabase/client'
import { useRelationshipStore } from '@/stores/useRelationshipStore'
import type {
  PersonMatch,
  WhatsAppCaptureExtracted,
} from './types'

const STORAGE_BUCKET = 'whatsapp-captures'

// ─── extractWhatsAppCapture ─────────────────────────────────────────

/**
 * Comprime client-side, hace POST a /api/capture/whatsapp con FormData
 * (file + reflection), y devuelve el WhatsAppCaptureExtracted validado.
 */
export async function extractWhatsAppCapture(
  imageFile: Blob,
  reflection: boolean,
  signal?: AbortSignal,
): Promise<WhatsAppCaptureExtracted> {
  // Compresion: 1280px lado mayor, WebP q=0.85 (idem PASO 0 doc).
  const compressed = await compressImage(imageFile as File, { maxSize: 1280, quality: 0.85 })

  const formData = new FormData()
  formData.append('file', compressed.blob, 'capture.webp')
  formData.append('reflection', reflection ? 'true' : 'false')

  const res = await fetch('/api/capture/whatsapp', {
    method: 'POST',
    body: formData,
    signal,
  })

  if (!res.ok) {
    let detail: string | undefined
    try {
      const body = (await res.json()) as { error?: string; detail?: string }
      detail = body.error ?? body.detail
    } catch {
      detail = `HTTP ${res.status}`
    }
    throw new Error(detail ?? `Falló la extracción (${res.status})`)
  }
  return (await res.json()) as WhatsAppCaptureExtracted
}

// ─── findPersonByName ───────────────────────────────────────────────

/**
 * Limpia emojis del nombre y busca match case-insensitive contra
 * people.name y people.alias del user actual.
 *
 * Vol esperado de people: <50 — fetch all + filter client-side es trivial
 * y evita la sintaxis fragil de PostgREST .or() con caracteres unicode.
 */
export async function findPersonByName(
  rawName: string,
  userId: string,
): Promise<PersonMatch> {
  if (!rawName || typeof rawName !== 'string') {
    return { personId: null, confidence: 'low' }
  }

  // Strip emojis + caracteres no-alfanumericos preservando letras (incl. acentos),
  // numeros, espacios, guiones y apostrofes.
  const cleanName = rawName
    .replace(/[^\p{L}\p{N}\s'-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

  if (!cleanName) return { personId: null, confidence: 'low' }

  const supabase = createClient()
  const { data, error } = await supabase
    .from('people')
    .select('id, name, alias')
    .eq('user_id', userId)

  if (error || !data) return { personId: null, confidence: 'low' }

  const rows = data as unknown as Array<{ id: string; name: string | null; alias: string | null }>
  const matches = rows.filter((p) => {
    const name = String(p.name ?? '').toLowerCase()
    const alias = String(p.alias ?? '').toLowerCase()
    return name.includes(cleanName) || (alias.length > 0 && alias.includes(cleanName))
  })

  if (matches.length === 0) {
    return { personId: null, confidence: 'low' }
  }
  if (matches.length === 1) {
    return { personId: matches[0].id, confidence: 'high' }
  }
  // 2+ matches: devolver el primero pero con confidence medium para que la UI
  // muestre el selector.
  return { personId: matches[0].id, confidence: 'medium' }
}

// ─── persistWhatsAppCapture ─────────────────────────────────────────

export interface PersistArgs {
  extracted: WhatsAppCaptureExtracted
  /** ID de la persona (slug-id) — el user lo seleccionó/creó en el preview. */
  personId: string
  /** ISO 8601 — override si el user editó la fecha en el preview. */
  conversationDate: string
  /** WebP comprimido para subir a Storage. */
  imageBlob: Blob
}

export interface PersistResult {
  captureId: string
  sourceImagePath: string
}

/**
 * Sube el screenshot a Storage + crea un RelationshipEvent en
 * relationships.history para la persona objetivo. Si la persona no tiene
 * un Relationship row todavia, crea uno con defaults usando los datos
 * que conocemos de la Person (relationship type).
 */
export async function persistWhatsAppCapture(args: PersistArgs): Promise<PersistResult> {
  const supabase = createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError) throw authError
  const userId = authData?.user?.id
  if (!userId) throw new Error('No hay sesión activa.')

  const captureId = `cap_wa_${Date.now()}`
  const sourceImagePath = `${userId}/whatsapp/${captureId}.webp`

  // 1. Upload Storage
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(sourceImagePath, args.imageBlob, {
      contentType: 'image/webp',
      upsert: false,
    })
  if (uploadError) {
    throw new Error(`No se pudo subir la imagen: ${uploadError.message}`)
  }

  // 2. Construir el RelationshipEvent (item del jsonb history)
  const event: RelationshipEvent = {
    id: captureId,
    type: 'whatsapp_capture',
    date: args.conversationDate,
    description: args.extracted.summary || '(captura sin resumen)',
    // emotionalTone neutral por default; el user puede editarlo desde
    // /relaciones eventualmente. Vision Nivel B no emite un score numerico
    // por ahora — se deriva de los emotionalStates en una iteracion futura.
    emotionalTone: 0,
    // Campos opcionales del extension:
    captureKind: 'whatsapp',
    captureId,
    sourceImagePath,
    topics: args.extracted.topics,
    emotionalStates: args.extracted.emotionalStates,
    rawMessages: args.extracted.rawMessages,
    reflectionQuestions: args.extracted.reflectionQuestions,
    confidence: args.extracted.confidence,
  }

  // 3. Append al store. Si no existe Relationship row para esa persona, crearla.
  const state = useRelationshipStore.getState()
  const existing = state.relationships.find((r) => r.personId === args.personId)

  if (existing) {
    useRelationshipStore.setState((s) => ({
      relationships: s.relationships.map((r) =>
        r.id === existing.id
          ? { ...r, history: [...r.history, event] }
          : r,
      ),
    }))
  } else {
    // Crear Relationship con defaults. Type se infiere del Person.relationship.
    const person = state.people.find((p) => p.id === args.personId)
    const personRelationship = person?.relationship ?? 'acquaintance'
    const newRel: Relationship = {
      id: `rel_${args.personId}`,
      personId: args.personId,
      type: personRelationship,
      status: 'active',
      depth: 5,
      reciprocity: 5,
      history: [event],
      sharedGoals: [],
      tensions: [],
      strengths: [],
    }
    useRelationshipStore.setState((s) => ({
      relationships: [...s.relationships, newRel],
    }))
    // Nota: el sync engine pusheara la nueva relationship al DB automaticamente.
    // No actualizamos people.updated_at acá — irrelevante para el flujo y
    // evita la friction del typed Database client.
  }

  return { captureId, sourceImagePath }
}
