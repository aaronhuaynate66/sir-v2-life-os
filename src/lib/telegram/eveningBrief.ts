// SIR V2 — Cierre del día por CHAT (Telegram). PURO.
//
// A diferencia del brief matutino (orientado a lo que viene), el de la tarde es
// un cierre gentil que INVITA a reflexionar y a DICTAR NOTAS — sinergia directa
// con la captura de notas por chat (executeAction). Texto plano, breve, sin
// presión. Opcionalmente incluye la línea de hábitos pendientes del día.

export function formatEveningBriefForChat(pendingHabitsLine?: string): string {
  const lines: string[] = ['🌙 ¿Cómo estuvo tu día?']
  const h = (pendingHabitsLine || '').trim()
  if (h) lines.push(h)
  lines.push(
    'Si hablaste con alguien que valga registrar, o pasó algo que quieras que recuerde, dictámelo (texto o audio) y lo anoto. Si no, descansá 💙',
  )
  return lines.join('\n\n')
}
