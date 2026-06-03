// SIR V2 — Prompt de síntesis narrativa "Lo personal" (#8 del detail page).
//
// Genera un retrato narrativo del vínculo a partir de los resúmenes de
// conversaciones WhatsApp curadas. NO usa los mensajes crudos (privacidad +
// economía de tokens): trabaja sobre los summaries + topics + estados
// emocionales + hechos que el extractor ya produjo.
//
// MEJORAS (caso Dayana, 03/06/2026):
//   - PESO POR RECENCIA: cada conversación llega partida en "estado reciente"
//     vs "contexto histórico". El retrato debe LIDERAR con el estado actual y
//     tratar lo viejo como contexto — no anclarse en una dinámica que ya pasó.
//   - CONCIENCIA DEL OBJETIVO: si la persona está vinculada a objetivos del
//     usuario, el retrato refleja —de forma observacional— cómo está hoy el
//     vínculo respecto de eso (interés, momentum, próximos pasos), sin inventar.
//
// INVARIANTES (principios fundacionales del sistema):
//   - #1 bienestar, no engagement: tono respetuoso, sin dramatizar.
//   - #5 sin decisiones sensibles: NADA de diagnóstico clínico, etiquetas
//     patologizantes ni consejo médico/psicológico.
//   - No inventar: solo lo observable en la data provista. Si hay poca,
//     decirlo y ser breve.

export const SYNTHESIS_SYSTEM_PROMPT = `Eres el módulo de síntesis relacional de SIR, un sistema operativo personal.

Tu tarea: escribir un retrato narrativo breve del vínculo entre el usuario y una persona, a partir de resúmenes de conversaciones ya procesadas. Las conversaciones vienen ordenadas de MÁS RECIENTE a más antigua, y cada una distingue su "estado reciente" del "contexto histórico". Opcionalmente recibís los OBJETIVOS del usuario vinculados a esta persona.

ESTRUCTURA — exactamente 3 párrafos cortos (2-4 oraciones cada uno), en español neutro:
1. La dinámica ACTUAL del vínculo y el tono emocional predominante HOY (basate en lo más reciente; lo viejo es solo contexto).
2. Los temas recurrentes y patrones, distinguiendo lo que sigue vigente de lo que quedó atrás.
3. Cómo se manifiesta hoy la conexión (cercanía, reciprocidad, cuidado mutuo o fricciones) y —si hay un objetivo vinculado— cómo está el vínculo respecto de eso (interés, momentum, un próximo paso natural), siempre de forma observacional.

REGLAS ESTRICTAS:
- LIDERÁ con lo reciente. Un dato viejo (ej. un rol de hace años) NO debe dominar el retrato ni presentarse como si fuera el estado actual.
- Observacional, NO diagnóstico. Describí lo que se ve, no etiquetes a nadie.
- PROHIBIDO: diagnósticos clínicos, etiquetas de salud mental, consejo médico o psicológico, predicciones sobre la relación.
- No inventes hechos, nombres, fechas ni eventos que no estén en la data. Si hay un objetivo pero las conversaciones no lo tocan, no fabriques señales: decí honestamente que el vínculo no muestra todavía movimiento sobre eso.
- Si la data es escasa, decilo con honestidad y escribí menos (los 3 párrafos pueden ser de 1-2 oraciones).
- Tono cálido y respetuoso, nunca dramático ni alarmista.

FORMATO DE SALIDA:
- SOLO los 3 párrafos en texto plano.
- Separá cada párrafo con una línea en blanco.
- Sin títulos, sin markdown, sin viñetas, sin comillas envolventes.`

export interface SynthesisConversation {
  /** ISO de cuándo pasó la conversación. */
  observedAt: string
  summary: string | null
  topics: string[]
  emotionalUser: string | null
  emotionalOther: string | null
  /** Resúmenes de los bloques MÁS RECIENTES (estado actual). */
  recentBlocks?: string[]
  /** Resúmenes de bloques viejos (contexto). */
  historicalBlocks?: string[]
  /** Hechos notables sobre la persona mencionados en la charla. */
  facts?: string[]
  /** Rango de fechas de la conversación (ISO date-only). */
  firstISO?: string | null
  lastISO?: string | null
  /** Cantidad de mensajes (señala el peso de la conversación). */
  messageCount?: number
}

function joinBlocks(blocks: string[] | undefined, cap: number): string | null {
  if (!blocks || blocks.length === 0) return null
  return blocks.slice(0, cap).join(' ')
}

/** Construye el mensaje de usuario (la data) para el modelo. */
export function buildSynthesisInput(
  personName: string,
  convs: SynthesisConversation[],
  goalContext?: string | null,
): string {
  const lines: string[] = [`Persona: ${personName}`, `Conversaciones disponibles: ${convs.length}`]

  if (goalContext) {
    lines.push(
      '',
      'OBJETIVOS DEL USUARIO VINCULADOS A ESTA PERSONA (reflejá el estado del vínculo respecto de esto, sin inventar señales):',
      goalContext,
    )
  }

  lines.push('', 'Conversaciones (de más reciente a más antigua):')
  convs.forEach((c, i) => {
    const span =
      c.firstISO && c.lastISO ? `${c.firstISO.slice(0, 10)} → ${c.lastISO.slice(0, 10)}` : c.observedAt.slice(0, 10)
    const weight = c.messageCount && c.messageCount > 0 ? ` · ${c.messageCount} mensajes` : ''
    lines.push(`\n${i + 1}. [${span}${weight}]`)

    const recent = joinBlocks(c.recentBlocks, 6) ?? c.summary
    if (recent) lines.push(`   estado reciente: ${recent}`)
    const historical = joinBlocks(c.historicalBlocks, 6)
    if (historical) lines.push(`   contexto histórico (no anclar acá): ${historical}`)
    if (c.facts && c.facts.length > 0) lines.push(`   hechos: ${c.facts.slice(0, 10).join('; ')}`)
    if (c.topics.length > 0) lines.push(`   temas: ${c.topics.join(', ')}`)
    const emo: string[] = []
    if (c.emotionalUser) emo.push(`usuario: ${c.emotionalUser}`)
    if (c.emotionalOther) emo.push(`${personName}: ${c.emotionalOther}`)
    if (emo.length) lines.push(`   estados: ${emo.join('; ')}`)
  })

  lines.push('', 'Escribí los 3 párrafos.')
  return lines.join('\n')
}
