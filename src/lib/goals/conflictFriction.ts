// SIR V2 — Fricción conflicto↔objetivo (#92). PURO + testeable.
//
// Aaron: "un problema con personas que afectan mis objetivos" — se peleó con su
// mamá y hermana por ir al Mundial (su NORTE). El score del vínculo ya baja
// (auto-tono + recencia), y el briefing de la persona ya lo nombra; falta el
// otro lado: que el OBJETIVO muestre que está generando fricción con gente
// cercana. Es E5 puro: tu norte roza con tus vínculos.
//
// Heurística DETERMINÍSTICA (sin IA): una interacción reciente TENSA (tono ≤2)
// "toca" un objetivo si:
//   (a) la persona del conflicto está vinculada al objetivo (relatedPersons), o
//   (b) hay solape de palabras-clave entre el objetivo (título+descripción) y
//       la nota del conflicto (ej. "Mundial"/"bomberos").
// La IA ya dejó la textura en la nota del person_log; acá solo cruzamos.

const STOPWORDS = new Set([
  'para','por','con','sin','los','las','del','una','uno','unos','unas','que','qué',
  'como','cómo','este','esta','estos','estas','mas','más','muy','sus','tus','mis',
  'ser','estar','tengo','tener','hacer','sobre','entre','desde','hasta','cada',
  'todo','toda','todos','todas','pero','porque','cuando','donde','quien','cual',
  'mi','tu','su','el','la','de','en','un','y','a','o','e','u','se','le','lo','al',
  'me','te','nos','es','son','fue','han','hay','ya','si','no','conversacion',
  'reciente','tensa','tono','inferido','chat','importado','pelea','contarle',
  // genéricas de conversación (evitan match por ruido; las específicas como
  // 'mundial'/'bomberos'/'dubai' SÍ pasan):
  'reunion','reunión','tema','temas','area','área','equipo','empresa','empresas',
  'cosa','cosas','charla','llamada','hoy','ayer','vimos','tocamos','dijo','dije',
])

/** Tokens significativos de un texto: normaliza (sin tildes, minúsculas),
 *  parte por no-letras, descarta cortos (<4) y stopwords. */
export function extractKeywords(text: string): string[] {
  if (!text) return []
  const norm = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
  const out = new Set<string>()
  for (const tok of norm.split(/[^a-z0-9]+/)) {
    if (tok.length < 4) continue
    if (STOPWORDS.has(tok)) continue
    out.add(tok)
  }
  return [...out]
}

export interface RecentConflict {
  personId: string
  /** Nombre para mostrar (resuelto por el caller). */
  personName: string
  /** Tono 1-2. */
  value: number
  /** YYYY-MM-DD. */
  date: string
  /** Nota/textura del conflicto. */
  note: string
}

export interface ConflictGoalInput {
  title: string
  description?: string
  relatedPersons: string[]
}

export interface ConflictMatch {
  personId: string
  personName: string
  date: string
  /** Palabras-clave compartidas (vacío si el match fue por persona vinculada). */
  sharedKeywords: string[]
  /** true si la persona ya estaba vinculada al objetivo. */
  byLinkedPerson: boolean
}

/**
 * Cruza los conflictos recientes con UN objetivo. Devuelve los que lo tocan
 * (por persona vinculada o por solape de palabras-clave). Orden: más reciente
 * primero. PURO.
 */
export function matchConflictsToGoal(
  goal: ConflictGoalInput,
  conflicts: RecentConflict[],
): ConflictMatch[] {
  const goalKeywords = new Set(extractKeywords(`${goal.title} ${goal.description ?? ''}`))
  const linked = new Set(goal.relatedPersons)
  const matches: ConflictMatch[] = []
  for (const c of conflicts) {
    const byLinkedPerson = linked.has(c.personId)
    const shared = extractKeywords(c.note).filter((k) => goalKeywords.has(k))
    if (byLinkedPerson || shared.length > 0) {
      matches.push({
        personId: c.personId,
        personName: c.personName,
        date: c.date,
        sharedKeywords: shared,
        byLinkedPerson,
      })
    }
  }
  return matches.sort((a, b) => b.date.localeCompare(a.date))
}
