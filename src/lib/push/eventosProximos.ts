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

/** Cuántos eventos se nombran en la línea (el resto se cuenta). */
const NOMBRADOS = 2

/**
 * Los eventos de la ventana, ordenados por cercanía. PURA.
 *
 * Existe como función aparte porque `eventosProximosLine` y
 * `eventosProximosIdentity` tienen que mirar EXACTAMENTE el mismo conjunto. Si
 * cada una lo recalculara por su lado, un día divergirían y la identidad dejaría
 * de describir el texto — que es justo la clase de desalineación silenciosa que
 * causó el bug que este módulo arregla.
 */
export function eventosEnVentana(
  eventos: EventoProximo[],
  hoy: string,
): Array<{ e: EventoProximo; dias: number }> {
  return (eventos ?? [])
    .map((e) => ({ e, dias: e?.date ? diasHasta(e.date, hoy) : null }))
    .filter((x): x is { e: EventoProximo; dias: number } =>
      x.dias !== null && x.dias >= 0 && x.dias <= VENTANA_DIAS && !!x.e.title)
    .sort((a, b) => a.dias - b.dias)
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
  const conDias = eventosEnVentana(eventos, hoy)
  if (conDias.length === 0) return null

  const partes = conDias.slice(0, NOMBRADOS).map(({ e, dias }) => {
    const quien = e.personName ? ` (${e.personName})` : ''
    return `${e.title}${quien} — ${cuando(dias, e.date)}`
  })
  const sobran = conDias.length - partes.length
  const cola = sobran > 0 ? ` · y ${sobran} más esta semana` : ''
  return `📅 ${partes.join(' · ')}${cola}.`
}

/** Título en forma comparable: sin acentos, sin puntuación, sin mayúsculas. PURA. */
function normalizarTitulo(t: string): string {
  return t
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * ═══ IDENTIDAD DE LA SEÑAL — el arreglo del 4-ago-2026 ══════════════════════
 *
 * Clave estable de QUÉ eventos nombra esta línea. null si no hay ninguno. PURA.
 *
 * EL BUG QUE ESTO CIERRA. `eventosProximos` vivía en `AGGREGATE_SLOTS`, así que
 * su identidad para el auto-snooze era el SLOT (`slot:eventosProximos`) — una
 * clave que no cambia nunca. El razonamiento original era correcto pero
 * incompleto: sí, el texto cambia solo por el paso del tiempo ("el sábado" →
 * "mañana" → "hoy"), y por eso hashear el texto rompía la racha todos los días.
 * Lo que no se vio es que el texto **también cambia porque entra un evento
 * nuevo**, y bajo una clave fija los dos casos son indistinguibles.
 *
 * Consecuencia medida: el slot se durmió el 3-ago-2026 por racha (4 mañanas) y
 * con `SNOOZE_DAYS = 14` no despertaba hasta el 17-ago. En esa ventana muerta
 * cayeron la reunión en el Comando General del CGBVP (4-ago 11:00, el atajo al
 * apoyo institucional para el Mundial), el examen médico del IPD del 7-ago —con
 * ayuno de 8 h— y el aniversario con Diana del 13-ago. Un compromiso cargado
 * anoche entraba a un slot ya dormido y moría ahí, sin dejar rastro.
 *
 * LA CURA. La identidad es el CONJUNTO de eventos que la línea nombra (fecha +
 * título) más cuántos quedaron sin nombrar. Ni el slot ni el texto:
 *
 * · Misma boda contada día tras día → mismo conjunto → misma clave → la racha
 *   corre y el slot se duerme, que es lo que el auto-snooze debe hacer.
 * · Entra un evento nuevo → otro conjunto → otra clave → señal NUEVA, racha
 *   desde 1. Una lista de compromisos con fecha no es un resumen del mismo
 *   tema: cuando cambia, es data nueva.
 *
 * La fecha va en la clave a propósito: el mismo título en otra fecha es otro
 * compromiso ("Control maxilofacial" del 3-ago no es el del 20-ago).
 */
export function eventosProximosIdentity(
  eventos: EventoProximo[],
  hoy: string,
): string | null {
  const conDias = eventosEnVentana(eventos, hoy)
  if (conDias.length === 0) return null
  const nombrados = conDias
    .slice(0, NOMBRADOS)
    .map(({ e }) => `${e.date}~${normalizarTitulo(e.title)}`)
  const sobran = conDias.length - nombrados.length
  return `${nombrados.join('|')}+${sobran}`.slice(0, 200)
}

/**
 * ¿Hay un evento HOY o MAÑANA? PURA.
 *
 * La segunda defensa, y la que de verdad hace imposible repetir el fallo. Con la
 * identidad arreglada la racha casi nunca llega a dormirse, pero "casi" no
 * alcanza: una semana tranquila con la lista quieta 4 mañanas todavía podría
 * apagar el slot justo antes de una fecha grande. Un compromiso datable que
 * ocurre hoy o mañana NO es ruido por más veces que se haya dicho — y si algo
 * tiene que sobrevivir al anti-repetición, es exactamente eso.
 */
export function hayEventoInminente(eventos: EventoProximo[], hoy: string): boolean {
  return eventosEnVentana(eventos, hoy).some(({ dias }) => dias <= 1)
}
