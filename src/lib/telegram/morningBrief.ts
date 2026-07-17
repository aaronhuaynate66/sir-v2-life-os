// SIR V2 — Brief de la mañana, formateado para el CHAT (Telegram). PURO.
//
// Reusa el contenido determinístico de buildMorningPush (push/morning.ts) pero lo
// presenta como un mensaje conversacional cálido, no como una notificación seca.
// Texto plano (Telegram muestra el markdown crudo). Filtro rector: breve, sin
// volcar — el detalle vive en /panel y en preguntarle al bot.

export interface BriefSource {
  title: string
  body: string
}

export function formatMorningBriefForChat(push: BriefSource): string {
  const body = (push.body || '').trim()
  const lines: string[] = ['🌿 Buen día.']
  if (body) lines.push(body)
  lines.push('Si quieres que profundice en algo (tu gente, tus objetivos, tu día), escríbeme 💬')
  return lines.join('\n\n')
}
