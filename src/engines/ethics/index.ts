// SIR V2 - Chequeo etico/estrategico (16.M5): Termometro de Jugada.
//
// Este motor no intenta volver pasivo a SIR. Evalua la jugada de Aaron para
// distinguir estrategia legitima de cruces reales: engano, coercion, explotacion,
// exposicion indebida o riesgo critico. La salida es navegable: permitir,
// advertir, reformular o bloquear.

export type EthicsVerdict = 'ok' | 'caution' | 'high_risk' | 'blocked'

export type EthicsCategory =
  | 'deception'
  | 'coercion'
  | 'fabricated_pressure'
  | 'exploit_vulnerability'
  | 'privacy_exposure'
  | 'illegal_or_fraud'
  | 'critical_decision'
  | 'affective_control'
  | 'strategic_pressure'

export type EthicsLine =
  | 'truth'
  | 'pressure'
  | 'vulnerability'
  | 'privacy'
  | 'autonomy'
  | 'legal'
  | 'reputation'
  | 'critical'

export interface EthicsFlag {
  category: EthicsCategory
  label: string
  reason: string
  evidence: string[]
  line: EthicsLine
  severity: EthicsVerdict
}

export interface EthicsCheck {
  verdict: EthicsVerdict
  flags: EthicsFlag[]
  /** 0-100: lectura visual del riesgo de cruzar linea. */
  score: number
  /** Alias explicito para UI. */
  riskScore: number
  /** Lineas rojas cercanas o cruzadas. */
  lines: EthicsLine[]
  /** Mensaje para mostrar cuando hay riesgo. '' si ok. */
  message: string
  /** Prueba de legitimidad cuando hay flags. '' si ok. */
  litmus: string
  /** Por que importa en terminos estrategicos, no moralistas. */
  whyItMatters: string
  /** Camino alternativo: agresivo, pero limpio. */
  safeAggressiveReframe: string
}

interface CategoryDef {
  label: string
  reason: string
  line: EthicsLine
  severity: EthicsVerdict
  patterns: RegExp[]
}

// Patrones SIN acentos: el texto se normaliza antes de matchear.
const DEFS: Record<EthicsCategory, CategoryDef> = {
  deception: {
    label: 'Verdad',
    reason: 'La jugada requiere mentir, hacerse pasar por alguien o hacer creer algo falso. Framing honesto si; falsedad no.',
    line: 'truth',
    severity: 'blocked',
    patterns: [
      /\bhacer(me|se|le|nos)? pasar por\b/g,
      /\bsuplantar(la|lo|le)?\b/g,
      /\bfingir(le|me)?\b/g, /\bfingiendo\b/g, /\bsimular que\b/g,
      /\bmentir(le|la|lo)?\b/g, /\buna mentira\b/g, /\bmentira piadosa\b/g,
      /\benga[nn]ar(la|lo|le|los)?\b/g, /\bun enga[nn]o\b/g,
      /\bpretexto falso\b/g, /\bexcusa falsa\b/g, /\bcoartada\b/g,
      /\bhacerle creer\b/g, /\bque crea que\b/g,
      /\binventar(le)? (una|que|un)\b/g,
    ],
  },
  coercion: {
    label: 'Coercion',
    reason: 'Amenazar, chantajear, obligar o forzar cancela la salida libre del otro. Eso no es estrategia: es coercion.',
    line: 'autonomy',
    severity: 'blocked',
    patterns: [
      /\bchantaj(e|ear|earla|earlo)\b/g,
      /\bamenaz(ar|arla|arlo|a con)\b/g,
      /\bultimatum\b/g,
      /\bobligar(la|lo|le)? a\b/g,
      /\bforzar(la|lo|le)? a\b/g,
      /\bsi no .* entonces\b/g,
      /\bhacerle sentir que tiene que\b/g,
    ],
  },
  fabricated_pressure: {
    label: 'Presion fabricada',
    reason: 'Urgencia, escasez, autoridad o consecuencia falsa destruye confianza y abre riesgo reputacional/legal.',
    line: 'pressure',
    severity: 'blocked',
    patterns: [
      /\b(falsa urgencia|urgencia falsa)\b/g,
      /\b(falsa escasez|escasez falsa)\b/g,
      /\bautoridad falsa\b/g,
      /\bpresion falsa\b/g,
      /\bfabricar (urgencia|escasez|presion|miedo|culpa)\b/g,
      /\binventar(le)? (una )?(urgencia|escasez|amenaza)\b/g,
    ],
  },
  exploit_vulnerability: {
    label: 'Vulnerabilidad',
    reason: 'Usar miedo, trauma, inseguridad, culpa o dependencia como palanca contra la persona cruza linea.',
    line: 'vulnerability',
    severity: 'blocked',
    patterns: [
      /\baprovechar(me)?( de)? su (miedo|inseguridad|debilidad|vulnerabilidad|soledad|necesidad|desesperacion|dependencia)\b/g,
      /\bexplotar su\b/g,
      /\bsu punto debil\b/g,
      /\bsus miedos\b/g,
      /\bsu trauma\b/g,
      /\bsu herida\b/g,
      /\bsus inseguridades\b/g,
      /\bhacerla sentir culpable\b/g,
      /\bhacerlo sentir culpable\b/g,
      /\bdarle culpa\b/g,
      /\bculpar(la|lo)? para\b/g,
      /\bmeterle culpa\b/g,
      /\bjugar con sus (sentimientos|emociones)\b/g,
      /\busar(la|lo)? en su contra\b/g,
    ],
  },
  privacy_exposure: {
    label: 'Privacidad',
    reason: 'Exponer datos privados, intimos o identificables fuera del espacio privado de Aaron cambia la naturaleza del uso.',
    line: 'privacy',
    severity: 'blocked',
    patterns: [
      /\bpublicar (sus|su) (datos|mensajes|fotos|informacion)\b/g,
      /\bexponer (sus|su) (datos|mensajes|fotos|informacion|secreto)\b/g,
      /\bfiltrar (sus|su) (datos|mensajes|fotos|informacion)\b/g,
      /\bmandar(le)? .* a (analytics|clarity|ga4|logs?)\b/g,
      /\bsubir .* privado\b/g,
    ],
  },
  illegal_or_fraud: {
    label: 'Legalidad',
    reason: 'Fraude, acceso indebido, documentos falsos o evasion legal no son una jugada agresiva: son riesgo real.',
    line: 'legal',
    severity: 'blocked',
    patterns: [
      /\bfraude\b/g,
      /\bestafar(la|lo|le)?\b/g,
      /\bfalsificar\b/g,
      /\bdocumento falso\b/g,
      /\bacceso indebido\b/g,
      /\bhackear\b/g,
      /\brobar(le)? (datos|cuenta|clave|password|contrasena)\b/g,
      /\bevadir impuestos\b/g,
    ],
  },
  critical_decision: {
    label: 'Decision critica',
    reason: 'Salud, legal, finanzas o seguridad pueden analizarse, pero no empujarse como decision critica sin humano.',
    line: 'critical',
    severity: 'high_risk',
    patterns: [
      /\bdejar (la )?medicacion\b/g,
      /\bcambiar (la )?dosis\b/g,
      /\bdiagnosticar(me|la|lo)?\b/g,
      /\binvertir todo\b/g,
      /\bmeter todo mi dinero\b/g,
      /\bfirmar sin revisar\b/g,
      /\bdemandar sin abogado\b/g,
    ],
  },
  affective_control: {
    label: 'Control afectivo',
    reason: 'En vinculos cercanos puede haber estrategia de cuidado, timing y limites; no control, castigo emocional ni manipulacion afectiva.',
    line: 'autonomy',
    severity: 'high_risk',
    patterns: [
      /\bcastigar(la|lo)? con silencio\b/g,
      /\bley del hielo\b/g,
      /\bcontrolar(la|lo)?\b/g,
      /\bhacer que dependa\b/g,
      /\bque (acepte|ceda|haga lo que|me de lo que)\b/g,
      /\bmanejar(la|lo)? para\b/g,
    ],
  },
  strategic_pressure: {
    label: 'Presion estrategica',
    reason: 'Hay influencia fuerte o insistencia. No se bloquea: exige sostener verdad, salida libre y consecuencia real.',
    line: 'pressure',
    severity: 'caution',
    patterns: [
      /\bpresionar(la|lo|le|los)?\b/g,
      /\bmeterle presion\b/g,
      /\binsistir\b/g,
      /\bconvencer(la|lo|le)?\b/g,
      /\blograr que\b/g,
      /\bnegociar duro\b/g,
      /\bsacar ventaja\b/g,
      /\bposicionar(me|la|lo)?\b/g,
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
  'Prueba de legitimidad: si requiere mentir, fabricar presion, ocultar un dano o explotar una vulnerabilidad, SIR no ayuda. Si es preparacion privada para comunicar una verdad con mas claridad, SIR si ayuda.'

function isAffective(ctx?: { ambito?: string; relationship?: string }): boolean {
  const a = (ctx?.ambito ?? '').toLowerCase()
  const r = (ctx?.relationship ?? '').toLowerCase()
  return a === 'personal' || ['romantic', 'family', 'friend', 'pareja', 'familia', 'amigo'].some((k) => r.includes(k))
}

function severityRank(verdict: EthicsVerdict): number {
  if (verdict === 'blocked') return 4
  if (verdict === 'high_risk') return 3
  if (verdict === 'caution') return 2
  return 1
}

function scoreFor(flags: EthicsFlag[]): number {
  if (flags.some((f) => f.severity === 'blocked')) return Math.min(100, 82 + flags.length * 4)
  if (flags.some((f) => f.severity === 'high_risk')) return Math.min(81, 64 + flags.length * 5)
  if (flags.some((f) => f.severity === 'caution')) return Math.min(63, 34 + flags.length * 7)
  return 10
}

/**
 * Chequea el objetivo contra lineas rojas y zonas grises.
 * `blocked` = SIR no ejecuta esa forma. `high_risk` = reformula antes de ayudar.
 * `caution` = ayuda mostrando el riesgo. `ok` = sin senales fuertes.
 */
export function checkEthics(objective: string, ctx?: { ambito?: string; relationship?: string }): EthicsCheck {
  const original = (objective ?? '').slice(0, 4_000)
  const norm = fold(original)
  const flags: EthicsFlag[] = []

  for (const cat of CATS) {
    const def = DEFS[cat]
    // El control afectivo solo sube a high_risk en vinculos afectivos. En ambito
    // profesional "manejar la situacion" se captura como presion estrategica.
    if (cat === 'affective_control' && !isAffective(ctx)) continue

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
    if (evidence.length > 0) {
      flags.push({ category: cat, label: def.label, reason: def.reason, evidence, line: def.line, severity: def.severity })
    }
  }

  const verdict = flags.reduce<EthicsVerdict>(
    (acc, f) => severityRank(f.severity) > severityRank(acc) ? f.severity : acc,
    'ok',
  )
  const riskScore = scoreFor(flags)
  const lines = [...new Set(flags.map((f) => f.line))]

  return {
    verdict,
    flags,
    score: riskScore,
    riskScore,
    lines,
    message: buildMessage(verdict, flags),
    litmus: verdict === 'ok' ? '' : LITMUS,
    whyItMatters: buildWhy(verdict),
    safeAggressiveReframe: buildReframe(verdict, flags),
  }
}

function buildMessage(verdict: EthicsVerdict, flags: EthicsFlag[]): string {
  if (verdict === 'ok') return ''
  const lines = flags.map((f) => {
    const ev = f.evidence.length > 0 ? ` Evidencia: "${f.evidence.join('", "')}".` : ''
    return `- ${f.label}: ${f.reason}${ev}`
  })
  if (verdict === 'blocked') {
    return [
      'Esta forma cruza una linea roja. SIR no ayuda a ejecutar esa version.',
      ...lines,
      'Si el objetivo de Aaron es legitimo, lo reformulo hacia una via agresiva pero limpia.',
    ].join('\n')
  }
  if (verdict === 'high_risk') {
    return [
      'Esto esta cerca de cruzar linea. No lo bloqueo, pero hay que reformular antes de avanzar.',
      ...lines,
    ].join('\n')
  }
  return [
    'Zona gris util: hay estrategia fuerte, pero todavia puede jugarse de forma honesta.',
    ...lines,
  ].join('\n')
}

function buildWhy(verdict: EthicsVerdict): string {
  if (verdict === 'blocked') {
    return 'Cruzar esta linea puede ganar una conversacion y perder confianza, reputacion, legalidad o control futuro.'
  }
  if (verdict === 'high_risk') {
    return 'La intencion puede convenirle a Aaron, pero el metodo aumenta riesgo relacional, reputacional o de autonomia.'
  }
  if (verdict === 'caution') {
    return 'La presion o influencia puede ser legitima si se sostiene en hechos reales, consecuencias reales y una salida libre.'
  }
  return ''
}

function buildReframe(verdict: EthicsVerdict, flags: EthicsFlag[]): string {
  if (verdict === 'ok') return ''
  const cats = new Set(flags.map((f) => f.category))
  if (cats.has('deception')) {
    return 'No inventes ni te hagas pasar por nadie. Usa identidad real, hechos verificables y un pedido claro con consecuencia real.'
  }
  if (cats.has('exploit_vulnerability')) {
    return 'No uses la herida como palanca. Cambia a incentivo legitimo, limite claro y una conversacion que la otra persona podria entender sin sentirse vulnerada.'
  }
  if (cats.has('coercion') || cats.has('fabricated_pressure')) {
    return 'Quita amenaza, urgencia falsa o culpa. Mantiene firmeza con plazos reales, alternativas reales y costo real de no decidir.'
  }
  if (cats.has('privacy_exposure')) {
    return 'Usa la informacion como inteligencia privada de Aaron. No la publiques ni la mandes a terceros; resume patrones sin exponer contenido identificable.'
  }
  if (cats.has('critical_decision')) {
    return 'Usa SIR para preparar opciones, riesgos y preguntas. La decision final critica pasa por revision humana/profesional.'
  }
  if (cats.has('affective_control')) {
    return 'Pasa de control a limite: di que necesitas, que consecuencia real tendra para ti y que salida libre tiene la otra persona.'
  }
  return 'Mantiene la jugada firme: verdad, evidencia, salida libre, beneficio claro para Aaron y una alternativa digna para la otra persona.'
}
