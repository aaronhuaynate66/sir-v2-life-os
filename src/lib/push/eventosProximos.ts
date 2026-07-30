// SIR V2 — "Esto se te viene": los compromisos de Aaron con FECHA, en el brief.
//
// ═══ EL HUECO ════════════════════════════════════════════════════════════════
//
// Aaron, 30-jul-2026: *"Laura me escribió ayer diciéndome que este sábado es su
// matrimonio religioso, y no veo ninguna alerta, recordatorio o fecha que indique
// eso"*.
//
// Y estaba cargado. `personal_events` tenía la fila desde antes: `2026-08-01 · Boda
// religiosa de Laura Alfaro`, con Laura vinculada por `person_id`. El problema no era
// la data — era que **el brief leía `personal_events` por una sola rendija**: el
// cruce con el ciclo menstrual (`crossAgendaWithCycles`, #978), que solo surfacea un
// evento si la persona asociada está en ventana sensible. Un matrimonio el sábado no
// aparecía nunca si no coincidía con eso.
//
// O sea: existía la tabla de sus compromisos, existía el evento, y no existía el
// recordatorio. Este módulo es el slot que faltaba, y es el más obvio de todos.
//
// ═══ CRITERIOS ═══════════════════════════════════════════════════════════════
//
// · Ventana de 7 días. Más corto se pierde lo que necesita preparación (un regalo,
//   ropa, mover algo de la agenda); más largo se vuelve ruido diario.
// · HOY y MAÑANA se dicen con esas palabras, no con la fecha: "es mañana" mueve a
//   alguien, "2026-08-01" no.
// · Se nombra a la persona cuando el evento la tiene: el compromiso es con alguien,
//   y eso es lo que hace que uno se acuerde de por qué importa.
// · Los eventos MÉDICOS y de descanso también entran — son compromisos igual. Pero
//   los pasados no: un evento de ayer no es un recordatorio, es historia.
//
// PURO: cero red, cero DB, cero IA. El "hoy" se inyecta.

export interface EventoProximo {
  /** 'YYYY-MM-DD'. */
  date: string
  title: string
  /** Nombre de la persona asociada, si la hay. */
  personName?: string | null
}

/** Días hacia adelante que se miran. */
export const VENTANA_DIAS = 7

const DAY = 86_400_000

function diasHasta(fecha: string, hoy: string): number | null {
  const a = Date.parse(`${fecha}T00:00:00Z`)
  const b = Date.parse(`${hoy}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return Math.round((a - b) / DAY)
}

/** "hoy" | "mañana" | "el sábado" | "en 5 días". PURA. */
export function cuando(dias: number, fecha: string): string {
  if (dias === 0) return 'hoy'
  if (dias === 1) return 'mañana'
  // Dentro de la semana conviene el DÍA de la semana: "el sábado" ubica mejor que
  // "en 3 días", que obliga a contar.
  if (dias <= VENTANA_DIAS) {
    const d = new Date(`${fecha}T12:00:00Z`).getUTCDay()
    const nombres = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
    return `el ${nombres[d]}`
  }
  return `en ${dias} días`
}

/**
 * La línea del brief. null si no hay nada en la ventana.
 *
 * Se limita a 2 eventos: con más, la línea deja de leerse y vuelve a ser el muro del
 * que Aaron se quejó. Los que sobran se cuentan ("y 2 más"), que es honesto sin
 * ocupar espacio.
 */
export function eventosProximosLine(
  eventos: EventoProximo[],
  hoy: string,
): string | null {
  const conDias = (eventos ?? [])
    .map((e) => ({ e, dias: e?.date ? diasHasta(e.date, hoy) : null }))
    .filter((x): x is { e: EventoProximo; dias: number } =>
      x.dias !== null && x.dias >= 0 && x.dias <= VENTANA_DIAS && !!x.e.title)
    .sort((a, b) => a.dias - b.dias)
  if (conDias.length === 0) return null

  const partes = conDias.slice(0, 2).map(({ e, dias }) => {
    const quien = e.personName ? ` (${e.personName})` : ''
    return `${e.title}${quien} — ${cuando(dias, e.date)}`
  })
  const sobran = conDias.length - partes.length
  const cola = sobran > 0 ? ` · y ${sobran} más esta semana` : ''
  return `📅 ${partes.join(' · ')}${cola}.`
}
