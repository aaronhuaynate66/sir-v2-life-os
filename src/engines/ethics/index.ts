// SIR V2 — Chequeo ético (16·M5): guardrail transversal, NO opcional.
//
// Antes de que SIR ayude con cualquier movida relacional (encuadrar, ensayar),
// este motor verifica que el OBJETIVO no cruce la línea que el dominio 16 declara
// innegociable: engaño, presión fabricada, explotar miedos/debilidades,
// instrumentalizar vínculos afectivos. Si la cruza, SIR NO ayuda y explica por qué
// — con la prueba de fuego ("¿te sentirías cómodo si la otra persona supiera
// exactamente qué hacés?") y el argumento pragmático (la manipulación gana la
// conversación y pierde la relación).
//
// DETERMINÍSTICO y puro (heurística de patrones ES): corre ANTES del LLM, así el
// guardrail no depende de que el modelo se auto-vigile. Es una red de seguridad de
// primer paso, honesta: no marcar nada NO certifica que la movida sea impecable.

export type EthicsVerdict = 'ok' | 'caution' | 'blocked'
export type EthicsCategory =
  | 'deception'
  | 'fabricated_pressure'
  | 'exploit_vulnerability'
  | 'instrumentalize_affective'

export interface EthicsFlag {
  category: EthicsCategory
  label: string
  reason: string
  evidence: string[]
}

export interface EthicsCheck {
  verdict: EthicsVerdict
  flags: EthicsFlag[]
  /** Mensaje honesto para mostrar cuando el veredicto no es 'ok'. '' si ok. */
  message: string
  /** La prueba de fuego (recordatorio) cuando hay flags. '' si ok. */
  litmus: string
}

interface CategoryDef {
  label: string
  reason: string
  /** true = cruza la línea dura (bloquea). false = zona gris (cautela). */
  blocking: boolean
  patterns: RegExp[]
}

// Patrones SIN acentos: el texto se normaliza antes de matchear.
const DEFS: Record<EthicsCategory, CategoryDef> = {
  deception: {
    label: 'Engaño',
    reason: 'Implica decir o hacer creer algo falso. Encuadrar tu verdad es legítimo; afirmar algo falso no lo es, aunque funcione.',
    blocking: true,
    patterns: [
      /\bhacer(me|se|le|nos)? pasar por\b/g,
      /\bfingir(le|me)?\b/g, /\bfingiendo\b/g, /\bsimular que\b/g,
      /\bmentir(le|la|lo)?\b/g, /\buna mentira\b/g, /\bmentira piadosa\b/g,
      /\benga[nñ]ar(la|lo|le|los)?\b/g, /\bun enga[nñ]o\b/g,
      /\bpretexto falso\b/g, /\bexcusa falsa\b/g, /\bcoartada\b/g,
      /\bhacerle creer\b/g, /\bque crea que\b/g,
      /\binventar(le)? (una|que|un)\b/g,
    ],
  },
  fabricated_pressure: {
    label: 'Presión fabricada',
    reason: 'Fabricar urgencia, escasez, amenaza o chantaje para forzar una decisión. Es manipulación, no persuasión.',
    blocking: true,
    patterns: [
      /\b(falsa urgencia|urgencia falsa)\b/g, /\b(falsa escasez|escasez falsa)\b/g,
      /\bmeterle presion\b/g, /\bpresionar(la|lo|le|los)?\b/g,
      /\bchantaj(e|ear|earla|earlo)\b/g, /\bamenaz(ar|arla|arlo|a con)\b/g,
      /\bultim[aá]tum\b/g, /\bobligar(la|lo|le)? a\b/g, /\bforzar(la|lo)? a\b/g,
      /\bmanipular(la|lo|le|los)?\b/g, /\bmanipulacion\b/g,
      /\bhacerle sentir que tiene que\b/g,
    ],
  },
  exploit_vulnerability: {
    label: 'Explotar una debilidad',
    reason: 'Usar el miedo, la inseguridad, la culpa o una herida de la persona en su contra. Entender a alguien para servirle mejor ≠ mapear sus heridas para vulnerarlo.',
    blocking: true,
    patterns: [
      /\baprovechar(me)?( de)? su (miedo|inseguridad|debilidad|vulnerabilidad|soledad|necesidad|desesperacion)\b/g,
      /\bexplotar su\b/g, /\bsu punto debil\b/g, /\bsus miedos\b/g,
      /\bsu trauma\b/g, /\bsu herida\b/g, /\bsus inseguridades\b/g,
      /\bhacerla sentir culpable\b/g, /\bhacerlo sentir culpable\b/g,
      /\bdarle culpa\b/g, /\bculpar(la|lo)? para\b/g, /\bmeterle culpa\b/g,
      /\bjugar con sus (sentimientos|emociones)\b/g,
      /\busar(la|lo)? en su contra\b/g,
    ],
  },
  instrumentalize_affective: {
    label: 'Instrumentalizar un vínculo afectivo',
    reason: 'Con la novia, la familia o un amigo íntimo la lógica es el cuidado, no la estrategia. No se los "posiciona" ni se los "maneja" como una cuenta.',
    blocking: false, // zona gris: solo cautela, y solo en ámbito afectivo
    patterns: [
      /\bposicionar(me|la|lo)?\b/g, /\bmanejar(la|lo)? para\b/g,
      /\bcontrolar(la|lo)?\b/g, /\bsacar ventaja\b/g,
      /\bque (acepte|ceda|haga lo que|me de lo que)\b/g,
    ],
  },
}

const CATS = Object.keys(DEFS) as EthicsCategory[]

function fold(text: string): string {
  const map: Record<string, string> = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n' }
  return text.replace(/[A-ZÁÉÍÓÚÜÑ]/g, (c) => c.toLowerCase()).replace(/[áéíóúüñ]/g, (c) => map[c] ?? c)
}

const MAX_EVIDENCE = 2

const LITMUS =
  '¿Te sentirías cómodo si la otra persona supiera exactamente qué estás haciendo? Si la respuesta es no, es manipulación — y ahí SIR no te ayuda, te lo marca.'

function isAffective(ctx?: { ambito?: string; relationship?: string }): boolean {
  const a = (ctx?.ambito ?? '').toLowerCase()
  const r = (ctx?.relationship ?? '').toLowerCase()
  return a === 'personal' || ['romantic', 'family', 'friend', 'pareja', 'familia', 'amigo'].some((k) => r.includes(k))
}

/**
 * Chequea el objetivo contra la línea ética del dominio 16. Determinístico.
 * `blocked` = cruza una línea dura (SIR no ayuda). `caution` = zona gris afectiva.
 * `ok` = sin señales (no certifica pureza, solo que no saltó ninguna alarma).
 */
export function checkEthics(objective: string, ctx?: { ambito?: string; relationship?: string }): EthicsCheck {
  const original = (objective ?? '').slice(0, 4_000)
  const norm = fold(original)
  const flags: EthicsFlag[] = []

  for (const cat of CATS) {
    const def = DEFS[cat]
    // La instrumentalización afectiva solo aplica en ámbito afectivo.
    if (cat === 'instrumentalize_affective' && !isAffective(ctx)) continue

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
    if (evidence.length > 0) flags.push({ category: cat, label: def.label, reason: def.reason, evidence })
  }

  const blocking = flags.filter((f) => DEFS[f.category].blocking)
  const verdict: EthicsVerdict = blocking.length > 0 ? 'blocked' : flags.length > 0 ? 'caution' : 'ok'

  return { verdict, flags, message: buildMessage(verdict, flags), litmus: verdict === 'ok' ? '' : LITMUS }
}

function buildMessage(verdict: EthicsVerdict, flags: EthicsFlag[]): string {
  if (verdict === 'ok') return ''
  if (verdict === 'blocked') {
    const lines = flags.filter((f) => DEFS[f.category].blocking).map((f) => `• ${f.label}: ${f.reason}`)
    return (
      'Esto cruza una línea que SIR no ayuda a cruzar:\n' +
      lines.join('\n') +
      '\n\nY no es solo ética: la manipulación gana la conversación y pierde la relación. Con la gente que te importa y con tu carrera a largo plazo, la confianza es el activo que compone. Si querés, reformulá el objetivo hacia tu verdad y lo ensayamos honesto.'
    )
  }
  // caution
  const lines = flags.map((f) => `• ${f.label}: ${f.reason}`)
  return (
    'Cuidado con el registro acá:\n' +
    lines.join('\n') +
    '\n\nNo lo bloqueo, pero con un vínculo afectivo la pregunta no es "cómo consigo que…" sino "cómo nos entendemos". Lo ensayamos desde el cuidado, no desde la estrategia.'
  )
}
