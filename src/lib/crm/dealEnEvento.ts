// SIR V2 — "Mañana la vas a ver": cruzar el CRM con la agenda y el grafo. PURO.
//
// ═══ LA IDEA ES DE AARON, Y ES LA BUENA ══════════════════════════════════════
//
// Aaron, 31-jul-2026, sobre la cotización de Hikvision: *"debemos verlo más como una
// oportunidad dentro de un CRM y trabajarla, porque si bien comentó no me respondió
// con lo de exactamente lo que quiere que se haga, pero hay que perseguirla para que
// se haga el trabajo. **Me la voy a encontrar mañana en el matrimonio de Laura**, creo
// haberte mencionado que es su mejor amiga, **eso debería darnos información en el
// grafo**"*.
//
// Y tenía toda la data. Verificado el 31-jul, la cadena cierra completa:
//
//   `personal_events` 1-ago "Boda religiosa de Laura Alfaro" → `person_id` = Laura
//        ↓
//   `person_links` Miluska ↔ Laura, `kind: 'mejor_amiga'` (dicho por él el 28-jul)
//        ↓
//   `deals` "Web + portal trade mkt — Hikvision (Miluska)", `contact_person_id` =
//   Miluska, `next_action_date` = 29-jul → **vencida hace 2 días**
//
// Tres tablas, todas pobladas, y **nadie las cruzaba**. Peor: el brief lee
// `opportunity_signals` (que estaba VACÍA) y **NADA lee `deals`** — así que una
// oportunidad con la acción vencida era completamente muda.
//
// Esto es lo que convierte el CRM en un CRM: no guardar la oportunidad, **perseguirla**
// — y avisar cuando el azar de la agenda pone a la persona enfrente.
//
// PURO: cero red, cero DB. El "hoy" se inyecta.

/** Un deal abierto del CRM, con lo mínimo para decidir si apremia. */
export interface DealLite {
  id: string
  title: string
  /** Persona de contacto. Sin esto no se puede cruzar con el grafo. */
  contactPersonId: string | null
  nextAction: string | null
  /** 'YYYY-MM-DD' o null. */
  nextActionDate: string | null
  stage?: string | null
  amount?: number | null
  currency?: string | null
}

/** Evento próximo de la agenda, con la persona a la que cuelga. */
export interface EventoLite {
  title: string
  /** 'YYYY-MM-DD'. */
  date: string
  personId: string | null
}

/** Arista del grafo entre dos personas. */
export interface LinkLite {
  personAId: string
  personBId: string
  /** 'mejor_amiga', 'hermano', 'colega'… tal como lo guardó Aaron. */
  kind: string | null
}

export interface Encuentro {
  /** Nombre de la persona del deal (la que se va a encontrar). */
  personName: string
  /** Días hasta el evento (0 = hoy). */
  dias: number
  eventoTitulo: string
  /** Cómo llega a estar ahí: 'mejor_amiga de Laura Alfaro'. null si es la titular. */
  via: string | null
  deal: DealLite
  /** Días de atraso de la próxima acción. 0 = vence hoy. null si no tiene fecha. */
  atraso: number | null
}

const DAY = 86_400_000
export const VENTANA_DIAS = 7

function dias(desde: string, hasta: string): number | null {
  const a = Date.parse(`${desde}T00:00:00Z`)
  const b = Date.parse(`${hasta}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return Math.round((b - a) / DAY)
}

/**
 * ¿Alguna persona con un deal abierto va a estar en un evento próximo? PURA.
 *
 * Dos caminos para llegar a ella:
 *  · DIRECTO: el evento cuelga de ella (`personId` del evento = contacto del deal).
 *  · POR EL GRAFO: el evento cuelga de alguien con quien está vinculada. Es el caso
 *    real: la boda es de Laura, y Miluska va porque es su mejor amiga.
 *
 * El vínculo NO prueba asistencia — que la mejor amiga vaya a la boda es una
 * inferencia razonable, no un hecho. Por eso `via` viaja en el resultado: el texto
 * tiene que decir POR QUÉ cree que va a estar, para que Aaron lo confirme o descarte.
 */
export function encuentrosConDeal(
  eventos: readonly EventoLite[],
  deals: readonly DealLite[],
  links: readonly LinkLite[],
  nombrePorId: ReadonlyMap<string, string>,
  hoy: string,
): Encuentro[] {
  const out: Encuentro[] = []
  // Ordenados por fecha: abajo se corta con `break` al primer evento que matchea, así
  // que sin ordenar primero se quedaba con el primero del ARREGLO y no con el más
  // cercano. Lo cazó el test de prioridad.
  const proximos = (eventos ?? [])
    .filter((e) => {
      const d = e?.date ? dias(hoy, e.date) : null
      return d !== null && d >= 0 && d <= VENTANA_DIAS
    })
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
  if (proximos.length === 0) return out

  for (const deal of deals ?? []) {
    const pid = deal?.contactPersonId
    if (!pid) continue
    for (const ev of proximos) {
      if (!ev.personId) continue
      let via: string | null = null
      if (ev.personId === pid) {
        via = null // el evento es de ella misma
      } else {
        const link = (links ?? []).find((l) =>
          (l.personAId === pid && l.personBId === ev.personId) ||
          (l.personBId === pid && l.personAId === ev.personId))
        if (!link) continue
        const titular = nombrePorId.get(ev.personId) ?? 'esa persona'
        via = `${(link.kind ?? 'vínculo').replace(/_/g, ' ')} de ${titular}`
      }
      out.push({
        personName: nombrePorId.get(pid) ?? 'tu contacto',
        dias: dias(hoy, ev.date) as number,
        eventoTitulo: ev.title,
        via,
        deal,
        atraso: deal.nextActionDate ? dias(deal.nextActionDate, hoy) : null,
      })
      break // una persona, un evento: el más próximo alcanza
    }
  }
  // Primero lo más inminente y, a igual día, lo más atrasado.
  return out.sort((a, b) => (a.dias - b.dias) || ((b.atraso ?? -1) - (a.atraso ?? -1)))
}

/** "hoy" | "mañana" | "el sábado". PURA. */
function cuando(d: number, fechaRef: string): string {
  if (d === 0) return 'hoy'
  if (d === 1) return 'mañana'
  const nombres = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
  const t = Date.parse(`${fechaRef}T12:00:00Z`)
  return Number.isFinite(t) ? `el ${nombres[new Date(t).getUTCDay()]}` : `en ${d} días`
}

/**
 * La línea del brief. null si no hay encuentro que aprovechar. PURA.
 *
 * Solo habla si el deal tiene algo PENDIENTE (acción vencida o que vence dentro de la
 * ventana). Avisar "vas a ver a X y tienes un deal con ella" cuando no hay nada que
 * hacer es ruido; el valor está en "la vas a ver Y le debes algo".
 */
/**
 * El encuentro del que HABLA la línea. PURO. null si la línea se calla.
 *
 * Existe para que el botón del brief apunte al MISMO encuentro que el texto. Si
 * el caller volviera a filtrar por su cuenta, un cambio en el criterio de
 * `encuentroConDealLine` dejaría el botón apuntando a otro deal — y un botón que
 * hace algo distinto de lo que dice el mensaje es peor que no tener botón.
 */
export function encuentroDestacado(encuentros: readonly Encuentro[]): Encuentro | null {
  const conPendiente = (encuentros ?? []).filter((e) =>
    e.atraso !== null && e.atraso >= -VENTANA_DIAS)
  return conPendiente[0] ?? null
}

export function encuentroConDealLine(encuentros: readonly Encuentro[], hoy: string): string | null {
  const e = encuentroDestacado(encuentros)
  if (!e) return null

  const fechaEvento = new Date(Date.parse(`${hoy}T00:00:00Z`) + e.dias * DAY).toISOString().slice(0, 10)
  const quien = e.via ? `${e.personName} (${e.via})` : e.personName
  const estado = e.atraso === null ? ''
    : e.atraso > 0 ? ` La acción lleva ${e.atraso} día${e.atraso === 1 ? '' : 's'} vencida:`
    : e.atraso === 0 ? ' La acción vence hoy:'
    : ` La acción vence en ${-e.atraso} día${-e.atraso === 1 ? '' : 's'}:`
  const accion = e.deal.nextAction ? ` ${e.deal.nextAction.replace(/\s+/g, ' ').slice(0, 150)}` : ''
  // Se nombra el evento y el vínculo para que él pueda desmentirlo: que la mejor
  // amiga vaya a la boda es probable, no seguro.
  return `🤝 ${cuando(e.dias, fechaEvento)} en "${e.eventoTitulo}" te cruzas con ${quien} — «${e.deal.title}».${estado}${accion}`
}
