// SIR V2 — El tono DICE DE CUÁNDO ES, y los mensajes dejan de ser invisibles. PURO.
//
// ═══ EL RECLAMO ═══════════════════════════════════════════════════════════════
//
// Aaron, 6-ago-2026: *"me dice que no sé nada de Diana pero sí lee mis WhatsApp con
// Diana, prácticamente me he visto con ella todos los días, así que no está cruzando
// esa información"*.
//
// Medido: el estado de la relación está en `estable` desde el último apunte que él
// tipeó, que está guardado como `2026-08-01T02:30Z` — o sea el **31-jul 21:30 de
// Lima**. (Esa diferencia importa y la cazó un test: contar los días en hora de Lima
// y mostrar la fecha UTC daba dos verdades distintas en la misma línea.) `recentAvg` sale del promedio de los 3 apuntes
// más nuevos (4, 3, 2 → 3.0) contra los 3 anteriores (2, 3, 4 → 3.0): `toneDelta` = 0.
// Mientras tanto pasaron **677 mensajes en 7 días** que ningún motor lee como tono.
//
// **La etiqueta no está MAL: está VIEJA y no lo dice.** Eso es lo que este módulo
// arregla — no inventa un tono nuevo, hace visible que la lectura es de hace días y
// cuánta conversación pasó sin leer. Es la regla de honestidad de cobertura del repo
// aplicada al estado de una relación.
//
// ═══ LAS REGLAS QUE AARON FIJÓ, Y QUE ACÁ SON RESTRICCIONES DE DISEÑO ═════════
//
// Cuando pidió medir el afecto en el chat (23-jul-2026) dejó condiciones explícitas,
// y la investigación de ese día encontró que **ningún estudio valida "menos 'te amo' =
// menos amor"**. Así que:
//
//   1. Es un DISPARADOR DE CONVERSACIÓN, no un veredicto. Todo lo que sale de acá
//      termina en PREGUNTA. Nunca "te quiere menos", nunca un número de calidad.
//   2. **Este módulo NO produce un `quality` 1-5 y no toca `recentAvg` ni la
//      etiqueta.** Convertir volumen de mensajes en un juicio sobre la relación es
//      exactamente lo que él pidió no hacer.
//   3. Umbrales PERSONALES: la base se calcula de su propio historial, no de un
//      número inventado. Y con menos de 21 días de base NO se compara — se dice que
//      es provisional.
//   4. Declarar incertidumbre. Un volumen bajo puede ser que ella ande ocupada, que
//      él ande ocupado, o que se estén viendo en persona (que es justo su caso).
//   5. Tono de cuidado: esto le amplifica la ansiedad, y la data puede tranquilizarlo
//      tanto como alertarlo. Cuando el ritmo está normal, DECIRLO es lo valioso.
//
// PURO: cero red, cero DB, cero LLM. El "ahora" se inyecta.

/** Un apunte manual de interacción (`person_logs` kind='interaction'). */
export interface ApunteDeTono {
  /** 1-5. */
  value: number
  /** ISO. */
  loggedAt: string
}

/** Mensajes agrupados por día de Lima. */
export interface DiaDeMensajes {
  /** 'YYYY-MM-DD' (día de Lima). */
  dia: string
  total: number
}

export interface FrescuraDelTono {
  ultimoApunte: string | null
  /**
   * El día de LIMA del apunte ('YYYY-MM-DD'), que es lo que hay que MOSTRAR.
   *
   * No es cosmético: el apunte de Diana está guardado como `2026-08-01T02:30Z`, que
   * en Lima es el **31-jul a las 21:30**. Cortar el ISO daba "1-ago" mientras los días
   * se contaban desde el 31-jul — dos verdades distintas en la misma línea. El test
   * lo cazó. [[hora-de-lima-tz-no-funciona]]
   */
  diaDelApunte: string | null
  /** Días enteros desde el último apunte. null si no hay ninguno. */
  diasDesde: number | null
  /** Mensajes intercambiados DESDE ese apunte (o en toda la ventana si no hay). */
  mensajesDesde: number
  /**
   * La lectura del tono está vieja Y hubo conversación sin leer. Es la condición que
   * convierte "estable" en una afirmación que ya no se sostiene sola.
   */
  rancio: boolean
}

export interface RitmoDelSustrato {
  /** Mediana diaria de la ventana larga. null si no alcanza. */
  medianaBase: number | null
  /** Mediana diaria de los últimos días. null si no hay datos. */
  medianaReciente: number | null
  /** Días con al menos un mensaje en la ventana larga. */
  diasConDatos: number
  /** ¿Hay base personal suficiente para comparar? (regla suya: ≥21 días) */
  suficiente: boolean
  /** Cayó por debajo del umbral respecto de SU base. Solo si `suficiente`. */
  caida: boolean
}

/** Un apunte más viejo que esto, con mensajes después, ya es una lectura rancia. */
export const DIAS_RANCIO = 3
/** Mínimo de días con datos para tener base PERSONAL. Regla de Aaron: 21-28 días. */
export const MIN_DIAS_BASE = 21
/** Por debajo de esta fracción de su base, vale preguntar. Conservador a propósito. */
export const UMBRAL_CAIDA = 0.5
/** Días de la ventana "reciente". */
export const DIAS_RECIENTES = 7

const DAY = 86_400_000
const LIMA = 5 * 3_600_000

/** 'YYYY-MM-DD' del día de Lima de un instante. */
const diaLima = (ms: number): string => new Date(ms - LIMA).toISOString().slice(0, 10)

/** Mediana de una lista de números. null si está vacía. PURA. */
function mediana(xs: readonly number[]): number | null {
  const v = xs.filter((n) => Number.isFinite(n)).slice().sort((a, b) => a - b)
  if (v.length === 0) return null
  const m = Math.floor(v.length / 2)
  return v.length % 2 === 1 ? v[m] : Math.round(((v[m - 1] + v[m]) / 2) * 10) / 10
}

/**
 * ¿De cuándo es la lectura del tono, y cuánta conversación pasó desde entonces? PURA.
 *
 * Es lo que permite decir "estable, según tu apunte del 1-ago" en vez de "estable" a
 * secas. Sin esto, una etiqueta de hace seis días se lee como el estado de hoy.
 */
export function frescuraDelTono(
  apuntes: readonly ApunteDeTono[],
  dias: readonly DiaDeMensajes[],
  nowMs: number,
): FrescuraDelTono {
  const validos = (apuntes ?? [])
    .filter((a) => a && typeof a.loggedAt === 'string' && Number.isFinite(Date.parse(a.loggedAt)))
    .slice()
    .sort((a, b) => Date.parse(a.loggedAt) - Date.parse(b.loggedAt))
  const ultimo = validos.at(-1) ?? null
  const ultimoApunte = ultimo?.loggedAt ?? null
  const diaDelApunte = ultimoApunte ? diaLima(Date.parse(ultimoApunte)) : null

  const hoy = diaLima(nowMs)
  const diasDesde = ultimoApunte
    ? Math.max(0, Math.round(
      (Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${diaLima(Date.parse(ultimoApunte))}T00:00:00Z`)) / DAY,
    ))
    : null

  // Mensajes DESPUÉS del apunte. Sin apunte, toda la ventana cuenta.
  const corte = ultimoApunte ? diaLima(Date.parse(ultimoApunte)) : ''
  const mensajesDesde = (dias ?? [])
    .filter((d) => d && typeof d.dia === 'string' && d.dia > corte)
    .reduce((n, d) => n + (Number.isFinite(d.total) ? d.total : 0), 0)

  // Rancio = la lectura tiene días Y hubo conversación que nadie leyó como tono.
  // Las dos condiciones: un apunte viejo sin mensajes después no es un hueco, es una
  // relación que simplemente no tuvo movimiento.
  const rancio = diasDesde !== null && diasDesde >= DIAS_RANCIO && mensajesDesde > 0
  return { ultimoApunte, diaDelApunte, diasDesde, mensajesDesde, rancio }
}

/**
 * El ritmo de conversación contra SU propia base. PURA.
 *
 * Volumen, no contenido: cuántos mensajes por día, comparado con su mediana personal.
 * Deliberadamente NO interpreta las palabras — eso sería el veredicto que él pidió no
 * construir. La mediana (y no el promedio) porque un día de 181 mensajes no debe mover
 * la base.
 */
export function ritmoDelSustrato(
  dias: readonly DiaDeMensajes[],
  nowMs: number,
): RitmoDelSustrato {
  const limpios = (dias ?? []).filter((d) => d && typeof d.dia === 'string' && Number.isFinite(d.total) && d.total > 0)
  const hoy = diaLima(nowMs)
  // HOY se excluye: a las 07:00 lleva 16 mensajes y compararlo contra una mediana de
  // día completo diría que se cayó a la quinta parte. Un día a medias no es un día.
  const cerrados = limpios.filter((d) => d.dia < hoy)
  const diasConDatos = cerrados.length
  const desdeReciente = diaLima(nowMs - DIAS_RECIENTES * DAY)
  const recientes = cerrados.filter((d) => d.dia >= desdeReciente).map((d) => d.total)
  const base = cerrados.map((d) => d.total)

  const suficiente = diasConDatos >= MIN_DIAS_BASE
  const medianaBase = suficiente ? mediana(base) : null
  const medianaReciente = mediana(recientes)
  const caida = suficiente
    && medianaBase != null && medianaBase > 0
    && medianaReciente != null
    && medianaReciente < medianaBase * UMBRAL_CAIDA

  return { medianaBase, medianaReciente, diasConDatos, suficiente, caida }
}

/**
 * La línea para el brief. null si no hay nada honesto que decir. PURA.
 *
 * SIEMPRE termina en pregunta y SIEMPRE dice de cuándo es la lectura. Nunca afirma
 * nada sobre lo que la otra persona siente: eso no se puede saber del volumen de un
 * chat, y decirlo sería inventar.
 */
export function lineaDeTono(
  nombre: string,
  f: FrescuraDelTono,
  r: RitmoDelSustrato,
): string | null {
  const quien = (nombre ?? '').trim().split(/\s+/)[0] || 'esa persona'
  const fecha = f.diaDelApunte

  // 1. CAÍDA de ritmo contra su propia base: es lo que más vale preguntar, y se dice
  //    con las dos causas inocentes al lado para que no se lea como veredicto.
  if (r.caida && r.medianaReciente != null && r.medianaBase != null) {
    return `💚 Con ${quien} el ritmo bajó: ~${r.medianaReciente} mensajes al día esta semana, `
      + `y lo tuyo de siempre es ~${r.medianaBase}. Puede ser que alguno de los dos ande ocupado, `
      + `o que se estén viendo en persona. ¿Todo bien?`
  }

  // 2. La lectura del tono está vieja y hubo conversación sin leer.
  if (f.rancio && f.diasDesde != null) {
    const ritmo = r.medianaReciente != null && r.medianaBase != null && !r.caida
      ? ` Tu ritmo con ella sigue igual (~${r.medianaReciente} al día).`
      : r.medianaReciente != null
        ? ` Van ~${r.medianaReciente} mensajes al día.`
        : ''
    return `💚 Con ${quien} llevas ${f.mensajesDesde} mensajes desde tu último apunte`
      + `${fecha ? ` (el ${fecha}, hace ${f.diasDesde} días)` : ''}, y de ahí sale lo que sé del tono.`
      + `${ritmo} ¿Cómo va?`
  }

  return null
}

/**
 * Cómo calificar la etiqueta del estado para que no se lea como si fuera de hoy. PURA.
 *
 * `'estable'` a secas afirma el presente. `'estable (según tu apunte del 1-ago)'` dice
 * lo mismo sin mentir sobre cuándo se midió. Devuelve '' cuando la lectura es fresca.
 */
export function sufijoDeFrescura(f: FrescuraDelTono): string {
  if (!f.rancio || !f.diaDelApunte) return ''
  return ` (según tu apunte del ${f.diaDelApunte})`
}
