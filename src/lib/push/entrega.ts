// SIR V2 — ¿Se ENTREGÓ el aviso? PURO.
//
// ═══ POR QUÉ EXISTE ═══════════════════════════════════════════════════════════
//
// `reminders-due` marcaba `notified_at` SIEMPRE, sin mirar si algún canal había
// entregado. El comentario decía *"marcar como notificado inmediatamente para no
// re-disparar aunque el push falle"* — la intención era no repetir, pero el efecto
// es que **un aviso que no llegó se cierra para siempre**. Y encima:
//   - `pushToUser` DEVUELVE `{ sent, failed, disabled }` y se lo llamaba con `void`,
//     tirando la respuesta.
//   - el envío de Telegram estaba en un `catch {}` que se comía el error.
//
// O sea: nadie sabía si Aaron había sido avisado, y el sistema afirmaba que sí.
//
// El caso concreto, medido el 1-ago-2026: su examen médico del IPD del 7-ago 8:10
// (con ayuno de 8 h, Anexo 2 impreso y formulario psicológico previo) tiene su
// recordatorio para el 4-ago. Su ÚNICA suscripción de Web Push es de Apple y es
// del 13-jun — esas caducan. Si esa falla y el envío de Telegram tropieza, el
// recordatorio quedaba marcado como avisado y **el examen se pasaba en silencio**.
//
// La regla: `notified_at` significa "se le dijo", no "se intentó decirle". Si
// ningún canal entregó, se deja abierto y el cron reintenta mañana. Reintentar es
// molesto; perder el examen que habilita el Mundial, no tiene arreglo.
//
// PURO: cero red. Solo decide, con lo que los canales reportaron.

/** Lo que reportó un canal de entrega. */
export interface Entrega {
  /** 'web-push' | 'telegram' | … — para el log. */
  canal: string
  entregado: boolean
  /** Por qué falló, si falló. */
  detalle?: string
}

/**
 * ¿Algún canal entregó? PURA.
 *
 * Basta UNO: si Telegram llegó, da igual que la suscripción de Safari esté muerta.
 */
export function huboEntrega(entregas: readonly Entrega[]): boolean {
  return (entregas ?? []).some((e) => e?.entregado === true)
}

/**
 * Resumen de fallas para el log. null si todo entregó. PURA.
 *
 * Incluye los canales que SÍ entregaron cuando hubo fallas mezcladas: saber que
 * Telegram salvó el aviso mientras el Web Push se muere es la información que
 * hace falta para decidir si vale arreglar el Web Push.
 */
export function resumenDeEntrega(entregas: readonly Entrega[]): string | null {
  const lista = entregas ?? []
  const fallaron = lista.filter((e) => e && !e.entregado)
  if (fallaron.length === 0) return null
  const ok = lista.filter((e) => e?.entregado).map((e) => e.canal)
  const malos = fallaron.map((e) => `${e.canal}${e.detalle ? ` (${e.detalle.slice(0, 80)})` : ''}`)
  const cola = ok.length > 0 ? ` — entregó por ${ok.join(', ')}` : ' — NO se entregó por ningún canal'
  return `falló ${malos.join(', ')}${cola}`
}

/**
 * ¿Se puede cerrar el recordatorio? PURA.
 *
 * Cerrar sin haber entregado es lo que hacía perder avisos, así que esto es
 * simplemente `huboEntrega` con nombre propio — existe para que en el sitio de la
 * llamada se lea la INTENCIÓN, no la mecánica.
 */
export function puedeMarcarseAvisado(entregas: readonly Entrega[]): boolean {
  return huboEntrega(entregas)
}
