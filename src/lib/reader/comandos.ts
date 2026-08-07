// SIR V2 — Protocolo de comandos servidor → extensión, por el latido.
//
// ═══ POR QUÉ EL LATIDO Y NO UN ENDPOINT NUEVO ════════════════════════════════
//
// Aaron pidió (30-jul-2026) poder *"manejar remotamente"* la extensión de la otra PC.
// La auditoría encontró que la vía de vuelta **ya existía y se tiraba**: la extensión
// postea a `/api/reader/heartbeat` cada 10 min con una alarma que sobrevive a
// reinicios del navegador, y `background.js` hacía `await fetch(...)` descartando la
// respuesta. Un canal servidor→extensión abierto cada 10 minutos, y nadie hablando.
//
// Así que los comandos viajan en la RESPUESTA del latido: cero permisos nuevos, cero
// timers nuevos, cero requests extra.
//
// ═══ EL LATIDO ADEMÁS EMPIEZA A DECIR ALGO ═══════════════════════════════════
//
// Hasta hoy mandaba `detail: '1 pestaña(s)'` — contaba PESTAÑAS, no si el lector
// producía. Por eso el reader de WhatsApp pudo estar caído del 26 al 30 de julio con
// el latido diciendo `ok`: la pestaña estaba abierta, el lector no leía, y las dos
// cosas se veían idénticas desde el servidor. `probe` es la señal que las separa.
//
// PURO: cero red, cero DB. Todo lo que valida y decide vive acá y se testea.

/** Canales que aceptan comandos. Mismo set que el latido (mig 0175). */
export const CANALES = ['whatsapp', 'instagram', 'linkedin', 'teams', 'outlook'] as const
export type Canal = (typeof CANALES)[number]

export type ComandoKind = 'resync' | 'probe'

export interface Comando {
  id: string
  kind: ComandoKind
  params: { dias?: number; chat?: string }
}

/**
 * Techo de días del `resync`.
 *
 * El backfill de `waStoreReader.js` está fijo en 30 días y corre UNA sola vez por
 * carga de página, y ese es el motivo real de que el historial viejo de un chat no
 * esté: no es que el lector falle, es que nunca se le pidió más. El comando lo hace
 * un parámetro.
 *
 * El techo existe porque `WPP.chat.getMessages` lee el Store LOCAL (no la red) solo
 * hasta donde WhatsApp haya sincronizado en ese dispositivo; pedir 5 años no trae 5
 * años, y encima alarga el barrido sobre 300 chats. 400 días cubre "todo lo que este
 * navegador tiene" sin prometer lo que no puede dar.
 */
export const MAX_DIAS = 400
export const DIAS_POR_DEFECTO = 30
/** Cuántos comandos se entregan por latido. Uno: el resync es caro y no se apilan. */
export const MAX_POR_LATIDO = 1

/** Lo que la extensión reporta en el latido siguiente. */
export interface ResultadoComando {
  id: string
  ok: boolean
  /** Conteos si salió bien, el error si no. Se recorta al guardar. */
  detalle?: string | null
}

/** Diagnóstico del lector. Shape libre por canal; en WhatsApp lo llena wa-js. */
export interface Probe {
  /** ¿La librería del Store cargó? En WhatsApp: `typeof window.WPP`. */
  lib?: string | null
  /** ¿El Store está listo para leer? */
  ready?: boolean | null
  /** Cuántos chats/hilos ve el lector ahora mismo. */
  chats?: number | null
  /** Versión de la librería, si la expone. */
  libVersion?: string | null
  /** Cualquier error que el lector quiera reportar. */
  error?: string | null
  /**
   * Por qué CAMINO logra leer mensajes ('getMessages' | 'chat.msgs.*' | 'ninguno').
   *
   * Existe por un fallo real: el 30-jul-2026 `WPP.chat.list()` funcionaba (1123
   * chats) y `WPP.chat.getMessages()` estaba roto contra la versión de WhatsApp del
   * día — el reader recorría 196 chats y mandaba **0 mensajes**, y desde el servidor
   * se veía todo sano. Este campo es el que delata que la API se movió.
   */
  lee?: string | null
  /** Cuántos mensajes trajo la prueba de lectura. 0 con `lee` seteado = API movida. */
  leeCuantos?: number | null

  // ── LECTORES PASIVOS (Instagram / LinkedIn) ────────────────────────────────
  //
  // No hacen backfill: interceptan lo que pasa cuando Aaron navega. Así que su
  // diagnóstico NO puede ser "cuántos chats veo" sino "¿estoy enganchado, vive la
  // sesión, y hace cuánto capturé algo?". Con esos tres, las tres causas de "no
  // trae nada" se separan — que es la pregunta que Aaron hizo el 4-ago y que el
  // sistema no podía responder.
  /** Identifica la FORMA del probe. 'instagram-pasivo' hoy. */
  reader?: string | null
  /** ¿Están puestos los hooks de fetch/XHR? false = el lector se rompió. */
  hooked?: boolean | null
  /** ¿Vive la sesión del sitio? null = no se pudo saber, nunca "sí". */
  loggedIn?: boolean | null
  /** Capturas emitidas desde que cargó el lector. */
  vistos?: number | null
  /** Minutos desde que cargó el lector (para no alarmar por "0 en 2 min"). */
  desdeMin?: number | null
  /** Minutos desde la última captura. null = ninguna todavía. */
  haceMin?: number | null
}

/** ¿Este probe viene de un lector PASIVO? PURA. */
function esPasivo(p: Probe): boolean {
  return p.hooked !== undefined && p.hooked !== null
}

const esEntero = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && Math.floor(v) === v

/**
 * Valida y normaliza un comando ANTES de guardarlo. PURA.
 *
 * Devuelve null ante cualquier cosa que no reconozca. `kind` es un set cerrado a
 * propósito: un comando de texto libre ejecutándose en el navegador de Aaron es una
 * superficie que no quiero abrir por comodidad.
 */
export function normalizarComando(entrada: unknown): { kind: ComandoKind; params: Comando['params'] } | null {
  if (!entrada || typeof entrada !== 'object') return null
  const o = entrada as Record<string, unknown>
  const kind = o.kind
  if (kind !== 'resync' && kind !== 'probe') return null
  if (kind === 'probe') return { kind, params: {} }

  const params: Comando['params'] = {}
  const dias = o.dias ?? (o.params as Record<string, unknown> | undefined)?.dias
  if (esEntero(dias)) params.dias = Math.min(MAX_DIAS, Math.max(1, dias))
  else params.dias = DIAS_POR_DEFECTO
  const chat = o.chat ?? (o.params as Record<string, unknown> | undefined)?.chat
  if (typeof chat === 'string' && chat.trim()) params.chat = chat.trim().slice(0, 120)
  return { kind, params }
}

/** ¿Es un canal válido? PURA. */
export function esCanal(v: unknown): v is Canal {
  return typeof v === 'string' && (CANALES as readonly string[]).includes(v)
}

/**
 * Qué se le entrega a la extensión en esta respuesta de latido. PURA.
 *
 * Uno solo por latido: el resync barre hasta 300 chats con 400 ms entre cada uno, así
 * que dos en paralelo se pisarían. Con 10 minutos entre latidos, una cola se drena
 * sola sin necesidad de concurrencia.
 */
export function elegirParaEntregar(pendientes: Comando[]): Comando[] {
  return (pendientes ?? []).filter((c) => c && c.id && c.kind).slice(0, MAX_POR_LATIDO)
}

/**
 * Normaliza el `probe` que reporta la extensión. PURA.
 *
 * Se recorta y se tipa porque entra desde el navegador: lo que llega es texto de un
 * cliente, no un contrato garantizado.
 */
export function normalizarProbe(entrada: unknown): Probe | null {
  if (!entrada || typeof entrada !== 'object') return null
  const o = entrada as Record<string, unknown>
  const p: Probe = {}
  if (typeof o.lib === 'string') p.lib = o.lib.slice(0, 40)
  if (typeof o.ready === 'boolean') p.ready = o.ready
  if (esEntero(o.chats) && o.chats >= 0) p.chats = Math.min(100_000, o.chats)
  if (typeof o.libVersion === 'string') p.libVersion = o.libVersion.slice(0, 40)
  if (typeof o.error === 'string' && o.error) p.error = o.error.slice(0, 300)
  if (typeof o.lee === 'string') p.lee = o.lee.slice(0, 40)
  if (esEntero(o.leeCuantos) && o.leeCuantos >= 0) p.leeCuantos = Math.min(100_000, o.leeCuantos)
  return Object.keys(p).length > 0 ? p : null
}

/**
 * ¿El lector está VIVO de verdad, según su propio diagnóstico? PURA.
 *
 * Esta es la función que cierra el hueco de los 4 días: "pestaña abierta" ya no
 * alcanza. Devuelve null cuando no hay probe — y **null no es "sano"**: es "no sé",
 * y el llamador tiene que tratarlo como tal (la misma regla de honestidad de
 * cobertura del repo, aplicada a un diagnóstico).
 */
export function lectorVivo(probe: Probe | null | undefined): boolean | null {
  if (!probe) return null
  if (probe.error) return false
  // ── LECTOR PASIVO ──────────────────────────────────────────────────────────
  // Va ANTES de las ramas de wa-js: sus campos (`lib`, `ready`, `chats`) no existen
  // acá, y sin esta rama un probe pasivo perfectamente sano caía al `return null`
  // final — o sea "no reporta diagnóstico", con el diagnóstico en la mano.
  //
  // "Vivo" para un interceptor NO es "capturó algo": es estar enganchado con la
  // sesión viva. Que no haya capturado nada puede ser, simplemente, que Aaron no
  // abrió Instagram — y confundir eso con una falla es lo que volvía inútil el aviso.
  if (esPasivo(probe)) {
    if (probe.hooked !== true) return false
    if (probe.loggedIn === false) return false
    return true
  }
  // NO PUEDE LEER MENSAJES = no está vivo, aunque liste chats y diga ready.
  // Es el caso exacto del 30-jul: 196 chats recorridos, 0 mensajes enviados, y todo
  // lo demás en verde. Ver el comentario de `Probe.lee`.
  if (probe.lee === 'ninguno') return false
  // La librería no cargó: el lector no puede leer nada, esté la pestaña como esté.
  if (probe.lib !== undefined && probe.lib !== null && probe.lib !== 'object') return false
  if (probe.ready === false) return false
  // Cargó, está lista y ve 0 chats: eso no es "vivo", es el race que ya se arregló
  // una vez (#782, "el backfill veía 0 chats").
  if (probe.chats !== undefined && probe.chats !== null && probe.chats === 0) return false
  if (probe.ready === true || (probe.chats ?? 0) > 0) return true
  return null
}

/** Línea corta del estado del lector, para el brief o la UI. PURA. */
export function probeLine(canal: string, probe: Probe | null | undefined): string | null {
  const vivo = lectorVivo(probe)
  if (vivo === null) return `${canal}: no reporta diagnóstico — no sé si está leyendo.`

  // ── LECTOR PASIVO: la línea tiene que separar las TRES causas ──────────────
  // Es la respuesta a *"entonces no entiendo si sirve o no sirve, qué hacemos"*.
  if (probe && esPasivo(probe)) {
    if (probe.hooked !== true) {
      return `${canal}: el lector NO está enganchado — se rompió la interceptación, hay que recargar la pestaña en esa PC.`
    }
    if (probe.loggedIn === false) {
      return `${canal}: enganchado, pero la sesión se cayó — hay que volver a iniciar sesión en esa PC.`
    }
    const n = probe.vistos ?? 0
    if (n > 0) {
      const cuando = probe.haceMin != null ? `, la última hace ${probe.haceMin} min` : ''
      return `${canal}: leyendo (${n} captura${n === 1 ? '' : 's'}${cuando}).`
    }
    // Enganchado, sesión viva y CERO capturas: no es una falla, es que no lo abrió.
    const desde = probe.desdeMin != null ? ` desde que arrancó (hace ${probe.desdeMin} min)` : ''
    return `${canal}: el lector está bien, pero no has abierto ${canal}${desde} — por eso no trae nada. No es una falla.`
  }

  if (vivo) return `${canal}: leyendo${probe?.chats != null ? ` (${probe.chats} chats a la vista)` : ''}.`
  const por = probe?.error
    ? probe.error
    : probe?.lib && probe.lib !== 'object'
      ? 'la librería del Store no cargó'
      : probe?.chats === 0
        ? 've 0 chats'
        : 'el Store no está listo'
  return `${canal}: la pestaña está abierta pero el lector NO está leyendo — ${por}.`
}
