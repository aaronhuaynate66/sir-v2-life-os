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
