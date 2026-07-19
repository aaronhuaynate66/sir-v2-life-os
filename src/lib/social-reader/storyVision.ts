// SIR V2 — Visión de un screenshot social compartido a SIR (screenshot→timing).
//
// El camino mobile-native: Aaron ve una story en el celular, le manda la captura
// al bot de SIR, y SIR lee —con visión— de QUIÉN es (handle IG / nombre) y QUÉ
// dice (caption/overlay), para derivar la señal de timing. Anti-alucinación: solo
// lo que se ve literal; si no es una captura social reconocible, isSocial=false.

import type { SupabaseClient } from '@supabase/supabase-js'

import { complete } from '@/lib/llm'
import type { LlmImageMediaType } from '@/lib/llm/types'

export interface StoryVisionResult {
  isSocial: boolean
  platform: 'instagram' | 'linkedin' | 'other'
  /** Handle IG (sin @) si se ve literal (ej. arriba de una story). null si no. */
  handle: string | null
  /** Nombre visible de la persona/cuenta. null si no. */
  name: string | null
  /** Caption / overlay / texto de la story, o headline de LinkedIn. null si no. */
  text: string | null
}

export const STORY_VISION_SYSTEM = `Eres un extractor. Miras UN screenshot que Aaron compartió (normalmente una STORY o perfil de Instagram, o un perfil de LinkedIn) y devuelves QUIÉN es y QUÉ dice, para que SIR sepa el "momento" de esa persona.

Escribe en español del Perú si generás texto; PROHIBIDO el voseo.

Devuelve EXCLUSIVAMENTE un JSON (sin prosa, sin fences):
{
  "isSocial": <true si es una captura de Instagram/LinkedIn de una persona; false si es otra cosa>,
  "platform": "instagram" | "linkedin" | "other",
  "handle": "<handle de IG SIN @, tal como se ve arriba de la story o en el perfil; null si no se ve>",
  "name": "<nombre visible de la persona/cuenta; null si no se ve>",
  "text": "<el caption/overlay/texto de la story, o el headline de LinkedIn — LITERAL; null si no hay texto legible>"
}

REGLAS DURAS (anti-alucinación):
- Copia LITERAL lo que ves. NUNCA inventes un handle, un nombre ni texto. Si algo no se lee, va null.
- El handle suele estar arriba de la story (ej. "dayrrit") o en el perfil (@usuario). Si solo ves el nombre y no el handle, handle=null y name=<lo que ves>.
- "text" es lo que la persona escribió/puso en la story (ej. "Una escapadita ✈️"), o el headline en LinkedIn. Incluí emojis. No describas la foto; solo el TEXTO visible.
- Si NO es una captura de Instagram/LinkedIn de una persona (es un meme, un chat, un documento, etc.): isSocial=false y el resto null.
Empieza con { y termina con }.`

function stripFences(s: string): string {
  const t = s.trim()
  return t.startsWith('```') ? t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim() : t
}
function strOrNull(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}

/** Parsea la respuesta de visión. PURO. null si no parsea. */
export function parseStoryVision(raw: string): StoryVisionResult | null {
  let parsed: unknown
  try { parsed = JSON.parse(stripFences(raw)) } catch { return null }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const o = parsed as Record<string, unknown>
  const platform = o.platform === 'instagram' || o.platform === 'linkedin' ? o.platform : 'other'
  let handle = strOrNull(o.handle, 60)
  if (handle) handle = handle.replace(/^@/, '').toLowerCase()
  return {
    isSocial: o.isSocial === true,
    platform,
    handle,
    name: strOrNull(o.name, 120),
    text: strOrNull(o.text, 300),
  }
}

/** Llama a visión (capable, third_party) sobre el screenshot. null si falla. */
export async function extractStoryVision(
  ctx: { supabase: SupabaseClient; userId: string },
  imageBase64: string,
  mediaType: LlmImageMediaType,
): Promise<StoryVisionResult | null> {
  const res = await complete(
    {
      task: 'social_story_vision', tier: 'capable', sensitivity: 'third_party', maxTokens: 400,
      system: STORY_VISION_SYSTEM,
      messages: [
        { role: 'user', content: [
          { type: 'image', source: { type: 'base64', mediaType, data: imageBase64 } },
          { type: 'text', text: '¿De quién es esta captura y qué dice? Devuelve el JSON.' },
        ] },
        { role: 'assistant', content: '{' },
      ],
    },
    { supabase: ctx.supabase, userId: ctx.userId },
  )
  return parseStoryVision(res.text ? `{${res.text}` : '')
}
