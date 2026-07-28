// SIR V2 — Etapa 2 del detector de oportunidades: el JUEZ.
//
// El lexicón de `detect.ts` es de alto recall y baja precisión a propósito (ver
// su cabecera: medido 36% contra la data real, y apretarlo lo llevó a 0%). Este
// módulo es el que decide, con un modelo barato, sobre los POCOS candidatos que
// el lexicón produjo — decenas, no cientos de miles.
//
// Lo que el lexicón no puede separar y el juez sí:
//   ✅ «firmamos contrato o cómo empezamos?»          → oportunidad real
//   ✅ «voy con la oportunidad y me interesa bastante» → oportunidad real
//   ❌ «no me puedes hacer un favor tan simple»        → su mamá, no es un lead
//   ❌ «cuando ya firmas el contrato te pagan?»        → el trabajo de ELLA
//   ❌ «avanzando mis presupuestos»                    → los presupuestos de ELLA
//
// El prompt y el parser son PUROS y testeables; la llamada al modelo la hace el
// caller (cron/route) con `lib/llm`. Sesgado a DESCARTAR: ante la duda, `false`.
// Un falso positivo en el brief entrena a Aaron a ignorarlo — que es la queja que
// originó el rediseño del brief ("así todo junto no me ayuda").

import type { OpportunitySignal } from './detect'

export interface JudgeVerdict {
  /** ¿Es una oportunidad comercial REAL para Aaron? */
  isReal: boolean
  /** Qué le están pidiendo, en pocas palabras. Solo si `isReal`. */
  what: string | null
  /** Por qué se descartó. Solo si `!isReal`. Va al log, no al brief. */
  why: string | null
}

export const JUDGE_SYSTEM = `Eres un filtro para SIR, el asistente personal de Aaron (peruano, hace marketing digital y servicios de tecnología con su empresa Marlab, y también trabaja en seguridad electrónica).

Te paso UN mensaje que alguien le escribió a Aaron por WhatsApp, más contexto del hilo. Un pre-filtro de palabras clave ya lo marcó como "posible pedido comercial", pero ese filtro se equivoca seguido.

Tu única tarea: decidir si ESA persona le está pidiendo a AARON un producto o servicio que él podría cobrar — o si podría hacerlo, o si viene de un negocio en curso con él.

Responde isReal=false cuando:
- La persona habla de SU propio trabajo, SU contrato, SUS presupuestos o SUS clientes (no le pide nada a Aaron).
- Es un favor personal, un tema familiar o de pareja.
- Es conversación, chisme o coordinación sin nada que cobrar.
- Aaron es el que pide o cotiza a la otra persona (dirección invertida: él es el comprador).
- No te alcanza para decidir.

Responde isReal=true solo si alguien le pide a Aaron algo que él podría facturar: una cotización, un presupuesto, una web, un diseño, un servicio, merch, un desarrollo; o si están cerrando/arrancando un trabajo con él ("firmamos?", "cómo empezamos?", "voy con la propuesta").

ANTE LA DUDA, isReal=false. Es mejor perder una oportunidad que llenarle el brief de ruido.

Devuelve SOLO JSON, sin markdown ni texto extra:
{"isReal":true,"what":"qué le piden, máx 8 palabras"}
o
{"isReal":false,"why":"por qué no, máx 10 palabras"}`

/** Prompt de usuario para UN candidato. PURO. */
export function buildJudgePrompt(signal: OpportunitySignal, threadContext: string[]): string {
  const ctx = threadContext.slice(-6).map((l) => `  ${l}`).join('\n')
  return [
    `PERSONA: ${signal.personName}`,
    `MENSAJE MARCADO (de ${signal.personName}, ${signal.quoteAt.slice(0, 10)}):`,
    `  «${signal.quote}»`,
    `PALABRAS QUE LO MARCARON: ${signal.matched.join(', ')}`,
    ctx ? `\nÚLTIMOS MENSAJES DEL HILO (para contexto):\n${ctx}` : '',
    `\n¿Le está pidiendo a Aaron algo que él pueda cobrar?`,
  ].filter(Boolean).join('\n')
}

/**
 * Parsea el veredicto. Conservador: cualquier cosa que no sea un `isReal:true`
 * explícito y bien formado se trata como descarte, no como error.
 */
export function parseJudgeVerdict(raw: string): JudgeVerdict {
  const txt = (raw || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  if (!txt) return { isReal: false, what: null, why: 'respuesta vacía del juez' }
  try {
    const j = JSON.parse(txt) as { isReal?: unknown; what?: unknown; why?: unknown }
    if (j.isReal === true) {
      const what = typeof j.what === 'string' && j.what.trim() ? j.what.trim().slice(0, 80) : null
      // Un "sí" sin decir QUÉ le piden no es utilizable en el brief.
      if (!what) return { isReal: false, what: null, why: 'dijo que sí pero no dijo qué piden' }
      return { isReal: true, what, why: null }
    }
    const why = typeof j.why === 'string' && j.why.trim() ? j.why.trim().slice(0, 100) : 'descartado por el juez'
    return { isReal: false, what: null, why }
  } catch {
    return { isReal: false, what: null, why: 'JSON no parseable' }
  }
}

/** Señal ya confirmada: la del lexicón + lo que el juez entendió. */
export interface ConfirmedOpportunity extends OpportunitySignal {
  what: string
}

/**
 * Reescribe el texto de la señal con lo que el juez entendió, que es mucho más
 * útil que la cita cruda. Mantiene la cita y las palabras: Aaron tiene que poder
 * verificar el dato, no confiar en el veredicto.
 */
export function renderConfirmed(signal: OpportunitySignal, what: string): ConfirmedOpportunity {
  const fecha = signal.quoteAt.slice(0, 10)
  const text = signal.kind === 'oportunidad_sin_registrar'
    ? `💼 ${signal.personName} te pidió ${what} y no está como oportunidad — «${signal.quote}» (${fecha}, hace ${signal.daysSinceQuote} día(s)). ¿La registro?`
    : `🧊 Se está enfriando con ${signal.personName}: te pidió ${what} y hace ${signal.daysSinceLast} días que no se escriben — «${signal.quote}» (${fecha}).`
  return { ...signal, what, text }
}
