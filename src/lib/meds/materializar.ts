// SIR V2 — Materializar los recordatorios de toma de medicación. PURO + un helper de DB.
//
// ═══ POR QUÉ EXISTE ═══════════════════════════════════════════════════════════
//
// Los avisos de "💊 toma de las 22:00" no se calculan al vuelo: se MATERIALIZAN como
// filas de `reminders`, una por día. Esa decisión es correcta y se mantiene — la tabla
// no tiene recurrencia y añadirla rompería la invariante "un row = un aviso" sobre la
// que se apoya `notified_at`.
//
// El problema era QUIÉN las crea. Hasta el 5-ago-2026 las creaba `scripts/import-recetas.mjs`
// a mano, con una ventana de 14 días y las recetas HARDCODEADAS en el propio script.
// Medido ese día contra producción: la última fila era `rem_med_2026-08-16_2200`.
//
//   A partir del 17-ago el cron de la noche no iba a encontrar ninguna fila, no iba a
//   preguntar nada, y el endpoint iba a responder **200 OK**. Sin error, sin telemetría,
//   sin una sola señal. Adentro de esa ventana que se agotaba estaban el topiramato y el
//   clonazepam, que son crónicos.
//
// Es exactamente el modo de falla que este repo persigue hace días: algo que deja de
// funcionar y reporta éxito. Y con un agravante propio — el silencio de un recordatorio
// de medicación es indistinguible de "hoy no toca nada".
//
// ═══ DOS CAMBIOS DE FONDO ═════════════════════════════════════════════════════
//
// 1. **Las recetas se leen de la BASE, no de un array en un script.** Antes, una receta
//    cargada desde la app nunca generaba avisos: solo existían las cuatro escritas a
//    mano en el .mjs.
// 2. **Corre sola en cada tick de `reminders-due`** (06:00 de Lima, diario), que es el
//    cron que ya vigila esta misma tabla. Cero crons nuevos. Al ser una ventana RODANTE
//    e idempotente, mientras el cron viva la cola nunca se vacía.
//
// El id lo arma `remIdDeToma`, el mismo de `telegramToma.ts`. El script tenía que
// duplicar ese formato con una advertencia ("si los dos formatos se separan, el aviso
// llega sin botones y en silencio"); acá se importa y la duplicación desaparece.

import type { SupabaseClient } from '@supabase/supabase-js'

import { remIdDeToma } from './telegramToma'

/** Días de cola por delante. Con el cron diario sobra; el margen es para que una
 *  semana entera de crons caídos todavía no deje a Aaron sin avisos. */
export const DIAS_DE_COLA = 21

export interface ItemVigente {
  prescriptionId: string
  medName: string
  dose: string | null
  /** Horas objetivo 'HH:MM'. */
  horas: string[]
  /** 'YYYY-MM-DD' — inicio de la receta. */
  startedOn: string
  /** null = crónico (sin fin). */
  durationDays: number | null
  /** 'YYYY-MM-DD' o null — fin declarado de la receta. */
  endsOn: string | null
}

export interface FilaDeToma {
  id: string
  user_id: string
  text: string
  due_at: string
  med_prescription_id: string
}

/** Suma días a 'YYYY-MM-DD' sin tocar zonas horarias. PURA. */
function masDias(fecha: string, d: number): string {
  return new Date(Date.parse(`${fecha}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10)
}

/**
 * Las filas de recordatorio que deberían existir entre `hoy` y `hoy + dias - 1`. PURA.
 *
 * Agrupa por (FECHA + HORA) atravesando TODAS las recetas, no por receta: si no, una
 * noche con topiramato, clonazepam y los dos del maxilofacial serían cuatro mensajes
 * distintos a las 22:00 para una sola toma. Eso es el muro de notificaciones que Aaron
 * ya rechazó una vez.
 */
export function planDeTomas(
  items: ItemVigente[],
  userId: string,
  hoy: string,
  dias: number = DIAS_DE_COLA,
): FilaDeToma[] {
  const ultimoDiaDeLaCola = masDias(hoy, dias - 1)
  const porMomento = new Map<string, { fecha: string; hora: string; meds: string[]; presc: string }>()

  for (const it of items) {
    for (const horaCruda of it.horas) {
      const hora = String(horaCruda).slice(0, 5)
      if (!/^\d{2}:\d{2}$/.test(hora)) continue

      // Un curso con duración termina cuando termina, contado desde que empezó — así
      // no se agendan días de más. Lo crónico solo lo limita la cola.
      const finPorDuracion = it.durationDays !== null ? masDias(it.startedOn, it.durationDays - 1) : null
      const candidatos = [ultimoDiaDeLaCola, finPorDuracion, it.endsOn].filter((v): v is string => v != null)
      const fin = candidatos.sort()[0]

      // Nunca agendar el pasado: si la receta arrancó antes, se empieza hoy. Un crónico
      // que empezó el 10-jul no puede materializar julio.
      const desde = it.startedOn > hoy ? it.startedOn : hoy

      for (let f = desde; f <= fin; f = masDias(f, 1)) {
        const clave = `${f}|${hora}`
        const g = porMomento.get(clave) ?? { fecha: f, hora, meds: [], presc: it.prescriptionId }
        g.meds.push(`${it.medName}${it.dose ? ` ${it.dose}` : ''}`)
        porMomento.set(clave, g)
      }
    }
  }

  return [...porMomento.values()]
    .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora))
    .map((g) => ({
      id: remIdDeToma(g.fecha, g.hora),
      user_id: userId,
      text: `💊 ${g.meds.join(' + ')}`,
      // Offset fijo de Lima: Perú no tiene horario de verano. [[hora-de-lima-tz-no-funciona]]
      due_at: `${g.fecha}T${g.hora}:00-05:00`,
      // Enlace de limpieza (borrar en bloque si se suspende la receta), no de
      // contabilidad: cuando el aviso junta varias, queda la que lo originó primero.
      med_prescription_id: g.presc,
    }))
}

export interface ResultadoMaterializacion {
  /** Filas que faltaban y se crearon. */
  creadas: number
  /** Ya existían: no se tocan. */
  existentes: number
  /** Hasta cuándo llega la cola después de esto ('YYYY-MM-DD'), o null si no hay ninguna. */
  cubiertoHasta: string | null
  /** Mensaje de la falla, si la hubo. El llamador debe reportarlo, no tragárselo. */
  error?: string
}

/**
 * Rellena la cola de recordatorios de toma leyendo las recetas ACTIVAS del usuario.
 *
 * INSERTA SOLO LO QUE FALTA — nunca hace upsert. Un upsert sobre una fila existente le
 * pisaría el `text` y, peor, podría revivir un aviso que ya se dio: `notified_at` y
 * `done_at` viven en esas mismas filas. Acá una fila ya creada es intocable.
 */
export async function materializarTomas(
  supabase: SupabaseClient,
  userId: string,
  hoy: string,
  dias: number = DIAS_DE_COLA,
): Promise<ResultadoMaterializacion> {
  const vacio: ResultadoMaterializacion = { creadas: 0, existentes: 0, cubiertoHasta: null }

  const { data: pres, error: pe } = await supabase
    .from('med_prescriptions')
    .select('id, started_on, ends_on')
    .eq('user_id', userId)
    .eq('status', 'activa')
  // PostgREST no lanza: el error viene en `.error`. Leerlo como "no hay recetas" es
  // justamente cómo esto se apaga en silencio. [[postgrest-columna-inexistente]]
  if (pe) return { ...vacio, error: `recetas activas: ${pe.message}` }
  const recetas = (pres as Array<{ id: string; started_on: string | null; ends_on: string | null }>) ?? []
  if (recetas.length === 0) return vacio

  const porId = new Map(recetas.map((r) => [r.id, r]))
  const { data: its, error: ie } = await supabase
    .from('med_prescription_items')
    .select('id, med_name, dose, schedule, prescription_id, duration_days')
    .in('prescription_id', recetas.map((r) => r.id))
  if (ie) return { ...vacio, error: `ítems de receta: ${ie.message}` }

  const items: ItemVigente[] = []
  for (const i of ((its as Array<{ med_name: string; dose: string | null; schedule: string[] | null; prescription_id: string; duration_days: number | null }>) ?? [])) {
    const horas = (i.schedule ?? []).map((s) => String(s).slice(0, 5)).filter(Boolean)
    if (horas.length === 0) continue // a demanda (Ergonex): no se agenda
    const r = porId.get(i.prescription_id)
    if (!r?.started_on) continue
    items.push({
      prescriptionId: i.prescription_id,
      medName: i.med_name,
      dose: i.dose,
      horas,
      startedOn: r.started_on,
      durationDays: i.duration_days,
      endsOn: r.ends_on,
    })
  }
  if (items.length === 0) return vacio

  const plan = planDeTomas(items, userId, hoy, dias)
  if (plan.length === 0) return vacio

  const { data: yaHay, error: ye } = await supabase
    .from('reminders')
    .select('id')
    .in('id', plan.map((p) => p.id))
  if (ye) return { ...vacio, error: `recordatorios existentes: ${ye.message}` }
  const existentes = new Set(((yaHay as Array<{ id: string }>) ?? []).map((r) => r.id))

  const faltan = plan.filter((p) => !existentes.has(p.id))
  const cubiertoHasta = plan[plan.length - 1].due_at.slice(0, 10)
  if (faltan.length === 0) return { creadas: 0, existentes: existentes.size, cubiertoHasta }

  const { error: inserte } = await supabase.from('reminders').insert(faltan)
  if (inserte) return { creadas: 0, existentes: existentes.size, cubiertoHasta, error: `insertar tomas: ${inserte.message}` }

  return { creadas: faltan.length, existentes: existentes.size, cubiertoHasta }
}
