// SIR V2 — Prompt de síntesis narrativa "Lo personal" (#8 del detail page).
//
// Genera 3 párrafos observacionales sobre el vínculo con una persona a
// partir de los resúmenes de conversaciones WhatsApp curadas. NO usa los
// mensajes crudos (privacidad + economía de tokens): trabaja sobre los
// summaries + topics + estados emocionales que el extractor ya produjo.
//
// INVARIANTES (principios fundacionales del sistema):
//   - #1 bienestar, no engagement: tono respetuoso, sin dramatizar.
//   - #5 sin decisiones sensibles: NADA de diagnóstico clínico, etiquetas
//     patologizantes ni consejo médico/psicológico.
//   - No inventar: solo lo observable en la data provista. Si hay poca,
//     decirlo y ser breve.

export const SYNTHESIS_SYSTEM_PROMPT = `Eres el módulo de síntesis relacional de SIR, un sistema operativo personal.

Tu tarea: escribir un retrato narrativo breve del vínculo entre el usuario y una persona, a partir de resúmenes de conversaciones ya procesadas.

ESTRUCTURA — exactamente 3 párrafos cortos (2-4 oraciones cada uno), en español neutro:
1. La dinámica general del vínculo y el tono emocional predominante.
2. Los temas recurrentes y patrones que aparecen en las conversaciones.
3. Cómo se manifiesta la conexión (cercanía, reciprocidad observable, cuidado mutuo o fricciones).

REGLAS ESTRICTAS:
- Observacional, NO diagnóstico. Describí lo que se ve, no etiquetes a nadie.
- PROHIBIDO: diagnósticos clínicos, etiquetas de salud mental, consejo médico o psicológico, predicciones sobre la relación.
- No inventes hechos, nombres, fechas ni eventos que no estén en la data.
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
}

/** Construye el mensaje de usuario (la data) para el modelo. */
export function buildSynthesisInput(
  personName: string,
  convs: SynthesisConversation[],
): string {
  const lines: string[] = [
    `Persona: ${personName}`,
    `Conversaciones disponibles: ${convs.length}`,
    '',
    'Resúmenes (de más reciente a más antigua):',
  ]
  convs.forEach((c, i) => {
    const date = c.observedAt.slice(0, 10)
    const emo: string[] = []
    if (c.emotionalUser) emo.push(`usuario: ${c.emotionalUser}`)
    if (c.emotionalOther) emo.push(`${personName}: ${c.emotionalOther}`)
    lines.push(
      `${i + 1}. [${date}] ${c.summary ?? '(sin resumen)'}` +
        (c.topics.length ? ` | temas: ${c.topics.join(', ')}` : '') +
        (emo.length ? ` | estados: ${emo.join('; ')}` : ''),
    )
  })
  lines.push('', 'Escribí los 3 párrafos.')
  return lines.join('\n')
}
