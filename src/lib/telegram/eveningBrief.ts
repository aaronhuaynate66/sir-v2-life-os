// SIR V2 — Cierre del día por CHAT (Telegram). PURO.
//
// A diferencia del brief matutino (orientado a lo que viene), el de la tarde es
// un cierre gentil que INVITA a reflexionar y a DICTAR NOTAS — sinergia directa
// con la captura de notas por chat (executeAction). Texto plano, breve, sin
// presión. Opcionalmente incluye la línea de hábitos pendientes del día.

/**
 * Con qué empieza SIEMPRE el cierre del día.
 *
 * No es decoración: es la HUELLA por la que el vigilante de crons sabe que
 * `evening-push` corrió. El brief se manda sin condiciones una vez que la flag
 * está activa (a diferencia de la toma o los hábitos, que dependen de que haya
 * algo pendiente), así que su ausencia en un día es prueba de que el cron no
 * ejecutó. Ver `lib/cron/evidencia`.
 *
 * Está exportado —y hay un test que lo ata a esta función— porque si alguien
 * cambia el copy y el vigilante sigue buscando el emoji viejo, el vigilante
 * empieza a gritar "nunca corrió" sobre un canal sano. Una falsa alarma acá
 * destruye la confianza en el vigilante.
 */
export const EVENING_BRIEF_MARK = '🌙'

export function formatEveningBriefForChat(pendingHabitsLine?: string): string {
  const lines: string[] = [`${EVENING_BRIEF_MARK} ¿Cómo estuvo tu día?`]
  const h = (pendingHabitsLine || '').trim()
  if (h) lines.push(h)
  lines.push(
    'Si hablaste con alguien que valga registrar, o pasó algo que quieras que recuerde, dictámelo (texto o audio) y lo anoto. Si no, descansa 💙',
  )
  return lines.join('\n\n')
}
