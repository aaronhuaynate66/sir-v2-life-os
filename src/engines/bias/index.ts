// SIR V2 — Detector de sesgos en el lenguaje (14·M1).
//
// Base científica: ciencia de la decisión / economía conductual (ver
// `docs/14_DECISION_SCIENCE.md`). Cuando Aaron describe una decisión (o el
// objetivo de un ensayo), el sistema 1 ya decidió y racionaliza. Este motor
// marca los sesgos ACTIVOS en cómo lo describe y devuelve una PREGUNTA socrática
// no-bloqueante ("¿el pasado debería pesar acá?") para activar el sistema 2.
//
// 100% puro y determinístico (heurística de patrones ES+EN), corre client-side.
// Es una RED DE SEGURIDAD, no un veredicto: marca *posible* sesgo, nunca acusa.
// Honesto: no detectar sesgos NO significa que el razonamiento sea impecable.

export type Bias =
  | 'sunk_cost' | 'present_bias' | 'loss_aversion'
  | 'wishful_thinking' | 'confirmation' | 'planning_fallacy' | 'all_or_nothing'

export interface BiasHit {
  bias: Bias
  label: string
  /** Pregunta socrática que abre una grieta en el razonamiento. */
  question: string
  evidence: string[]
}

export interface BiasResult {
  hits: BiasHit[]
}

interface BiasDef { label: string; question: string; patterns: RegExp[] }

// Patrones SIN acentos: el texto se normaliza (minúsculas + sin diacríticos,
// preservando longitud) antes de matchear; la evidencia se corta del original.
const BIASES: Record<Bias, BiasDef> = {
  sunk_cost: {
    label: 'Costo hundido',
    question: '¿El pasado (lo ya invertido) debería pesar en lo que decidís hacia adelante?',
    patterns: [
      /\bya (invert[ií]|gast[eé]|puse|met[ií])\b/g,
      /\bdespues de todo (este tiempo|lo que|el esfuerzo)\b/g,
      /\bllevo \d+ (a[nñ]os|meses)\b/g,
      /\bno puedo (tirar|dejar|abandonar) (todo )?(esto|ahora)\b/g,
      /\btanto (tiempo|esfuerzo|dinero)\b/g,
      /\bsunk cost\b/g,
    ],
  },
  present_bias: {
    label: 'Sesgo del presente',
    question: '¿Es urgencia real o fabricada? ¿Se ve igual dentro de una semana?',
    patterns: [
      /\btiene que ser (ahora|ya)\b/g, /\bno puedo esperar\b/g, /\bya mismo\b/g,
      /\bahora o nunca\b/g, /\bno hay tiempo\b/g, /\btengo que decidir (hoy|ya)\b/g,
      /\bright now\b/g, /\bcan'?t wait\b/g,
    ],
  },
  loss_aversion: {
    label: 'Aversión a la pérdida',
    question: '¿Estás pesando lo que podrías PERDER más que lo que podrías ganar?',
    patterns: [
      /\bno quiero perder\b/g, /\by si (lo )?pierdo\b/g, /\bme da miedo perder\b/g,
      /\bvoy a perder\b/g, /\bperder lo que (tengo|logr[eé]|consegu[ií])\b/g,
      /\bafraid to lose\b/g, /\bwhat if i lose\b/g,
    ],
  },
  wishful_thinking: {
    label: 'Ilusión (wishful thinking)',
    question: '¿Eso es lo que SABÉS, o lo que QUERÉS que pase?',
    patterns: [
      /\bseguro que s[ií]\b/g, /\bva a salir bien\b/g, /\bno puede (fallar|salir mal)\b/g,
      /\bobvio que (s[ií]|va|me)\b/g, /\bseguro (me|nos) (dice|da|dan) que s[ií]\b/g,
      /\btiene que salir\b/g, /\bva a decir que s[ií]\b/g,
    ],
  },
  confirmation: {
    label: 'Sesgo de confirmación',
    question: '¿Buscaste el argumento EN CONTRA con la misma fuerza que el a favor?',
    patterns: [
      /\bobviamente\b/g, /\bes obvio\b/g, /\bclaramente\b/g, /\btodo indica que\b/g,
      /\bno hay otra (opci[oó]n|forma|manera)\b/g, /\bsolo (puede|queda|hay) (una|que)\b/g,
      /\bcualquiera (lo )?ve\b/g,
    ],
  },
  planning_fallacy: {
    label: 'Falacia de planificación',
    question: '¿Cuánto tardó algo PARECIDO la última vez, de verdad?',
    patterns: [
      /\bva a ser r[aá]pido\b/g, /\ben un rato\b/g, /\bno me va a llevar (nada|mucho)\b/g,
      /\bes f[aá]cil\b/g, /\ben (dos|tres) d[ií]as\b/g, /\benseguida (lo|est[aá])\b/g,
    ],
  },
  all_or_nothing: {
    label: 'Todo o nada',
    question: '¿Es realmente binario, o hay una opción intermedia / reversible?',
    patterns: [
      /\bo todo o nada\b/g, /\bo s[ií] o no\b/g, /\bno hay punto medio\b/g,
      /\bblanco o negro\b/g, /\bes esto o nada\b/g,
    ],
  },
}

const ALL = Object.keys(BIASES) as Bias[]

function fold(text: string): string {
  const map: Record<string, string> = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n' }
  return text.replace(/[A-ZÁÉÍÓÚÜÑ]/g, (c) => c.toLowerCase()).replace(/[áéíóúüñ]/g, (c) => map[c] ?? c)
}

const MAX_EVIDENCE = 2

/** Detecta sesgos en el texto. Determinístico. Texto vacío → sin hits. */
export function detectBiases(text: string): BiasResult {
  const original = (text ?? '').slice(0, 12_000)
  const norm = fold(original)
  const hits: BiasHit[] = []

  for (const bias of ALL) {
    const def = BIASES[bias]
    const seen = new Set<string>()
    const evidence: string[] = []
    for (const re of def.patterns) {
      re.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = re.exec(norm)) !== null) {
        const frag = original.slice(m.index, m.index + m[0].length).trim()
        const key = frag.toLowerCase()
        if (frag && !seen.has(key)) {
          seen.add(key)
          if (evidence.length < MAX_EVIDENCE) evidence.push(frag)
        }
        if (m.index === re.lastIndex) re.lastIndex++
      }
    }
    if (evidence.length > 0) hits.push({ bias, label: def.label, question: def.question, evidence })
  }

  return { hits }
}
