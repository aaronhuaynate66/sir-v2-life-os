// SIR V2 — GET /api/estado
//
// El estado de las fuentes que `/api/reader/status` NO cubre: calendario, correo,
// Apple Health, mensajería y los motores de fondo.
//
// ═══ POR QUÉ ESTE ENDPOINT Y NO OTRO MÁS ═════════════════════════════════════
//
// Aaron pidió el monitor TRES veces. Existe (`/reader`) y solo vigila los 5 canales
// de la extensión. La tentación era crear una sexta pantalla de estado — hoy están
// repartidas entre `/reader`, `/yo` (correo), `/horario` (calendarios), `/salud`
// (data faltante) y **Telegram a las 6 am** (motores). Otra página más sería otro
// lugar donde no lo encuentra.
//
// Así que esto COMPLEMENTA a `/api/reader/status` en vez de duplicarlo, y lo pinta
// la misma página. Una pantalla, todas las fuentes.
//
// Dos de estos veredictos ya estaban CALCULADOS y sin consumidor en la web:
//   · los motores → `lib/cron/salud.ts`, testeado, y su único lector era una línea
//     del brief de Telegram. Acá se cablea. Cero lógica nueva.
//   · los calendarios → `/api/calendar` ya devuelve `calendars[].error`, y ningún
//     `.tsx` lo leía. Un feed con 401 mostraba eventos rancios sin señal.

import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { fetchCalendarEvents } from '@/lib/calendar/feed'
import { noVerificables, trabajosAtrasados, VIGILADOS } from '@/lib/cron/salud'
import { medirEvidenciaDeCrons } from '@/lib/cron/evidencia'
import {
  estadoCalendario, estadoCorreo, estadoMotores, estadoSalud,
  fuentesSinInstrumentar, ordenarFuentes, resumirFuentes, type FuenteEstado,
} from '@/lib/estado/fuentes'
import { limaDayString } from '@/lib/habits/streak'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Crons declarados en vercel.json. Se usa solo para declarar cuántos NO se vigilan. */
const TOTAL_CRONS = 13

export async function GET() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const uid = auth.user.id
  const now = Date.now()
  const fuentes: FuenteEstado[] = []

  // ── CALENDARIO ────────────────────────────────────────────────────────────
  // Se pide una ventana mínima: lo que interesa acá no son los eventos sino
  // `calendars[].error` y `fetchedAt`, que viajan igual.
  try {
    const feed = await fetchCalendarEvents({ horizonDays: 1, limit: 1, nowMs: now })
    fuentes.push(estadoCalendario(
      { calendars: feed.calendars ?? [], fetchedAt: feed.fetchedAt ?? null },
      now,
    ))
  } catch (e) {
    // Que el feed explote NO es "no hay calendarios": es que no se pudo mirar.
    fuentes.push({
      clave: 'calendario', nombre: 'Calendario', grupo: 'agenda',
      vigilancia: 'sin-vigilancia', veredicto: 'No se pudo leer',
      detalle: String(e).slice(0, 90), limite: 'El feed falló al consultarse: no se puede afirmar nada de su estado.',
      comoEntra: 'se lee en vivo en cada carga (no se guarda)',
    })
  }

  // ── CORREO ────────────────────────────────────────────────────────────────
  try {
    const { data, error } = await supabase
      .from('email_connections').select('last_synced_at').eq('user_id', uid).limit(1)
    const row = ((data as Array<{ last_synced_at: string | null }>) ?? [])[0]
    // Un error de consulta no puede leerse como "no tiene correo conectado".
    if (error) throw new Error(error.message)
    fuentes.push(estadoCorreo(row?.last_synced_at ?? null, !!row, now))
  } catch (e) {
    fuentes.push({
      clave: 'correo', nombre: 'Correo de trabajo', grupo: 'correo',
      vigilancia: 'sin-vigilancia', veredicto: 'No se pudo leer',
      detalle: String(e).slice(0, 90), limite: 'La consulta falló: no se puede afirmar nada de su estado.',
      comoEntra: 'MANUAL — solo entra si aprietas el botón en /yo',
    })
  }

  // ── APPLE HEALTH ──────────────────────────────────────────────────────────
  try {
    const { data } = await supabase
      .from('health_metrics').select('measured_at')
      .eq('user_id', uid).order('measured_at', { ascending: false }).limit(1)
    fuentes.push(estadoSalud(((data as Array<{ measured_at: string }>) ?? [])[0]?.measured_at ?? null, now))
  } catch {
    fuentes.push(estadoSalud(null, now))
  }

  // ── MOTORES DE FONDO ──────────────────────────────────────────────────────
  // Las MISMAS mediciones que hace `morning-push` — literalmente las mismas, no
  // una copia: viven en `lib/cron/evidencia`. El juicio lo pone `lib/cron/salud`.
  try {
    const hoy = limaDayString(new Date(now))
    const estados = await medirEvidenciaDeCrons(supabase, uid)
    fuentes.push(estadoMotores({
      atrasados: trabajosAtrasados(estados, hoy),
      noVerificables: noVerificables(estados),
      totalCrons: TOTAL_CRONS,
      vigilados: VIGILADOS.length,
    }, now))
  } catch (e) {
    fuentes.push({
      clave: 'motores', nombre: 'Motores de fondo', grupo: 'motores',
      vigilancia: 'sin-vigilancia', veredicto: 'No se pudo leer',
      detalle: String(e).slice(0, 90), limite: 'La consulta falló: no se puede afirmar nada de su estado.',
      comoEntra: 'crons programados en Vercel',
    })
  }

  // ── LO QUE NO SE PUEDE VIGILAR ────────────────────────────────────────────
  // Van SIEMPRE. Omitirlas insinuaría que están sanas.
  fuentes.push(...fuentesSinInstrumentar())

  const ordenadas = ordenarFuentes(fuentes)
  return NextResponse.json({ fuentes: ordenadas, resumen: resumirFuentes(ordenadas) })
}
