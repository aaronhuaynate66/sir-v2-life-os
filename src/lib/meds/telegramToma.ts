// SIR V2 — Marcar una toma desde el aviso de Telegram. PURO.
//
// ═══ POR QUÉ ═════════════════════════════════════════════════════════════════
//
// Aaron, 3-ago-2026: *"un recordatorio de esas medicinas por telegram o
// notificaciones push y el conteo de todas esas medicinas"*.
//
// El recordatorio ya se entrega, pero avisar y contar son cosas distintas: si para
// registrar la toma hay que abrir la app, el conteo va a quedar en cero y el panel va
// a decir "falta la de hoy" para siempre. Es el mismo hueco que tuvo el 👍/👎: se le
// pedía calificar y en Telegram no había botón (#1030).
//
// Acá el aviso trae un botón por medicamento, más uno de "todas". Un tap = una toma.
//
// ═══ EL LÍMITE DE 64 BYTES ═══════════════════════════════════════════════════
//
// `callback_data` de la Bot API topea en 64 bytes. Por eso:
//   · individual → `med:<itemId>`   (los ids son cortos: `presci_maxilo_orfenadrina`)
//   · todas      → `medall:<HHMM>`  (la hora, no la lista: una lista no cabe)
// El handler de "todas" resuelve los ítems por su `schedule`, no por el mensaje: el
// texto del aviso no es una fuente de verdad.

export const MED_CB = 'med:'
export const MED_ALL_CB = 'medall:'

/** Prefijo de los ids de recordatorio que SON una toma de medicación. */
const REM_TOMA = 'rem_med_'

/** Id determinístico del recordatorio de la toma de `fecha` a `hora`. PURA. */
export function remIdDeToma(fecha: string, hora: string): string {
  return `${REM_TOMA}${fecha}_${(hora ?? '').replace(':', '')}`
}

/**
 * ¿Este recordatorio ES una toma de medicación? Devuelve su hora, o null. PURA.
 *
 * ═══ POR QUÉ NO SE DERIVA DE `due_at` ═══
 * El cron decidía si adjuntar botones mirando la HORA del `due_at` de cualquier
 * recordatorio que tuviera `med_prescription_id`. Eso funcionaba de casualidad: el
 * recordatorio de los 5 laboratorios del neurólogo también cuelga de esa receta (es su
 * monitoreo) y si hubiera caído a una hora con medicamentos agendados, el cron le
 * habría REEMPLAZADO el texto por el de la toma — el aviso de los laboratorios habría
 * desaparecido sin dejar rastro.
 *
 * La intención tiene que estar en el id, no adivinarse de la hora.
 */
export function horaDeRecordatorioDeToma(reminderId: string | null | undefined): string | null {
  const s = (reminderId ?? '').trim()
  if (!s.startsWith(REM_TOMA)) return null
  const m = s.slice(REM_TOMA.length).match(/^(\d{4}-\d{2}-\d{2})_(\d{2})(\d{2})$/)
  if (!m) return null
  if (Number(m[2]) > 23 || Number(m[3]) > 59) return null
  return `${m[2]}:${m[3]}`
}

/**
 * La FECHA de la toma que el id codifica ('YYYY-MM-DD'), o null. PURA.
 *
 * `horaDeRecordatorioDeToma` devuelve solo la hora y DESCARTA esta fecha, que el
 * id siempre trajo. Eso produjo el reclamo del 4-ago-2026: a las 06:32 de la
 * mañana le llegó "💊 Toma de las 22:00 · … · Toca lo que ya tomaste", y Aaron
 * preguntó lo obvio — *"¿qué sentido tiene que me pregunte en la mañana si las
 * acabo de tomar si el objetivo es tomarlas en la noche? A menos que la pregunta
 * sea si las tomé anoche, pero igual no es muy bueno porque podría olvidarme"*.
 *
 * Una hora sin día no se puede interpretar. El día estaba en el id.
 */
export function fechaDeRecordatorioDeToma(reminderId: string | null | undefined): string | null {
  const s = (reminderId ?? '').trim()
  if (!s.startsWith(REM_TOMA)) return null
  const m = s.slice(REM_TOMA.length).match(/^(\d{4}-\d{2}-\d{2})_(\d{2})(\d{2})$/)
  if (!m) return null
  if (Number(m[2]) > 23 || Number(m[3]) > 59) return null
  return m[1]
}

/** Cuándo es la toma respecto del día en que se avisa. PURA. */
export type CuandoToma = 'hoy' | 'anoche' | 'ayer' | 'atrasada'

/**
 * Desde qué hora una toma del día anterior se puede llamar "anoche".
 *
 * Existe por la captura que mandó Aaron el 8-ago-2026 a las 09:59: a las 06:04 le
 * habían llegado dos mensajes que se contradecían en su propio título —
 * **"¿Tomaste la de ANOCHE (08:00)?"** y **"¿Tomaste la de ANOCHE (13:00)?"**, los
 * dos del calcio. Las 08:00 no son de noche y las 13:00 tampoco.
 *
 * La causa: esta función decidía mirando SOLO el día. Era correcto mientras la única
 * toma del sistema fuera la de las 22:00 — "la de ayer" y "la de anoche" eran la
 * misma cosa. El calcio (08:00 y 13:00, desde el 3-ago) rompió esa suposición y la
 * etiqueta quedó mintiendo sin que nada fallara.
 */
export const HORA_ES_DE_NOCHE = 18

/**
 * Cómo hay que referirse a la toma según CUÁNDO fue, no solo qué día. PURA.
 *
 * `null` si no se puede saber (id sin fecha): ahí el texto se queda sin día, que
 * es el comportamiento viejo — mejor un aviso ambiguo que ninguno.
 */
export function cuandoDeLaToma(
  fechaToma: string | null | undefined,
  hoyLima: string,
  horaToma?: string | null,
): CuandoToma | null {
  const f = (fechaToma ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || !/^\d{4}-\d{2}-\d{2}$/.test(hoyLima)) return null
  if (f === hoyLima) return 'hoy'
  if (f > hoyLima) return 'hoy' // toma futura: se avisa como la de "hoy" del día que toque
  const ayer = new Date(Date.parse(`${hoyLima}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
  if (f !== ayer) return 'atrasada'
  // De ayer: "anoche" SOLO si de verdad fue de noche. Sin hora no se puede afirmar
  // que lo fue, y 'ayer' es verdadera en los dos casos — entre una etiqueta que
  // puede mentir y una que no, gana la que no.
  const h = /^(\d{1,2}):\d{2}$/.exec((horaToma ?? '').trim())
  if (!h) return 'ayer'
  return Number(h[1]) >= HORA_ES_DE_NOCHE ? 'anoche' : 'ayer'
}

/**
 * La ETIQUETA de una dosis: '2026-08-03T08:00' en hora de Lima. PURA.
 *
 * Identifica QUÉ toma es, que es distinto de cuándo se tocó el botón. Sin esto, el
 * candado de idempotencia era por (ítem, DÍA) y el 6-ago pasó lo siguiente: el tap de
 * las 09:31 respondía al aviso de la noche del 5, se guardó como del día 6, y esa
 * noche la dosis REAL del 6 salió como "ya registrada". Con dos tomas por día —el
 * suplemento de calcio— el mismo candado habría tapado la del almuerzo.
 *
 * No lleva offset a propósito: no es un instante, es "la toma de las 08:00 del 3".
 */
export function slotDeDosis(fecha: string | null | undefined, hora: string | null | undefined): string | null {
  const f = (fecha ?? '').trim()
  const h = (hora ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || !/^\d{2}:\d{2}$/.test(h)) return null
  if (Number(h.slice(0, 2)) > 23 || Number(h.slice(3, 5)) > 59) return null
  return `${f}T${h}`
}

/** ¿Tiene forma de slot? PURA. */
const esSlot = (s: string): boolean => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)

/**
 * `med:<slot>:<itemId>` — o `med:<itemId>` si no se sabe la dosis. PURA.
 *
 * ═══ RETROCOMPATIBILIDAD OBLIGATORIA ════════════════════════════════════════
 * Los avisos del 3 al 6 de agosto siguen vivos en el chat de Aaron con los callbacks
 * viejos. Si el parser dejara de aceptarlos, cada uno de esos botones moriría en
 * silencio — y "el botón no hace nada" es exactamente el reclamo del que venimos.
 *
 * Cabe de sobra: `med:2026-08-03T08:00:presci_emerg_paracetramadol` = 44 bytes de los
 * 64 que permite Telegram (ese es el itemId más largo que hay en producción).
 */
export function medCallbackData(itemId: string, slot?: string | null): string {
  const s = (slot ?? '').trim()
  const data = s && esSlot(s) ? `${MED_CB}${s}:${itemId}` : `${MED_CB}${itemId}`
  return Buffer.byteLength(data, 'utf8') <= 64 ? data : `${MED_CB}${itemId}`
}

/** `medall:<slot>` — o `medall:2200` si no se sabe la dosis. PURA. */
export function medAllCallbackData(hora: string, slot?: string | null): string {
  const s = (slot ?? '').trim()
  if (s && esSlot(s)) return `${MED_ALL_CB}${s}`
  return `${MED_ALL_CB}${(hora ?? '').replace(':', '')}`
}

/**
 * Parsea el botón de UN medicamento. null si no es uno. PURA.
 *
 * `slot` viene null con los callbacks viejos — y ahí el llamador cae al
 * comportamiento anterior (la dosis de hoy), bit por bit.
 */
export function parseMedCallback(data: string | null | undefined): { itemId: string; slot: string | null } | null {
  const s = (data ?? '').trim()
  if (!s.startsWith(MED_CB)) return null
  const resto = s.slice(MED_CB.length).trim()
  if (resto.length === 0) return null
  // Forma nueva: `<slot>:<itemId>`. El slot tiene 16 chars y ningún itemId de
  // producción empieza con un año, así que no hay ambigüedad.
  const m = resto.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}):(.+)$/)
  if (m) {
    const [, slot, itemId] = m
    if (!esSlot(slot) || Number(slot.slice(11, 13)) > 23 || Number(slot.slice(14, 16)) > 59) return null
    return itemId.trim().length > 0 ? { itemId: itemId.trim(), slot } : null
  }
  return { itemId: resto, slot: null }
}

/** Parsea el botón de "todas". null si no es uno. PURA. */
export function parseMedAllCallback(data: string | null | undefined): { hora: string; slot: string | null } | null {
  const s = (data ?? '').trim()
  if (!s.startsWith(MED_ALL_CB)) return null
  const raw = s.slice(MED_ALL_CB.length).trim()
  // Forma nueva: el slot completo.
  if (esSlot(raw)) {
    const hora = raw.slice(11)
    if (Number(hora.slice(0, 2)) > 23 || Number(hora.slice(3, 5)) > 59) return null
    return { hora, slot: raw }
  }
  // Forma vieja: solo `HHMM`.
  if (!/^\d{4}$/.test(raw)) return null
  const hh = raw.slice(0, 2)
  const mm = raw.slice(2, 4)
  if (Number(hh) > 23 || Number(mm) > 59) return null
  return { hora: `${hh}:${mm}`, slot: null }
}

export interface MedDeToma {
  itemId: string
  medName: string
  dose: string | null
  /** true si esta DOSIS ya se registró: el botón cambia de texto y no se ofrece de nuevo. */
  yaRegistrada: boolean
}

export interface BotonFila {
  text: string
  callbackData: string
}

/**
 * Los botones del aviso: uno por medicamento pendiente + "todas" si hay 2 o más.
 * Los ya tomados se muestran con ✓ y SIN callback nuevo (se manda el mismo, el
 * handler es idempotente) para que Aaron vea el estado y no dude si tocó o no. PURA.
 */
export function botonesDeToma(
  meds: readonly MedDeToma[],
  hora: string,
  slot?: string | null,
): BotonFila[][] {
  const lista = (meds ?? []).filter((m) => m?.itemId && m?.medName)
  if (lista.length === 0) return []
  const filas: BotonFila[][] = lista.map((m) => [{
    // "Marcar:" y no un ✅ pelado. Aaron, 6-ago: creyó que SIR le había marcado
    // "Tender la cama" solo, porque el botón `✅ Tender la cama` se lee igual que un
    // recibo de algo ya hecho. Acá aplica idéntico: el ✅ queda para lo YA
    // registrado (✓) y el pendiente dice qué acción hace.
    text: m.yaRegistrada ? `✓ ${m.medName}` : `Marcar: ${m.medName}`,
    callbackData: medCallbackData(m.itemId, slot),
  }])
  const pendientes = lista.filter((m) => !m.yaRegistrada)
  // "Todas" sólo si de verdad ahorra taps: con una sola pendiente es ruido.
  if (pendientes.length >= 2) {
    filas.push([{ text: `Marcar todas (${pendientes.length})`, callbackData: medAllCallbackData(hora, slot) }])
  }
  return filas
}

/**
 * El texto del aviso. PURA.
 *
 * `cuando` decide si esto es un aviso ANTES de la toma o una pregunta DESPUÉS —
 * dos mensajes distintos que antes se decían con las mismas palabras. Sin él, el
 * texto queda como estaba (sin día).
 */
export function textoDeToma(
  meds: readonly MedDeToma[],
  hora: string,
  cuando?: CuandoToma | null,
): string {
  const lista = (meds ?? []).filter((m) => m?.itemId && m?.medName)
  const pendientes = lista.filter((m) => !m.yaRegistrada)
  if (pendientes.length === 0) {
    return `💊 ${hora} — ya registraste todo lo de esta toma. 👏`
  }
  const nombres = pendientes.map((m) => `${m.medName}${m.dose ? ` ${m.dose}` : ''}`).join('\n· ')
  // ANOCHE / ATRASADA es una PREGUNTA sobre el pasado; HOY es un aviso de algo que
  // todavía no pasó. Decir "toca lo que ya tomaste" para una toma que falta una
  // hora es lo que volvía el mensaje incomprensible.
  if (cuando === 'anoche') {
    return `💊 ¿Tomaste la de ANOCHE (${hora})?\n\n· ${nombres}\n\nSi la tomaste, tócala 👇`
  }
  // "Ayer a las 08:00" en vez de "ANOCHE (08:00)": la de la mañana también se
  // pregunta al día siguiente cuando quedó sin marcar, pero no es de anoche.
  if (cuando === 'ayer') {
    return `💊 ¿Tomaste la de AYER a las ${hora}?\n\n· ${nombres}\n\nSi la tomaste, tócala 👇`
  }
  if (cuando === 'atrasada') {
    return `💊 Quedó sin registrar la toma de las ${hora}\n\n· ${nombres}\n\nSi la tomaste, tócala 👇`
  }
  if (cuando === 'hoy') {
    return `💊 Toma de HOY a las ${hora}\n\n· ${nombres}\n\nCuando la tomes, tócala 👇`
  }
  return `💊 Toma de las ${hora}\n\n· ${nombres}\n\nToca lo que ya tomaste 👇`
}
