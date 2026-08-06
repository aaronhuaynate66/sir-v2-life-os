// SIR V2 — El estado de TODAS las fuentes de datos, en un solo veredicto. PURO.
//
// ═══ POR QUÉ ═════════════════════════════════════════════════════════════════
//
// Aaron, 5-ago-2026: *"hasta ahora no veo el monitor dentro de SIR para ver la data
// que está jalando de las otras aplicaciones"*.
//
// Y es la TERCERA vez que lo pide. La página existe (`/reader`) y hay un comentario
// en `Nav.tsx` que dice literal que *"Aaron lo pidió dos veces sin saber que ya
// existía"*. El problema no es que falte: es que **solo vigila los 5 canales de la
// extensión**. Calendario, correo, Apple Health, Telegram y los 13 crons no aparecen
// en ninguna pantalla — y dos de ellos YA están computados y nadie los pinta:
//
//   · `lib/cron/salud.ts` sabe si el motor de relaciones lleva días mudo, y eso solo
//     sale como una línea del brief de las 6 am. Si Aaron abre la web, no hay dónde verlo.
//   · `/api/calendar` ya devuelve `calendars[].error` y `fetchedAt`. Si un feed .ics
//     devuelve 401, la UI muestra eventos rancios SIN UNA SOLA SEÑAL.
//
// ═══ LA REGLA QUE ORDENA TODO ESTE MÓDULO ════════════════════════════════════
//
// **Una fuente que no se puede vigilar se DECLARA, no se omite.** Omitirla de la
// pantalla insinúa que está sana, y esa es exactamente la mentira que este repo
// persigue: no concluir que algo está bien desde una vista que no lo alcanza.
//
// Por eso `sin-vigilancia` es un estado de primera clase y no un hueco. Instagram
// late pero no tiene probe; el correo no tiene cron; de Telegram no se guarda ni la
// hora del último webhook. Las tres cosas hay que decirlas.

/** Qué tan bien se ve esta fuente. El orden es el de gravedad para ordenar la lista. */
export type Vigilancia =
  | 'caido'           // vigilada, y está rota
  | 'atencion'        // vigilada, algo no cuadra (vieja, sin datos)
  | 'sin-vigilancia'  // NO se puede saber. No es lo mismo que estar bien.
  | 'ok'              // vigilada y sana

export type GrupoFuente = 'lectores' | 'agenda' | 'correo' | 'salud' | 'mensajeria' | 'motores'

export interface FuenteEstado {
  clave: string
  nombre: string
  grupo: GrupoFuente
  vigilancia: Vigilancia
  /** Dos o tres palabras: "Andando", "Late, no trae", "Sin vigilancia". */
  veredicto: string
  /** La medición concreta. null si no hay ninguna. */
  detalle: string | null
  /** Qué NO se puede saber de esta fuente. Se muestra SIEMPRE que exista. */
  limite: string | null
  /** Cómo entra la data. Aaron necesita saber si depende de que él haga algo. */
  comoEntra: string
}

const DIA = 86_400_000

/** Días enteros entre un ISO y ahora. null si no parsea. PURA. */
export function diasDesde(iso: string | null | undefined, nowMs: number): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return Math.floor((nowMs - t) / DIA)
}

/** "hace 3 días" · "hoy" · "nunca". PURA. */
export function haceCuanto(iso: string | null | undefined, nowMs: number): string {
  const d = diasDesde(iso, nowMs)
  if (d === null) return 'nunca'
  if (d <= 0) return 'hoy'
  if (d === 1) return 'ayer'
  return `hace ${d} días`
}

// ─────────────────────────────────────────────────────────────────────────────
// CALENDARIO
// ─────────────────────────────────────────────────────────────────────────────

export interface CalendarioInput {
  /** Feeds configurados, con el error del último fetch si lo hubo. */
  calendars: ReadonlyArray<{ id: string; label: string | null; error?: string | null }>
  /** Instante real del fetch más reciente. */
  fetchedAt?: string | null
}

/**
 * El estado de los calendarios. PURA.
 *
 * `error` y `fetchedAt` ya viajan por `/api/calendar` y **ningún .tsx los lee** —
 * verificado el 5-ago. Un feed con 401 devuelve caché viejo y la agenda muestra
 * eventos rancios sin avisar. Eso es lo que esta función existe para hacer visible.
 */
export function estadoCalendario(input: CalendarioInput | null, nowMs: number): FuenteEstado {
  const base = { clave: 'calendario', nombre: 'Calendario', grupo: 'agenda' as const, comoEntra: 'se lee en vivo en cada carga (no se guarda)' }
  if (!input || input.calendars.length === 0) {
    return { ...base, vigilancia: 'sin-vigilancia', veredicto: 'Sin conectar', detalle: null, limite: 'No hay ningún feed configurado.' }
  }
  const rotos = input.calendars.filter((c) => c.error)
  if (rotos.length > 0) {
    return {
      ...base,
      vigilancia: 'caido',
      veredicto: rotos.length === input.calendars.length ? 'Todos rotos' : `${rotos.length} roto${rotos.length > 1 ? 's' : ''}`,
      detalle: rotos.map((c) => `${c.label ?? c.id}: ${String(c.error).slice(0, 60)}`).join(' · '),
      // La trampa real: no es que no veas nada, es que ves lo de antes.
      limite: 'Un feed roto devuelve la copia vieja, así que la agenda se ve normal con datos vencidos.',
    }
  }
  return {
    ...base,
    vigilancia: 'ok',
    veredicto: `${input.calendars.length} al día`,
    detalle: input.fetchedAt ? `leído ${haceCuanto(input.fetchedAt, nowMs)}` : null,
    limite: null,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CORREO
// ─────────────────────────────────────────────────────────────────────────────

/** Sobre este umbral el correo se considera desactualizado. */
export const CORREO_VIEJO_DIAS = 3

/**
 * El estado del correo de trabajo. PURA.
 *
 * El hecho que hoy NO se le dice en ningún lado: **no hay cron de correo**. El sync
 * es un botón en `/yo`. Si él no lo aprieta, no entra nada — y la pantalla que lo
 * muestra solo dice una fecha, sin decir que esa fecha no se va a mover sola.
 */
export function estadoCorreo(lastSyncedAt: string | null | undefined, conectado: boolean, nowMs: number): FuenteEstado {
  const base = { clave: 'correo', nombre: 'Correo de trabajo', grupo: 'correo' as const, comoEntra: 'MANUAL — solo entra si aprietas el botón en /yo' }
  if (!conectado) {
    return { ...base, vigilancia: 'sin-vigilancia', veredicto: 'Sin conectar', detalle: null, limite: 'No hay cuenta conectada.' }
  }
  const d = diasDesde(lastSyncedAt, nowMs)
  if (d === null) {
    return { ...base, vigilancia: 'atencion', veredicto: 'Nunca sincronizó', detalle: null, limite: 'No hay cron: esto no se actualiza solo.' }
  }
  return {
    ...base,
    vigilancia: d > CORREO_VIEJO_DIAS ? 'atencion' : 'ok',
    veredicto: d > CORREO_VIEJO_DIAS ? 'Desactualizado' : 'Al día',
    detalle: `sincronizado ${haceCuanto(lastSyncedAt, nowMs)}`,
    limite: 'No hay cron: esto no se actualiza solo.',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SALUD (Apple Health)
// ─────────────────────────────────────────────────────────────────────────────

export const SALUD_VIEJO_DIAS = 3

/**
 * El estado de la ingesta de Apple Health. PURA.
 *
 * ═══ EL LÍMITE ES EL DATO IMPORTANTE ═══
 * Acá no hay latido. Con solo la fecha del último dato **no se puede distinguir "no
 * me pesé" de "la automatización de Health Auto Export se rompió"** — es la misma
 * ambigüedad que el latido ya resolvió para WhatsApp y que sigue abierta acá.
 * `MissingDataCard` responde lo primero; nadie responde lo segundo. Decirlo es lo
 * único honesto mientras no exista el latido.
 */
export function estadoSalud(ultimoDatoAt: string | null | undefined, nowMs: number): FuenteEstado {
  const base = {
    clave: 'salud', nombre: 'Apple Health', grupo: 'salud' as const,
    comoEntra: 'automatización de Health Auto Export (iPhone) + capturas por Telegram',
    limite: 'Sin latido: no se puede distinguir "no subiste nada" de "la automatización se rompió".',
  }
  const d = diasDesde(ultimoDatoAt, nowMs)
  if (d === null) return { ...base, vigilancia: 'sin-vigilancia', veredicto: 'Nunca trajo', detalle: null }
  return {
    ...base,
    vigilancia: d > SALUD_VIEJO_DIAS ? 'atencion' : 'ok',
    veredicto: d > SALUD_VIEJO_DIAS ? 'Sin datos nuevos' : 'Al día',
    detalle: `último dato ${haceCuanto(ultimoDatoAt, nowMs)}`,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MENSAJERÍA SIN INSTRUMENTAR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fuentes de las que NO se guarda ninguna señal de vida. PURA.
 *
 * Telegram y el webhook de WhatsApp Cloud reciben datos y **no sellan nada** en
 * ninguna tabla, así que no hay de dónde sacar un veredicto. Aparecen igual, dichas
 * como lo que son. Si se omitieran, la pantalla daría a entender que están sanas —
 * y esa es justo la conclusión que no se puede sacar de una vista que no las alcanza.
 */
export function fuentesSinInstrumentar(): FuenteEstado[] {
  return [
    {
      clave: 'telegram', nombre: 'Telegram', grupo: 'mensajeria',
      vigilancia: 'sin-vigilancia', veredicto: 'Sin vigilancia', detalle: null,
      limite: 'No se registra la hora del último mensaje recibido: no hay dato del que partir.',
      comoEntra: 'webhook — mensajes y fotos que le mandas al bot',
    },
    {
      clave: 'whatsapp_cloud', nombre: 'WhatsApp Cloud API', grupo: 'mensajeria',
      vigilancia: 'sin-vigilancia', veredicto: 'Sin vigilancia', detalle: null,
      limite: 'Canal distinto del reader. Inerte sin sus variables de entorno, y tampoco sella nada.',
      comoEntra: 'webhook al número del bot',
    },
  ]
}

// ─────────────────────────────────────────────────────────────────────────────
// MOTORES (crons)
// ─────────────────────────────────────────────────────────────────────────────

export interface MotoresInput {
  atrasados: ReadonlyArray<{ etiqueta: string; dias: number }>
  noVerificables: ReadonlyArray<{ etiqueta: string }>
  /** Cuántos crons hay en total y cuántos se vigilan de verdad. */
  totalCrons: number
  vigilados: number
}

/**
 * El estado de los trabajos de fondo. PURA.
 *
 * El cálculo ya existía en `lib/cron/salud.ts`, testeado, y su ÚNICO consumidor era
 * una línea del brief de Telegram a las 6 am. Acá se cablea a la pantalla.
 *
 * El `limite` dice cuántos crons se vigilan de verdad: hoy 2 de 13. Sin eso, ver
 * "todo al día" haría creer que los 13 están sanos.
 */
export function estadoMotores(input: MotoresInput, nowMs: number): FuenteEstado {
  void nowMs
  const base = {
    clave: 'motores', nombre: 'Motores de fondo', grupo: 'motores' as const,
    comoEntra: 'crons programados en Vercel',
    limite: `Solo ${input.vigilados} de ${input.totalCrons} se pueden vigilar: los demás tienen días en que legítimamente no producen nada, así que su silencio no prueba una falla.`,
  }
  if (input.atrasados.length > 0) {
    return {
      ...base,
      vigilancia: 'caido',
      veredicto: `${input.atrasados.length} mudo${input.atrasados.length > 1 ? 's' : ''}`,
      detalle: input.atrasados
        .map((a) => `${a.etiqueta} ${a.dias === Infinity ? 'nunca dejó rastro' : `lleva ${a.dias} días sin correr`}`)
        .join(' · '),
    }
  }
  if (input.noVerificables.length > 0) {
    return {
      ...base,
      vigilancia: 'sin-vigilancia',
      veredicto: 'No verificable',
      detalle: `no se pudo mirar: ${input.noVerificables.map((n) => n.etiqueta).join(', ')}`,
    }
  }
  return { ...base, vigilancia: 'ok', veredicto: 'Al día', detalle: `${input.vigilados} vigilados, sin atrasos` }
}

// ─────────────────────────────────────────────────────────────────────────────
// EL RESUMEN
// ─────────────────────────────────────────────────────────────────────────────

const ORDEN: Record<Vigilancia, number> = { caido: 0, atencion: 1, 'sin-vigilancia': 2, ok: 3 }

/** Ordena por gravedad: lo roto primero, lo sano al final. PURA. */
export function ordenarFuentes(fuentes: readonly FuenteEstado[]): FuenteEstado[] {
  return [...fuentes].sort((a, b) => ORDEN[a.vigilancia] - ORDEN[b.vigilancia] || a.nombre.localeCompare(b.nombre))
}

export interface ResumenFuentes {
  caidas: number
  atencion: number
  sinVigilancia: number
  ok: number
  /** La frase de una línea. Nunca dice "todo bien" si hay algo que no se puede ver. */
  titular: string
}

/**
 * El titular de la pantalla. PURA.
 *
 * NUNCA dice "todo bien" a secas mientras haya fuentes sin vigilancia: eso sería
 * concluir desde una vista parcial, que es la regla dura de este repo. Con todo sano
 * pero 3 ciegas, el titular lo dice.
 */
export function resumirFuentes(fuentes: readonly FuenteEstado[]): ResumenFuentes {
  const caidas = fuentes.filter((f) => f.vigilancia === 'caido').length
  const atencion = fuentes.filter((f) => f.vigilancia === 'atencion').length
  const sinVigilancia = fuentes.filter((f) => f.vigilancia === 'sin-vigilancia').length
  const ok = fuentes.filter((f) => f.vigilancia === 'ok').length

  const partes: string[] = []
  if (caidas > 0) partes.push(`${caidas} caída${caidas > 1 ? 's' : ''}`)
  if (atencion > 0) partes.push(`${atencion} para mirar`)
  if (ok > 0) partes.push(`${ok} andando`)

  let titular: string
  if (fuentes.length === 0) titular = 'No hay ninguna fuente configurada.'
  else if (partes.length === 0) titular = `Ninguna de las ${sinVigilancia} fuentes se puede vigilar.`
  else titular = partes.join(' · ')

  if (sinVigilancia > 0 && fuentes.length > 0 && partes.length > 0) {
    titular += ` · ${sinVigilancia} que no se pueden vigilar`
  }
  return { caidas, atencion, sinVigilancia, ok, titular }
}
