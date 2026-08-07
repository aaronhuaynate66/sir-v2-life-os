// SIR V2 — Una foto de BÁSCULA que llega por Telegram sí actualiza el peso.
//
// ═══ POR QUÉ EXISTE ═══════════════════════════════════════════════════════════
//
// El brief le dice a Aaron, todas las mañanas: *"Te falta subir: Báscula (peso y
// composición) (hace 6 días)… **Mándame la captura y la proceso**"*.
//
// Esa promesa el canal no la podía cumplir. Medido el 6-ago-2026: una foto que no es
// una story social termina en `guardarFotoTelegram`, que la sube al bucket y crea una
// `observations` con `capture_type: 'scale'` — y **ahí muere**. Nunca llamaba al
// extractor ni escribía `health_metrics`. Verificado en producción: **0 filas** de
// `observations` con los tipos de salud, o sea que el camino jamás se ejerció.
//
// El riesgo de no hacer esto ANTES de ponerle un botón: él manda la foto, SIR le
// responde "listo, la guardé", y su peso sigue sin actualizarse. Eso es peor que la
// línea gris de la que se queja, porque además le miente.
//
// ═══ ALCANCE: SOLO BÁSCULA, A PROPÓSITO ══════════════════════════════════════
//
// El clasificador también reconoce `sleep_panel`, `heart_rate_panel` y `hrv_panel`.
// Esos tienen su propio extractor y su propio mapeo, y meterlos todos de una sin
// poder probarlos contra una captura real es cómo se construyen tres caminos
// silenciosamente roídos en vez de uno que funciona. La báscula es la que él reclama
// y la que tiene el mapeo puro más probado (`scale/map.ts`, con tests).
//
// FAIL-SOFT: si algo falla acá, la observación y la imagen YA están guardadas por
// `guardarFotoTelegram`. Esta función solo AGREGA las métricas; nunca puede hacer que
// se pierda la foto.

import type { SupabaseClient } from '@supabase/supabase-js'

import { complete } from '@/lib/llm'
import type { LlmImageMediaType } from '@/lib/llm'
import { SCALE_VISION_SYSTEM_PROMPT } from '@/lib/capture/scale/prompt'
import { isValidScaleCaptureExtracted, sanitizeExtracted } from '@/lib/capture/scale/validate'
import { buildScaleHealthMetrics } from '@/lib/capture/scale/map'

export interface MetricasDeFoto {
  /** Cuántas métricas se escribieron en `health_metrics`. 0 = no se pudo. */
  escritas: number
  /** Qué se escribió, para poder decírselo con nombre ("peso 84.2 kg"). */
  resumen: string | null
  /** Por qué no se pudo, si no se pudo. Nunca se calla el motivo. */
  motivo: string | null
}

const VACIO: MetricasDeFoto = { escritas: 0, resumen: null, motivo: null }

/** Quita las cercas de ```json que el modelo pone aunque el prompt lo prohíba. */
function sinCercas(s: string): string {
  const t = (s ?? '').trim()
  if (!t.startsWith('```')) return t
  return t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
}

/**
 * Extrae las métricas de una foto de báscula y las escribe en `health_metrics`.
 *
 * Devuelve `escritas: 0` con `motivo` cuando no se puede — nunca lanza. El llamador
 * usa el resumen para responderle a Aaron QUÉ quedó guardado: un "listo" a secas deja
 * la duda de si se anotó el peso o nada, y esa duda es justo el reclamo que originó
 * todo el hilo de la medicación.
 */
export async function procesarFotoDeBascula(
  ctx: { supabase: SupabaseClient; userId: string },
  base64: string,
  mediaType: LlmImageMediaType,
  ahora: Date,
  captureId: string,
  rutaImagen: string | null,
): Promise<MetricasDeFoto> {
  const { supabase, userId } = ctx
  try {
    const res = await complete(
      {
        task: 'telegram_scale_extract', tier: 'capable', sensitivity: 'self', maxTokens: 1200,
        system: SCALE_VISION_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', mediaType, data: base64 } },
          { type: 'text', text: 'Devuelve el JSON de la báscula.' },
        ] }],
      },
      { supabase, userId },
    )
    let parsed: unknown
    try { parsed = JSON.parse(sinCercas(res.text)) } catch {
      return { ...VACIO, motivo: 'el modelo no devolvió un JSON que pueda leer' }
    }
    if (!isValidScaleCaptureExtracted(parsed)) {
      return { ...VACIO, motivo: 'la captura no traía números que pueda validar' }
    }
    const limpio = sanitizeExtracted(parsed)

    // El mapeo es PURO y está testeado (`scale/map.test.ts`): no se reimplementa acá.
    const metrics = buildScaleHealthMetrics({
      finalMetrics: limpio.metrics,
      captureId,
      sourceImagePath: rutaImagen ?? `${userId}/telegram/${captureId}`,
      measuredAt: ahora.toISOString(),
      confidence: limpio.confidence ?? undefined,
    })
    if (metrics.length === 0) {
      return { ...VACIO, motivo: 'no saqué ninguna métrica numérica de la imagen' }
    }

    // `external_id` con el captureId: dos envíos de la MISMA foto no duplican el peso
    // del día. Mismo criterio que el ingest de Apple Health.
    const rows = metrics.map((m) => ({
      user_id: userId,
      type: m.type,
      value: m.value,
      unit: m.unit,
      note: m.note ?? null,
      measured_at: m.timestamp,
      source: 'telegram_scale',
      external_id: `tg_${captureId}_${m.type}`,
    }))
    const { error } = await supabase
      .from('health_metrics')
      .upsert(rows, { onConflict: 'user_id,external_id' })
    // PostgREST no lanza: el error viene en `.error`. Leerlo como éxito sería
    // decirle "guardé tu peso" sin haberlo guardado.
    if (error) return { ...VACIO, motivo: `no pude escribirlas (${error.message.slice(0, 80)})` }

    const peso = metrics.find((m) => m.type === 'weight')
    const grasa = metrics.find((m) => m.type === 'body_fat_percent')
    const partes = [
      peso ? `peso ${peso.value} ${peso.unit}` : null,
      grasa ? `grasa ${grasa.value} ${grasa.unit}` : null,
    ].filter(Boolean)
    const resumen = partes.length > 0
      ? `${partes.join(' · ')}${metrics.length > partes.length ? ` y ${metrics.length - partes.length} más` : ''}`
      : `${metrics.length} métrica(s)`
    return { escritas: metrics.length, resumen, motivo: null }
  } catch (e) {
    return { ...VACIO, motivo: (e instanceof Error ? e.message : String(e)).slice(0, 120) }
  }
}
