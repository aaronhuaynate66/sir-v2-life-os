// SIR V2 — Duplicados HUÉRFANOS en Google Calendar. PURO.
//
// ═══ QUÉ PASÓ, MEDIDO EN VIVO ════════════════════════════════════════════════
//
// Aaron, 31-jul-2026, con una captura de su Google Calendar: *"sigue hasta las webas"*.
// El viernes 7 tenía **DOS** eventos del mismo examen del IPD: la banderita vieja de
// "todo el día" Y uno cronometrado a las 08:10.
//
// En `personal_events` hay **UNA sola fila** por evento. O sea que el duplicado existe
// solo en Google, y salió de este hueco que está documentado en `syncPersonalEvents`:
//
//   > "Si el UPDATE falla, el evento YA está en Google: marcarlo como fallido haría
//   > que la próxima corrida lo duplique."
//
// Cuando el `update` de `gcal_event_id` en Supabase falla después de crear el evento
// en Google, SIR se queda sin la referencia. La corrida siguiente ve la fila con
// `gcal_event_id` nulo y **crea otro**. El primero queda huérfano: existe en Google y
// nadie lo apunta, así que ningún update lo va a corregir nunca — se queda como
// "todo el día" para siempre.
//
// ═══ POR QUÉ EL CRITERIO ES CONSERVADOR ══════════════════════════════════════
//
// Borrar del calendario de alguien es destructivo, así que solo se propone borrar un
// evento cuando se cumple TODO:
//
//   1. Cae el MISMO DÍA que un evento que SIR administra.
//   2. Su título coincide con el de ese evento (normalizado: sin tildes, sin
//      puntuación, sin mayúsculas) O uno es prefijo del otro — porque los títulos se
//      acortaron (`tituloCorto`) y el huérfano quedó con el largo.
//   3. Su id NO es el `gcal_event_id` que SIR tiene guardado.
//
// Si Aaron creó a mano un evento con el mismo nombre el mismo día, se pierde — por eso
// el que llama SIEMPRE reporta qué borró, y nunca se borra fuera de la ventana que SIR
// administra.
//
// ═══ EL HUECO QUE DEJÓ ESE CRITERIO (3-ago-2026) ═════════════════════════════
//
// El duplicado del 7-ago sobrevivió a esta limpieza y hubo que borrarlo a mano. El
// motivo NO era el que parecía. Los dos títulos eran LARGOS y divergían:
//
//   en SIR    : "Examen médico EPP — IPD San Luis · 8:10 am (paso al Mundial)"
//   el huérfano: "Examen médico EPP — IPD (rumbo al Mundial de Bomberos)"
//
// Ninguno es prefijo del otro (se separan en "san luis" vs "rumbo"), así que la regla
// de prefijo no aplicaba. Pero **los dos se acortan al mismo chip**: "Examen médico
// EPP". Y ese chip es justamente lo que SIR escribe en Google (`tituloCorto`), o sea
// que es la identidad real del evento allá.
//
// ═══ POR QUÉ LA VÍA DEL CHIP EXIGE LA MARCA DE SIR ═══════════════════════════
//
// Comparar por chip es más amplio: corta en el primer separador, así que
// "Consulta médica — Dr. X" y "Consulta médica — Dr. Y" caen en el mismo chip aunque
// sean citas distintas. Con solo eso, SIR podría borrar un evento que Aaron creó a
// mano.
//
// Por eso la vía del chip pide una prueba extra: que la descripción del evento traiga
// la marca **"cargado por SIR"** que pone `descripcionParaGoogle`. Si la trae, SIR lo
// creó y puede limpiarlo; si no, no se toca. La vía original (título igual o prefijo)
// queda EXACTAMENTE como estaba.
//
// PURO: cero red, cero DB.

import { tituloCorto } from './horaDeNota'

/** Lo mínimo de un evento de Google para decidir. */
export interface EventoGoogleLite {
  id: string
  title: string
  /** 'YYYY-MM-DD' o ISO con hora. */
  start: string
  /**
   * Descripción del evento en Google. Solo se usa para ver si trae la marca de SIR,
   * que es lo que habilita la vía del chip. Si falta, esa vía no aplica.
   */
  description?: string | null
}

/** Un evento que SIR administra, con la referencia que tiene guardada. */
export interface EventoAdministrado {
  /** Título en SIR (puede ser el largo, antes de acortar). */
  title: string
  /** 'YYYY-MM-DD'. */
  date: string
  /** El id de Google que SIR tiene apuntado, o null. */
  gcalEventId: string | null
}

export function norm(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** ¿Los dos títulos son el mismo evento? Uno puede ser el recorte del otro. PURA. */
export function mismoTitulo(a: string, b: string): boolean {
  const x = norm(a), y = norm(b)
  if (!x || !y) return false
  if (x === y) return true
  // `tituloCorto` recorta en el separador natural, así que el corto es prefijo del
  // largo. Se exige un prefijo sustancioso para no emparejar por "examen".
  const corto = x.length <= y.length ? x : y
  const largo = x.length <= y.length ? y : x
  return corto.length >= 12 && largo.startsWith(corto)
}

/** Largo mínimo del chip normalizado para que la vía del chip aplique. */
const MIN_CHIP = 12

/**
 * El "chip": el título tal como SIR lo escribe en Google (`tituloCorto`), normalizado.
 * Es la identidad real del evento allá. PURA.
 */
export function claveChip(t: string): string {
  return norm(tituloCorto(t ?? ''))
}

/** La marca que `descripcionParaGoogle` le deja a todo evento que crea SIR. */
export const MARCA_SIR = 'cargado por sir'

/** ¿Este evento de Google lo creó SIR? Se prueba por la marca de la descripción. PURA. */
export function loCreoSir(e: Pick<EventoGoogleLite, 'description'>): boolean {
  return norm(e?.description ?? '').includes(MARCA_SIR)
}

/**
 * ¿Son el mismo evento, aceptando que los dos títulos LARGOS divergan pero compartan
 * el chip? Solo vale para eventos que creó SIR — ver la cabecera del archivo. PURA.
 */
export function mismoEvento(tituloEnSir: string, g: EventoGoogleLite): boolean {
  if (mismoTitulo(tituloEnSir, g.title)) return true
  if (!loCreoSir(g)) return false
  const chip = claveChip(tituloEnSir)
  return chip.length >= MIN_CHIP && chip === claveChip(g.title)
}

/**
 * Ids de Google que sobran: duplicados de algo que SIR administra. PURA.
 *
 * Devuelve también el motivo, para que quien borre pueda reportarlo. Nunca incluye un
 * id que SIR tenga apuntado.
 */
export function huerfanosParaBorrar(
  enGoogle: readonly EventoGoogleLite[],
  administrados: readonly EventoAdministrado[],
): Array<{ id: string; title: string; date: string; motivo: string }> {
  const mios = new Set(
    (administrados ?? []).map((a) => a.gcalEventId).filter((x): x is string => !!x),
  )
  const out: Array<{ id: string; title: string; date: string; motivo: string }> = []
  const vistos = new Set<string>()

  for (const g of enGoogle ?? []) {
    if (!g?.id || !g?.title || !g?.start) continue
    if (mios.has(g.id)) continue // es el que SIR apunta: se actualiza, no se borra
    if (vistos.has(g.id)) continue
    const dia = String(g.start).slice(0, 10)
    const admin = (administrados ?? []).find((a) => a.date === dia && mismoEvento(a.title, g))
    if (!admin) continue
    // Solo se borra si SIR YA tiene su propia copia viva de ese evento. Si no la
    // tiene, este podría SER el evento bueno y perdimos la referencia: en ese caso
    // adoptarlo es más seguro que borrarlo (lo decide el llamador).
    if (!admin.gcalEventId) continue
    vistos.add(g.id)
    out.push({
      id: g.id, title: g.title, date: dia,
      motivo: `duplicado de "${admin.title.slice(0, 40)}" (SIR apunta a ${admin.gcalEventId.slice(0, 10)}…)`,
    })
  }
  return out
}

/**
 * Eventos administrados que perdieron su referencia y tienen un candidato en Google
 * al cual RE-ENGANCHARSE. PURA.
 *
 * Es la otra mitad del arreglo: si `gcal_event_id` quedó nulo pero el evento sí está
 * en Google, adoptarlo evita crear el duplicado en la próxima corrida. Adoptar es
 * mejor que borrar y recrear: conserva las invitaciones y los recordatorios que Aaron
 * ya le haya puesto en Google.
 */
export function huerfanosParaAdoptar(
  enGoogle: readonly EventoGoogleLite[],
  administrados: readonly EventoAdministrado[],
): Array<{ adminTitle: string; date: string; gcalEventId: string }> {
  const mios = new Set(
    (administrados ?? []).map((a) => a.gcalEventId).filter((x): x is string => !!x),
  )
  const out: Array<{ adminTitle: string; date: string; gcalEventId: string }> = []
  for (const a of administrados ?? []) {
    if (a.gcalEventId) continue
    // La vía del chip también aplica acá, y también exige la marca de SIR: adoptar un
    // evento equivocado es destructivo de otra forma — SIR le pisaría el título y la
    // hora al evento que Aaron hizo a mano.
    const cand = (enGoogle ?? []).find((g) =>
      !!g?.id && !mios.has(g.id) && String(g.start).slice(0, 10) === a.date && mismoEvento(a.title, g))
    if (cand) out.push({ adminTitle: a.title, date: a.date, gcalEventId: cand.id })
  }
  return out
}
