// SIR V2 — Detector de manipulación entrante (16·M3, defensa).
//
// Base científica: ingeniería social / principios de influencia (Cialdini) — ver
// `docs/16_INFLUENCE_SOCIAL_INTELLIGENCE.md`. Aaron pega un mensaje que le llega
// (mail, chat, pedido) y SIR marca los gatillos clásicos y le sugiere PAUSAR y
// verificar. Es DEFENSA: nunca acusa a nadie, solo enciende una luz.
//
// 100% puro y determinístico (heurística de patrones ES+EN). Corre client-side:
// cero costo, cero API, cero LLM. Honesto: marca *posible* manipulación; la
// ausencia de señales NO prueba que un mensaje sea legítimo, y una señal suelta
// no prueba que lo sea. Es un recordatorio de frenar, no un veredicto.

import { TECHNIQUE_BY_ID, type TechniqueCategory } from './techniques'

export type ManipulationTactic =
  | 'authority' | 'urgency' | 'scarcity' | 'fear'
  | 'reciprocity' | 'social_proof' | 'commitment'

export interface TacticHit {
  tactic: ManipulationTactic
  label: string
  /** Fragmentos del texto que dispararon la detección (del texto original). */
  evidence: string[]
}

export type ManipulationRisk = 'none' | 'low' | 'medium' | 'high'

export interface ManipulationResult {
  hits: TacticHit[]
  risk: ManipulationRisk
  /** La "firma" clásica: autoridad + urgencia + (miedo o escasez) juntas. */
  combo: boolean
  advice: string
}

const LABELS: Record<ManipulationTactic, string> = {
  authority: 'Autoridad',
  urgency: 'Urgencia',
  scarcity: 'Escasez',
  fear: 'Miedo',
  reciprocity: 'Reciprocidad forzada',
  social_proof: 'Prueba social',
  commitment: 'Compromiso previo',
}

// Patrones por táctica (ES + EN). Se escriben SIN acentos: el texto se normaliza
// a minúsculas + sin diacríticos (preservando longitud) antes de matchear, así
// "última" y "ultima" caen igual y los índices siguen alineados con el original.
const PATTERNS: Record<ManipulationTactic, RegExp[]> = {
  authority: [
    /\bsoy (de |del |de la |de el )?(ti|sistemas|soporte tecnico|soporte|seguridad|banco|el banco|tu banco|recursos humanos|rrhh|la gerencia|gerencia|administracion|microsoft|google|apple|whatsapp|netflix)\b/g,
    /\b(este es|le habla|te habla|somos) (el |la )?(banco|equipo|departamento|area|soporte|servicio)\b/g,
    /\b(en nombre de|por orden de|de parte de) (la |el )?(gerencia|direccion|gerente|director|jefe|presidencia)\b/g,
    /\b(el |la )?(gerente|director|jefe|gerencia|direccion) (dijo|pide|necesita|ordeno|solicita)\b/g,
    /\b(notificacion|aviso|comunicado) oficial\b/g,
    /\b(this is|we are) (the )?(it|support|security|your bank|the bank|helpdesk)\b/g,
    /\bon behalf of\b/g, /\bofficial (notice|notification)\b/g,
  ],
  urgency: [
    /\burgente\b/g, /\bahora mismo\b/g, /\bde inmediato\b/g, /\binmediatamente\b/g,
    /\bantes de (que|las|hoy|manana|medianoche)\b/g,
    /\ben (las )?(proximas )?(24|48|72) ?(horas|hs|h)\b/g,
    /\btu cuenta (sera|va a ser|quedara) (suspendida|bloqueada|cerrada|desactivada|eliminada)\b/g,
    /\b(expira|vence|caduca) (hoy|en |manana)\b/g,
    /\b(responde|contesta|actua|haz(lo)?) (ya|ahora|rapido)\b/g,
    /\bno hay tiempo\b/g, /\bultimo (dia|aviso)\b/g,
    /\burgent\b/g, /\bimmediately\b/g, /\bright (now|away)\b/g, /\bact now\b/g,
    /\bwithin (24|48|72) hours\b/g,
    /\byour account will be (suspended|blocked|closed|deactivated|deleted)\b/g,
    /\bexpires (today|soon|tonight)\b/g,
  ],
  scarcity: [
    /\bultima (oportunidad|chance|posibilidad)\b/g,
    /\bsolo por hoy\b/g, /\bsolo (quedan|para los primeros)\b/g,
    /\bquedan pocos\b/g, /\b(cupos|lugares|plazas) limitad[oa]s\b/g,
    /\boferta (limitada|por tiempo)\b/g,
    /\bno (lo )?vas a (volver a|poder) \w+/g,
    /\bunica (vez|oportunidad)\b/g,
    /\blast chance\b/g, /\blimited (time|offer|spots|availability)\b/g,
    /\bonly today\b/g, /\b(few|only \d+) (left|remaining|spots)\b/g,
    /\bwhile supplies last\b/g,
  ],
  fear: [
    /\bactividad (sospechosa|inusual|no reconocida)\b/g,
    /\bdetectamos\b/g, /\bhemos detectado\b/g,
    /\btu cuenta (fue|ha sido) (comprometida|hackeada|vulnerada)\b/g,
    /\bacceso no autorizado\b/g, /\bintento de acceso\b/g,
    /\bvas a perder\b/g, /\b(perderas|perdras)\b/g,
    /\b(consecuencias|sanciones|multa|demanda|problema legal|accion legal)\b/g,
    /\bse (eliminara|borrara|perdera|suspendera)\b/g,
    /\bsuspicious activity\b/g, /\bunauthorized (access|login|attempt)\b/g,
    /\byour account (has been|was) (compromised|hacked|breached)\b/g,
    /\byou will lose\b/g, /\blegal action\b/g, /\bpenalt(y|ies)\b/g,
  ],
  reciprocity: [
    /\bte hice (un |el )?favor\b/g, /\bdespues de todo lo que (hice|te)\b/g,
    /\bme debes\b/g, /\bya que te ayude\b/g, /\bte lo debo cobrar\b/g,
    /\bi did you a favor\b/g, /\byou owe me\b/g, /\bafter all i('ve| have) done\b/g,
  ],
  social_proof: [
    /\btodos (lo estan|ya lo|estan)\b/g, /\bmiles de personas\b/g,
    /\bno seas el unico\b/g, /\bla mayoria ya\b/g, /\btodo el mundo (lo|ya)\b/g,
    /\beveryone (is|else)\b/g, /\bthousands of (people|users)\b/g, /\bjoin thousands\b/g,
  ],
  commitment: [
    /\bya (dijiste|habias dicho|quedaste) que\b/g, /\bquedamos en que\b/g,
    /\b(vos |tu )?prometiste\b/g, /\bno te eches para atras\b/g, /\bdiste tu palabra\b/g,
    /\byou already (agreed|said|promised)\b/g, /\byou said you would\b/g, /\bdon'?t back out\b/g,
  ],
}

const TACTICS = Object.keys(PATTERNS) as ManipulationTactic[]

/** Minúsculas + quita diacríticos preservando longitud (índices alineados). */
function fold(text: string): string {
  const map: Record<string, string> = {
    á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n',
    Á: 'a', É: 'e', Í: 'i', Ó: 'o', Ú: 'u', Ü: 'u', Ñ: 'n',
  }
  return text.replace(/[A-ZÁÉÍÓÚÜÑ]/g, (c) => c.toLowerCase()).replace(/[áéíóúüñ]/g, (c) => map[c] ?? c)
}

const MAX_EVIDENCE_PER_TACTIC = 3

/**
 * Analiza un texto y devuelve los gatillos de manipulación detectados + el nivel
 * de riesgo y el consejo. Determinístico. `text` vacío → riesgo 'none' sin hits.
 */
export function detectManipulation(text: string): ManipulationResult {
  const original = (text ?? '').slice(0, 20_000)
  const norm = fold(original)
  const hits: TacticHit[] = []

  for (const tactic of TACTICS) {
    const seen = new Set<string>()
    const evidence: string[] = []
    for (const re of PATTERNS[tactic]) {
      re.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = re.exec(norm)) !== null) {
        // Fragmento del ORIGINAL en la posición del match (índices alineados).
        const frag = original.slice(m.index, m.index + m[0].length).trim()
        const key = frag.toLowerCase()
        if (frag && !seen.has(key)) {
          seen.add(key)
          if (evidence.length < MAX_EVIDENCE_PER_TACTIC) evidence.push(frag)
        }
        if (m.index === re.lastIndex) re.lastIndex++ // evita loop en match vacío
      }
    }
    if (evidence.length > 0) hits.push({ tactic, label: LABELS[tactic], evidence })
  }

  const has = (t: ManipulationTactic) => hits.some((h) => h.tactic === t)
  // La firma clásica del ataque: te dan autoridad + urgencia + (miedo o escasez).
  const combo = has('authority') && has('urgency') && (has('fear') || has('scarcity'))

  let risk: ManipulationRisk
  if (hits.length === 0) risk = 'none'
  else if (combo || hits.length >= 3) risk = 'high'
  else if (hits.length === 2) risk = 'medium'
  else risk = 'low'

  return { hits, risk, combo, advice: adviceFor(risk, combo) }
}

function adviceFor(risk: ManipulationRisk, combo: boolean): string {
  switch (risk) {
    case 'high':
      return combo
        ? 'Frená. Esta es la firma clásica de un ataque: te apuran con autoridad + urgencia + miedo. No respondas ni hagas nada ahora. Verificá por OTRO canal (llamá vos a un número que YA tengas, no al del mensaje).'
        : 'Frená. Hay varias señales de presión juntas. No actúes en caliente: verificá por otro canal antes de responder, hacer clic o dar datos.'
    case 'medium':
      return 'Ojo: hay señales de presión. Tomate un momento antes de responder y fijate si algo no cierra (quién lo manda, por qué la prisa).'
    case 'low':
      return 'Una señal suelta — probablemente nada, pero teníala presente. Si aparece prisa o miedo encima, desconfiá.'
    case 'none':
      return 'No detecté gatillos de manipulación. Ojo: la ausencia de señales NO garantiza que sea legítimo — verificá igual si te piden plata, datos o acceso.'
  }
}

// ─── CAPA RETÓRICA (16·M3, técnicas de propaganda con firma léxica) ──────────
// Segunda familia: técnicas de propaganda/retórica del catálogo `techniques.ts`.
// Separada de detectManipulation a propósito — no afecta el riesgo de phishing
// (esa firma es de ingeniería social); acá el objetivo es NOMBRAR cómo te están
// tratando de convencer. Las técnicas SEMÁNTICAS (hombre de paja, pista falsa,
// sobresimplificación) no tienen firma léxica → las cubre el deep-scan con IA.

export interface RhetoricHit {
  id: string
  label: string
  category: TechniqueCategory
  evidence: string[]
}

export interface RhetoricResult {
  hits: RhetoricHit[]
}

// Patrones por técnica (folded, sin acentos, ES + algo de EN). Solo las técnicas
// marcadas pure:true en el catálogo y con señal léxica clara (appeal_to_fear ya
// vive en la capa de ingeniería social, no se repite acá).
const RHETORIC_PATTERNS: Record<string, RegExp[]> = {
  flag_waving: [
    /\blos nuestros\b/g, /\bpor la patria\b/g, /\bdefender lo nuestro\b/g,
    /\bgente como nosotros\b/g, /\bde los (buenos|nuestros)\b/g, /\bnosotros contra ellos\b/g,
  ],
  false_dilemma: [
    /\bo estas con(migo|nosotros)? o (estas )?(en )?contra\b/g, /\bno hay otra (opcion|salida|alternativa)\b/g,
    /\bo esto o (lo otro|nada|aquello)\b/g, /\bes esto o nada\b/g,
    /\bsolo hay dos (opciones|caminos|salidas)\b/g, /\bo aceptas o\b/g,
  ],
  whataboutism: [
    /\by vos que\b/g, /\bmira quien habla\b/g, /\by que hay de\b/g, /\by cuando vos\b/g,
    /\bvos (tambien )?hiciste lo mismo\b/g, /\by vos tampoco\b/g,
  ],
  reductio_ad_hitlerum: [
    /\b(eso )?es (algo )?de (dictadores|nazis|comunistas|fascistas|tiranos)\b/g,
    /\bigual que (hitler|un dictador|los nazis)\b/g, /\bsos igual que\b/g,
  ],
  appeal_to_authority: [
    /\blos expertos (dicen|afirman|coinciden|recomiendan)\b/g,
    /\besta (cientificamente )?comprobado\b/g, /\bla ciencia (dice|demuestra)\b/g,
    /\besta demostrado\b/g, /\bestudios (demuestran|confirman)\b/g,
    /\btodos los (medicos|especialistas|expertos)\b/g,
    /\bexperts (say|agree)\b/g, /\bscientifically proven\b/g,
  ],
  bandwagon: [
    /\btodos lo (hacen|piensan|saben|usan)\b/g, /\btodo el mundo lo (hace|sabe|usa|piensa)\b/g,
    /\bnadie (en su sano juicio )?(cree|piensa) lo contrario\b/g, /\bsumate a los que\b/g,
    /\beveryone (does|thinks) (it|this)\b/g,
  ],
  doubt: [
    /\bquien te dice que\b/g, /\bseguro que \w+ (miente|te miente|te oculta)\b/g,
    /\bno podes confiar en\b/g, /\bno es tan \w+ como (parece|dice|crees)\b/g,
    /\bque te hace pensar que\b/g,
  ],
  ad_hominem: [
    /\bvos que sabes\b/g, /\bno tenes (la )?autoridad (moral )?para\b/g,
    /\bmira como estas (vos )?para\b/g, /\bviniendo de vos\b/g, /\bquien sos vos para\b/g,
  ],
  thought_terminating: [
    /\bes lo que hay\b/g, /\basi son las cosas\b/g, /\bno hay nada que hacer\b/g,
    /\bfin de la (discusion|conversacion)\b/g, /\bes asi y punto\b/g,
    /\bno hay mas que hablar\b/g, /\bpunto final\b/g, /\bit is what it is\b/g,
  ],
  exaggeration_minimization: [
    /\b(el|la) peor \w+ (de la historia|de todos los tiempos|del mundo)\b/g,
    /\b(el|la) mejor \w+ (de la historia|del mundo|de todos los tiempos)\b/g,
    /\bnunca en (mi|la) vida\b/g, /\bjamas en la vida\b/g, /\bno es para tanto\b/g,
  ],
  appeal_to_popularity: [
    /\bsiempre se (hizo|ha hecho) asi\b/g, /\bes lo normal\b/g, /\btoda la vida fue asi\b/g,
    /\bes lo de siempre\b/g, /\bes la (tradicion|costumbre)\b/g,
  ],
}

const RHETORIC_IDS = Object.keys(RHETORIC_PATTERNS)

/**
 * Detecta técnicas de propaganda/retórica con firma léxica en el texto. Puro,
 * client-side, separado del riesgo de phishing. Devuelve los hits del catálogo.
 */
export function detectRhetoric(text: string): RhetoricResult {
  const original = (text ?? '').slice(0, 20_000)
  const norm = fold(original)
  const hits: RhetoricHit[] = []

  for (const id of RHETORIC_IDS) {
    const def = TECHNIQUE_BY_ID[id]
    if (!def) continue
    const seen = new Set<string>()
    const evidence: string[] = []
    for (const re of RHETORIC_PATTERNS[id]) {
      re.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = re.exec(norm)) !== null) {
        const frag = original.slice(m.index, m.index + m[0].length).trim()
        const key = frag.toLowerCase()
        if (frag && !seen.has(key)) {
          seen.add(key)
          if (evidence.length < MAX_EVIDENCE_PER_TACTIC) evidence.push(frag)
        }
        if (m.index === re.lastIndex) re.lastIndex++
      }
    }
    if (evidence.length > 0) hits.push({ id, label: def.label, category: def.category, evidence })
  }
  return { hits }
}
