// SIR V2 — el lado SUCIO del aviso cardíaco: leer la base, decidir, avisar.
//
// Todo lo que decide vive en módulos PUROS (`cardioWatch` diagnostica,
// `cardioSurface` elige el canal). Acá solo está lo que toca el mundo: cargar la
// serie, mirar cuándo sonó por última vez, y mandar el Telegram.
//
// SE LLAMA EN CUANTO ENTRA DATA, no desde un cron. Aaron pidió que el aviso sea
// "en el momento", y el momento de verdad no es una hora fija: es cuando aparece
// la medición. Por eso `evaluarCardio` se invoca desde los endpoints de ingesta de
// salud (fire-and-forget, fail-soft) y también desde el brief de la mañana, que es
// el que se ocupa del canal 'manana'.
//
// FAIL-SOFT SIEMPRE. Esto es un añadido sobre una escritura que ya tuvo éxito: si
// falla el aviso, la data de Aaron ya está guardada y no se puede perder por esto.
// Nunca lanza; devuelve qué pasó.

import type { SupabaseClient } from '@supabase/supabase-js'

import { assessCardio, construirReporte, type CardioDay, type CardioEvent } from './cardioWatch'
import { decidirCanal, puedeAvisar, type CardioAviso } from './cardioSurface'
import { sendTelegramMessage } from '@/lib/telegram/client'

/** Tipos de `health_metrics` que alimentan el diagnóstico. */
const TIPOS = [
  'sleeping_heart_rate', 'hrv_avg', 'heart_rate', 'blood_oxygen', 'respiratory_rate',
] as const

/** Palabras que hacen de un `personal_event` una explicación válida. */
const EXPLICATIVOS = /trauma|golpe|descanso m[eé]d|enferm|gripe|fiebre|cirug|operaci|accidente|covid|dengue/i

export interface CardioNotifyResult {
  /** Qué canal salió del diagnóstico. */
  canal: CardioAviso['canal']
  /** Si de verdad se mandó un mensaje. */
  enviado: boolean
  /** Por qué no se mandó, cuando aplica ('silenciado', 'sin_telegram', 'nada'). */
  motivo?: string
  /** El texto del aviso, para que el llamador lo pueda surfacear en su propia UI. */
  texto?: string
}

/**
 * Arma la serie diaria desde `health_metrics`.
 *
 * ACÁ VIVE LA DEFENSA MÁS IMPORTANTE DEL SISTEMA: `type='heart_rate'` es una
 * serie MIXTA — tiene FC en reposo real (43, 45, 51, 53, `source='manual'`) y
 * lecturas de la BÁSCULA de pie (49, 71, y un 115 del 30-jul que la app marcó
 * "Alta"). La báscula mide por los pies, parado y recién levantado: se va decenas
 * de bpm por encima de la real. Si entra como FC de reposo, fabrica picos que el
 * detector lee como taquicardia y Aaron recibe un susto por un sensor malo.
 * Por eso: `source='scale'` NO entra como `restingHr`. Nunca.
 */
export async function cargarSerie(
  db: SupabaseClient,
  userId: string,
  desde = '2025-01-01',
): Promise<CardioDay[]> {
  const { data, error } = await db
    .from('health_metrics')
    .select('type,value,measured_at,source')
    .eq('user_id', userId)
    .in('type', TIPOS as unknown as string[])
    .gte('measured_at', desde)
    .order('measured_at', { ascending: true })
  if (error || !data) return []

  const porDia = new Map<string, CardioDay>()
  for (const r of data as Array<{ type: string; value: number; measured_at: string; source: string | null }>) {
    if (typeof r.value !== 'number' || !Number.isFinite(r.value)) continue
    const date = r.measured_at.slice(0, 10)
    const d = porDia.get(date) ?? { date }
    if (r.type === 'sleeping_heart_rate') d.sleepingHr = r.value
    else if (r.type === 'hrv_avg') d.hrvAvg = r.value
    else if (r.type === 'heart_rate' && r.source !== 'scale') d.restingHr = r.value
    else if (r.type === 'blood_oxygen') d.spo2 = r.value
    else if (r.type === 'respiratory_rate') d.respRate = r.value
    porDia.set(date, d)
  }
  return [...porDia.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/** Eventos que pueden EXPLICAR una desviación sin que sea del corazón. */
export async function cargarEventos(db: SupabaseClient, userId: string): Promise<CardioEvent[]> {
  const { data, error } = await db
    .from('personal_events')
    .select('title,event_date')
    .eq('user_id', userId)
    .order('event_date', { ascending: true })
  if (error || !data) return []
  return (data as Array<{ title: string | null; event_date: string | null }>)
    .filter((e) => e.title && e.event_date && EXPLICATIVOS.test(e.title))
    .map((e) => ({ date: e.event_date!, label: e.title!, ventanaDias: 10 }))
}

/**
 * Evalúa y, si corresponde, AVISA. `chatId` null = no hay Telegram para ese
 * usuario: se diagnostica igual y se devuelve el texto, así el llamador lo puede
 * mostrar donde tenga (el brief lo usa para el canal 'manana').
 */
export async function evaluarCardio(
  db: SupabaseClient,
  userId: string,
  opts: { chatId?: number | null; ahora?: Date; soloDiagnosticar?: boolean } = {},
): Promise<CardioNotifyResult> {
  try {
    const dias = await cargarSerie(db, userId)
    if (dias.length === 0) return { canal: 'nada', enviado: false, motivo: 'sin_datos' }
    const eventos = await cargarEventos(db, userId)
    const veredicto = assessCardio(dias, { eventos })
    const aviso = decidirCanal(veredicto)
    if (aviso.canal === 'nada') return { canal: 'nada', enviado: false, motivo: 'nada' }

    // Los canales que NO interrumpen se devuelven y listo: quien llamó decide
    // dónde ponerlos. No se escribe nada en cardio_alerts, porque no "sonaron".
    if (aviso.canal !== 'ahora' || opts.soloDiagnosticar) {
      return { canal: aviso.canal, enviado: false, motivo: 'no_interrumpe', texto: aviso.texto }
    }

    const ahora = opts.ahora ?? new Date()
    const { data: prev } = await db
      .from('cardio_alerts')
      .select('last_sent_at,sent_count')
      .eq('user_id', userId).eq('fingerprint', aviso.fingerprint)
      .maybeSingle()
    const ultimo = (prev as { last_sent_at?: string } | null)?.last_sent_at ?? null
    if (!puedeAvisar(aviso, ultimo, ahora)) {
      return { canal: 'ahora', enviado: false, motivo: 'silenciado', texto: aviso.texto }
    }

    const chatId = opts.chatId ?? null
    if (!chatId) return { canal: 'ahora', enviado: false, motivo: 'sin_telegram', texto: aviso.texto }

    // El reporte va PEGADO al aviso, no como un "pídemelo": el pedido de Aaron
    // fue "decirme tienes que ir al cardiólogo a ver esto, y con esta data".
    // Solo cuando de verdad va a haber consulta — mandar un reporte clínico por
    // una noche floja es alarmar por nada.
    const cuerpo = aviso.conReporte
      ? `${aviso.titulo}\n\n${aviso.texto}\n\n${'—'.repeat(20)}\n${construirReporte(veredicto, dias, { eventos })}`
      : `${aviso.titulo}\n\n${aviso.texto}`

    const res = await sendTelegramMessage(chatId, cuerpo)
    if (!res.ok) return { canal: 'ahora', enviado: false, motivo: res.error ?? 'telegram_fallo', texto: aviso.texto }

    await db.from('cardio_alerts').upsert({
      user_id: userId,
      fingerprint: aviso.fingerprint,
      last_sent_at: ahora.toISOString(),
      level: veredicto.level,
      sample_text: aviso.texto.slice(0, 500),
      sent_count: ((prev as { sent_count?: number } | null)?.sent_count ?? 0) + 1,
      updated_at: ahora.toISOString(),
    }, { onConflict: 'user_id,fingerprint' })

    return { canal: 'ahora', enviado: true, texto: aviso.texto }
  } catch {
    // Silencioso a propósito: corre después de una escritura exitosa y no puede
    // convertir un guardado bueno en un 500.
    return { canal: 'nada', enviado: false, motivo: 'error' }
  }
}
