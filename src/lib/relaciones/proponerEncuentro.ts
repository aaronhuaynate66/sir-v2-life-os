// SIR V2 — El mensaje que convierte "quedamos en vernos" en una fecha. PURO.
//
// ═══ POR QUÉ ESTE MENSAJE Y NO UNA LÍNEA DE AVISO ═════════════════════════════
//
// Aaron: *"no me dices quién ni me dices qué hacer, esa información así vacía no me
// ayuda"*. Un aviso que dice "tienes un compromiso sin fecha con Diana" es
// exactamente esa información vacía. Lo que sirve es un horario concreto y un toque.
//
// Es el mismo salto que dio el aviso de la medicación: el mensaje ya existía, lo que
// faltaba era poder CERRARLO desde ahí. Antes de eso, `med_intakes` llevaba 35 filas
// y CERO del esquema nuevo.
//
// ═══ TRES CAMINOS, Y NINGUNO MIENTE ══════════════════════════════════════════
//
// 1. Hay huecos calculados → se proponen (dice que están libres, porque lo están).
// 2. La agenda NO se pudo leer → se ofrecen días, diciendo que no la pudo mirar.
//    NUNCA se afirma que estén libres. [[postgrest-columna-inexistente]]
// 3. La agenda se leyó y está llena → se ofrecen días, diciendo que están cargados.
//
// Los tres llevan salida ("ahora no"). Un aviso sin salida es el reclamo que Aaron
// hizo tres veces: descartar una tarea no tenía ningún camino.
//
// PURO: cero red, cero DB.

import { briefCallbackData } from '@/lib/telegram/briefThread'

/** Un hueco ya calculado (la forma que devuelve `agenda/huecos`). */
export interface HuecoParaProponer {
  inicio: string
  diaLima: string
  horaLima: string
}

export interface BotonDeEncuentro {
  text: string
  callbackData: string
}

export interface PropuestaDeEncuentro {
  text: string
  filas: BotonDeEncuentro[][]
}

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'] as const

/** 'YYYY-MM-DD' → 'vie 7' en hora de Lima (la fecha ya viene en día de Lima). */
function etiquetaDeDia(diaLima: string): string {
  const ms = Date.parse(`${diaLima}T12:00:00Z`)
  if (!Number.isFinite(ms)) return diaLima
  const d = new Date(ms)
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()}`
}

/**
 * `<personId>~<YYYYMMDDHHmm>` — cabe en los 64 bytes de `callback_data`
 * (61 con el prefijo `br|enc_slot|`, verificado). PURA.
 */
export function refDeEncuentro(personId: string, diaLima: string, horaLima: string): string {
  return `${personId}~${diaLima.replace(/-/g, '')}${horaLima.replace(':', '')}`
}

/** Parsea ese ref. null si no tiene la forma. PURA. */
export function parseRefDeEncuentro(
  ref: string,
): { personId: string; diaLima: string; horaLima: string } | null {
  const m = (ref ?? '').match(/^([0-9a-f-]{8,40})~(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/i)
  if (!m) return null
  const [, personId, y, mo, d, h, mi] = m
  if (Number(mo) < 1 || Number(mo) > 12 || Number(d) < 1 || Number(d) > 31) return null
  if (Number(h) > 23 || Number(mi) > 59) return null
  return { personId, diaLima: `${y}-${mo}-${d}`, horaLima: `${h}:${mi}` }
}

/** Los próximos `n` días de Lima a partir de mañana, como 'YYYY-MM-DD'. PURA. */
export function proximosDias(hoyLima: string, n: number): string[] {
  const base = Date.parse(`${hoyLima}T00:00:00Z`)
  if (!Number.isFinite(base)) return []
  const out: string[] = []
  for (let i = 1; i <= n; i++) out.push(new Date(base + i * 86_400_000).toISOString().slice(0, 10))
  return out
}

/** Hora por defecto cuando no hay hueco calculado: noche entre semana, mediodía el finde. */
function horaPorDefecto(diaLima: string): string {
  const d = new Date(Date.parse(`${diaLima}T12:00:00Z`)).getUTCDay()
  return d === 0 || d === 6 ? '11:00' : '19:00'
}

export interface EntradaDePropuesta {
  personId: string
  nombre: string
  /** El fragmento textual del compromiso, para citarlo. */
  frase: string
  /** Hace cuántos días quedó, si se sabe. */
  diasDesde: number | null
  /** Huecos calculados. Vacío = no hay (o no se pudo mirar). */
  huecos: readonly HuecoParaProponer[]
  /** false si la agenda NO se pudo leer. Decide el texto, no los botones. */
  agendaLegible: boolean
  /** Día de Lima de hoy, para armar los días alternativos. */
  hoyLima: string
}

/**
 * Arma el mensaje con sus botones. null si falta lo mínimo. PURA.
 *
 * El "ahora no" va SIEMPRE: si el único camino es aceptar, la próxima noche vuelve
 * a preguntar lo mismo y el aviso se vuelve ruido.
 */
export function construirPropuestaDeEncuentro(e: EntradaDePropuesta): PropuestaDeEncuentro | null {
  const nombre = (e?.nombre ?? '').trim()
  const personId = (e?.personId ?? '').trim()
  if (!nombre || !personId) return null

  const cuando =
    typeof e.diasDesde === 'number' && e.diasDesde > 0
      ? ` desde hace ${e.diasDesde} día${e.diasDesde === 1 ? '' : 's'}`
      : ''
  const cita = (e.frase ?? '').trim().replace(/\s+/g, ' ').slice(0, 140)
  const encabezado = `💚 Con ${nombre} quedó pendiente verse${cuando}.`
  const lineaCita = cita ? `\n\n“${cita}”` : ''

  const filas: BotonDeEncuentro[][] = []
  let cuerpo: string

  if (e.huecos.length > 0) {
    const lista = e.huecos
      .map((h) => `· ${etiquetaDeDia(h.diaLima)} ${h.horaLima}`)
      .join('\n')
    cuerpo = `\n\nTienes libre:\n${lista}\n\n¿Cuál agendo?`
    for (const h of e.huecos) {
      const cb = briefCallbackData('enc_slot', refDeEncuentro(personId, h.diaLima, h.horaLima))
      // Si no cabe se OMITE el botón en vez de mandar uno roto.
      if (cb) filas.push([{ text: `${etiquetaDeDia(h.diaLima)} ${h.horaLima}`, callbackData: cb }])
    }
  } else {
    // Sin huecos: los dos motivos posibles se dicen distinto, porque son distintos.
    cuerpo = e.agendaLegible
      ? '\n\nTu agenda viene cargada esos días, así que no te propongo una hora a ciegas. ¿Qué día te queda?'
      : '\n\nNo pude mirar tu agenda, así que no sé qué tienes libre. ¿Qué día te queda?'
    for (const dia of proximosDias(e.hoyLima, 3)) {
      const hora = horaPorDefecto(dia)
      const cb = briefCallbackData('enc_slot', refDeEncuentro(personId, dia, hora))
      if (cb) filas.push([{ text: `${etiquetaDeDia(dia)} ${hora}`, callbackData: cb }])
    }
  }

  const no = briefCallbackData('enc_no', personId)
  if (no) filas.push([{ text: '🔕 Ahora no', callbackData: no }])
  if (filas.length === 0) return null

  return { text: `${encabezado}${lineaCita}${cuerpo}`, filas }
}
