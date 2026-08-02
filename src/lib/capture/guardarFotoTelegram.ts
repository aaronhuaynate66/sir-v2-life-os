// SIR V2 — Guardar una foto de Telegram que NO era una story social.
//
// El complemento con efectos de `clasificarFoto` (que es puro). Acá vive la
// llamada de visión, la subida al bucket y la escritura de la observación.
//
// POR QUÉ EXISTE: hasta el 2-ago-2026 el webhook mandaba toda foto al detector
// social y, si no era una story, la DESCARTABA — sin guardar imagen, sin crear
// observación y sin dejar rastro. Ver `clasificarFoto.ts` para el detalle.
//
// El orden importa: **primero se sube la imagen, después se clasifica**. Si la
// visión falla o se cae el modelo, la foto ya está en el bucket y la observación
// se crea igual con `unknown`. Al revés, un error de la IA volvería a perderla.

import type { SupabaseClient } from '@supabase/supabase-js'
import { complete } from '@/lib/llm'
import type { LlmImageMediaType } from '@/lib/llm'
import {
  CLASIFICAR_FOTO_PROMPT, parseFotoClasificada, necesitaRevision, respuestaDeFoto,
  type FotoClasificada,
} from './clasificarFoto'

/** Bucket donde caen las capturas sueltas de Telegram. */
export const BUCKET_FOTOS = 'person-documents'

export interface FotoGuardada {
  clasificada: FotoClasificada
  /** Ruta en el bucket, o null si la subida falló (la observación se crea igual). */
  rutaImagen: string | null
  observacionId: string | null
  /** Lo que hay que responderle en Telegram. */
  respuesta: string
}

/** Ruta determinística: `{userId}/telegram/{ts}-{rand}.{ext}` (el bucket exige el userId al inicio). */
function rutaDe(userId: string, mediaType: string, ahora: number, rand: string): string {
  const ext = mediaType.includes('png') ? 'png' : mediaType.includes('webp') ? 'webp' : 'jpg'
  return `${userId}/telegram/${ahora}-${rand}.${ext}`
}

/**
 * Guarda la foto pase lo que pase y devuelve qué decirle.
 *
 * NUNCA lanza: cualquier fallo termina en una observación `unknown` con lo que se
 * haya podido rescatar. Perder la foto en silencio es el bug que esto arregla, así
 * que ninguna rama puede terminar sin guardar.
 */
export async function guardarFotoTelegram(
  ctx: { supabase: SupabaseClient; userId: string },
  bytes: ArrayBuffer | Uint8Array,
  mediaType: string,
  caption: string | null,
  ahora: Date,
): Promise<FotoGuardada> {
  const { supabase, userId } = ctx
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const rand = Math.abs(buf.byteLength * 2654435761 % 1_000_000).toString(36)

  // 1. LA IMAGEN PRIMERO. Si esto sale bien, ya nada se pierde.
  let rutaImagen: string | null = null
  try {
    const ruta = rutaDe(userId, mediaType, ahora.getTime(), rand)
    const { error } = await supabase.storage.from(BUCKET_FOTOS)
      .upload(ruta, buf as unknown as Blob, { contentType: mediaType, upsert: false })
    if (!error) rutaImagen = ruta
  } catch { /* la observación se crea igual, sin imagen */ }

  // 2. Clasificar y transcribir. Si falla, `parseFotoClasificada` devuelve
  //    `unknown` con lo que haya — nunca null.
  let clasificada: FotoClasificada
  try {
    const res = await complete(
      {
        task: 'telegram_photo_classify', tier: 'capable', sensitivity: 'self', maxTokens: 1500,
        system: CLASIFICAR_FOTO_PROMPT,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', mediaType: mediaType as LlmImageMediaType, data: Buffer.from(buf).toString('base64') } },
          { type: 'text', text: caption?.trim() ? `Aaron escribió con la foto: "${caption.trim()}". Devuelve el JSON.` : 'Devuelve el JSON.' },
        ] }],
      },
      { supabase, userId },
    )
    clasificada = parseFotoClasificada(res.text)
  } catch {
    clasificada = parseFotoClasificada('')
  }

  // El caption es de Aaron, así que vale MÁS que lo que el modelo dedujo: se
  // antepone al texto en vez de perderse. La respuesta vieja lo ignoraba entero.
  const texto = [caption?.trim() ? `Aaron escribió: ${caption.trim()}` : '', clasificada.texto]
    .filter(Boolean).join('\n\n').slice(0, 8000)

  // 3. La observación, siempre.
  let observacionId: string | null = null
  try {
    const id = `obs_tg_${ahora.getTime()}_${rand}`
    const { error } = await supabase.from('observations').insert({
      id, user_id: userId,
      capture_type: clasificada.tipo,
      data: { text: texto, resumen: clasificada.resumen, via: 'telegram' },
      confidence: clasificada.tipo === 'unknown' ? 'low' : 'medium',
      needs_review: necesitaRevision({ ...clasificada, texto }),
      observed_at: ahora.toISOString(),
      captured_at: ahora.toISOString(),
      ...(rutaImagen ? { source_image_path: rutaImagen, storage_bucket: BUCKET_FOTOS } : {}),
    })
    if (!error) observacionId = id
  } catch { /* se responde igual: al menos la imagen está en el bucket */ }

  const base = respuestaDeFoto({ ...clasificada, texto })
  const respuesta = observacionId === null && rutaImagen === null
    ? '😕 No pude guardar la imagen. Reintenta, y si sigue fallando avísame — es un bug mío, no tuyo.'
    : base
  return { clasificada, rutaImagen, observacionId, respuesta }
}
