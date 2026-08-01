// SIR V2 — Scrubber DETERMINÍSTICO voseo/rioplatense → tuteo peruano.
//
// La regla anti-voseo del prompt es fuerte pero el modelo IGUAL se resbala (el
// harness de eval cazó "querés" en una respuesta real). Reforzar el prompt no
// garantiza nada; esto SÍ: se pasa sobre la salida del LLM antes de devolverla,
// así el voseo nunca llega a Aaron (chat web y Telegram). [[idioma-espanol-peru]]
//
// CONSERVADOR: solo formas INEQUÍVOCAS del voseo (conjugaciones -és/-ás de 2ª
// persona, sos, vos, imperativos rioplatenses). NO toca ambiguas ("dale", "acá",
// "allá") que en Perú también se usan — evita falsos positivos.

/** Pares [forma voseo, tuteo]. La clave se compila a regex con \b y flag gi. */
const REPLACEMENTS: ReadonlyArray<readonly [string, string]> = [
  // Conjugaciones voseo (presente): -és / -ás
  ['tenés', 'tienes'], ['querés', 'quieres'], ['podés', 'puedes'], ['sabés', 'sabes'],
  ['hacés', 'haces'], ['decís', 'dices'], ['venís', 'vienes'], ['sentís', 'sientes'],
  ['vivís', 'vives'], ['ponés', 'pones'], ['salís', 'sales'], ['tenés que', 'tienes que'],
  ['creés', 'crees'], ['leés', 'lees'], ['vés', 'ves'], ['andás', 'andas'], ['estás vos', 'estás tú'],
  // Más presentes -és/-ás (el harness cazó "debés"). NO incluir "tomás" (choca con
  // el nombre Tomás); el imperativo "tomá" ya está cubierto más abajo.
  ['debés', 'debes'], ['necesitás', 'necesitas'], ['pensás', 'piensas'], ['hablás', 'hablas'],
  ['buscás', 'buscas'], ['llamás', 'llamas'], ['usás', 'usas'], ['trabajás', 'trabajas'],
  ['dejás', 'dejas'], ['mandás', 'mandas'], ['mirás', 'miras'], ['pasás', 'pasas'],
  ['quedás', 'quedas'], ['tratás', 'tratas'], ['entendés', 'entiendes'], ['respondés', 'respondes'],
  ['elegís', 'eliges'], ['seguís', 'sigues'], ['pedís', 'pides'], ['preferís', 'prefieres'],
  ['recibís', 'recibes'], ['conseguís', 'consigues'], ['escribís', 'escribes'],
  // Más -ís (el harness cazó "te referís"). Inequívocas, sin choque con nombres.
  ['referís', 'refieres'], ['sugerís', 'sugieres'], ['corregís', 'corriges'],
  ['repetís', 'repites'], ['servís', 'sirves'], ['medís', 'mides'], ['subís', 'subes'],
  ['definís', 'defines'], ['decidís', 'decides'], ['cumplís', 'cumples'], ['exigís', 'exiges'],
  // Ser
  ['sos', 'eres'],
  // Imperativos rioplatenses → tuteo peruano
  ['decime', 'dime'], ['contame', 'cuéntame'], ['mirá', 'mira'], ['fijate', 'fíjate'],
  ['ponete', 'ponte'], ['ponételo', 'póntelo'], ['escribile', 'escríbele'], ['mandale', 'mándale'],
  ['andá', 'anda'], ['dejá', 'deja'], ['tomá', 'toma'], ['esperá', 'espera'], ['pará', 'para'],
  ['vení', 'ven'], ['acordate', 'acuérdate'], ['quedate', 'quédate'], ['calmate', 'cálmate'],
  ['fijáte', 'fíjate'], ['dale que', 'vamos que'],
  // Imperativo + enclítico: en tuteo peruano SIEMPRE llevan tilde esdrújula
  // ("mandame"→"mándame"). Cazado en vivo el 25-jul. Lista fija a propósito:
  // hay palabras legítimas con esa forma (tomate, dame, llame) que no se tocan.
  ['mandame', 'mándame'], ['avisame', 'avísame'], ['llamame', 'llámame'],
  ['escribime', 'escríbeme'], ['dejame', 'déjame'], ['pasame', 'pásame'],
  ['mostrame', 'muéstrame'], ['traeme', 'tráeme'], ['ayudame', 'ayúdame'],
  ['esperame', 'espérame'], ['preguntame', 'pregúntame'], ['explicame', 'explícame'],
  ['contale', 'cuéntale'], ['decile', 'dile'], ['avisale', 'avísale'],
  // Enclítico -nos (mismo criterio: en tuteo peruano llevan tilde esdrújula).
  ['mandanos', 'mándanos'], ['avisanos', 'avísanos'], ['contanos', 'cuéntanos'],
  ['pasanos', 'pásanos'], ['dejanos', 'déjanos'], ['mostranos', 'muéstranos'],
  ['decinos', 'dinos'], ['escribinos', 'escríbenos'],
  ['cuidate', 'cuídate'], ['sentate', 'siéntate'], ['levantate', 'levántate'],
  ['acercate', 'acércate'], ['relajate', 'relájate'], ['olvidate', 'olvídate'],
  ['preparate', 'prepárate'], ['enfocate', 'enfócate'], ['concentrate', 'concéntrate'],
  ['asegurate', 'asegúrate'], ['apurate', 'apúrate'], ['animate', 'anímate'],
  ['enterate', 'entérate'], ['organizate', 'organízate'], ['ocupate', 'ocúpate'],
  ['encargate', 'encárgate'], ['ubicate', 'ubícate'], ['alejate', 'aléjate'],
  // Imperativo + objeto directo ("bajalo" lo cazó el eval del 25-jul). También
  // lista fija: hay palabras legítimas con esa forma (regalo, palo, halo, malo).
  ['bajalo', 'bájalo'], ['bajala', 'bájala'], ['subilo', 'súbelo'], ['subila', 'súbela'],
  ['mandalo', 'mándalo'], ['mandala', 'mándala'], ['hacelo', 'hazlo'], ['hacela', 'hazla'],
  ['decilo', 'dilo'], ['decila', 'dila'], ['ponelo', 'ponlo'], ['ponela', 'ponla'],
  ['dejalo', 'déjalo'], ['dejala', 'déjala'], ['tomalo', 'tómalo'], ['tomala', 'tómala'],
  ['buscalo', 'búscalo'], ['buscala', 'búscala'], ['escribilo', 'escríbelo'],
  ['contalo', 'cuéntalo'], ['cerralo', 'ciérralo'], ['cerrala', 'ciérrala'],
  ['revisalo', 'revísalo'], ['revisala', 'revísala'], ['agendalo', 'agéndalo'],
  ['marcalo', 'márcalo'], ['anotalo', 'anótalo'], ['guardalo', 'guárdalo'],
  ['mandaselo', 'mándaselo'], ['pedile', 'pídele'], ['preguntale', 'pregúntale'],
  ['respondele', 'respóndele'], ['llamalo', 'llámalo'], ['llamala', 'llámala'],
  ['registralo', 'regístralo'], ['registrala', 'regístrala'], ['apuntalo', 'apúntalo'],
  ['relanzalo', 'relánzalo'], ['activalo', 'actívalo'], ['recargalo', 'recárgalo'],
  ['actualizalo', 'actualízalo'], ['instalalo', 'instálalo'], ['probalo', 'pruébalo'],
  ['fijalo', 'fíjalo'], ['fijala', 'fíjala'], ['abrilo', 'ábrelo'], ['abrila', 'ábrela'],
  ['reportalo', 'repórtalo'], ['mantenelo', 'mantenlo'], ['pasaselo', 'pásaselo'],
  ['dejaselo', 'déjaselo'], ['mostraselo', 'muéstraselo'], ['contaselo', 'cuéntaselo'],
  // Imperativos -á cuya raíz TERMINA EN R: el barrido generativo los excluye a
  // propósito (ahí viven los futuros: "pagará", "tendrás"), así que van a mano.
  // "Cerrá el día" se coló al evening-push justo por este hueco.
  ['cerrá', 'cierra'], ['esperá', 'espera'], ['mejorá', 'mejora'], ['recordá', 'recuerda'],
  ['entrá', 'entra'], ['mostrá', 'muestra'], ['comprá', 'compra'], ['guardá', 'guarda'],
  // Presentes -ás de verbos que DIPTONGAN (recordás→recuerdas, no "recordas"):
  // el barrido generativo de abajo solo quita la tilde, así que los irregulares
  // tienen que resolverse acá ANTES. Cazados en respuestas reales de SIR.
  ['recordás', 'recuerdas'], ['acordás', 'acuerdas'], ['contás', 'cuentas'],
  ['encontrás', 'encuentras'], ['mostrás', 'muestras'], ['probás', 'pruebas'],
  ['empezás', 'empiezas'], ['comenzás', 'comienzas'], ['cerrás', 'cierras'],
  ['despertás', 'despiertas'], ['jugás', 'juegas'], ['soñás', 'sueñas'],
  ['volás', 'vuelas'], ['colgás', 'cuelgas'], ['perdés', 'pierdes'],
  ['volvés', 'vuelves'], ['movés', 'mueves'], ['dormís', 'duermes'],
  // IMPERATIVOS de esos mismos verbos que DIPTONGAN. Faltaban, y el hueco no
  // dejaba pasar voseo: producía ESPAÑOL ROTO. El barrido de abajo solo quita la
  // tilde, así que "probá" salía "proba" y "empezá" salía "empeza" — peor que el
  // voseo original, porque no existe. Medido el 30-jul corriendo `detectVoseo`
  // sobre los .md del repo. Van ANTES del barrido, igual que sus presentes.
  ['probá', 'prueba'], ['empezá', 'empieza'], ['pensá', 'piensa'],
  ['contá', 'cuenta'], ['encontrá', 'encuentra'], ['acordá', 'acuerda'],
  ['comenzá', 'comienza'], ['despertá', 'despierta'], ['calentá', 'calienta'],
  ['sentá', 'sienta'], ['almorzá', 'almuerza'], ['colgá', 'cuelga'],
  ['jugá', 'juega'], ['soñá', 'sueña'], ['volá', 'vuela'], ['forzá', 'fuerza'],
  ['demostrá', 'demuestra'],
  // Presentes -ás con raíz que TERMINA EN R: el barrido los excluye (ahí viven
  // los futuros) y solo estaban sus imperativos, así que estos se escapaban.
  ['entrás', 'entras'], ['esperás', 'esperas'], ['guardás', 'guardas'],
  ['comprás', 'compras'], ['mejorás', 'mejoras'], ['demostrás', 'demuestras'],
  ['ahorrás', 'ahorras'], ['cobrás', 'cobras'],
  // Raíz en R que faltaba, medida el 1-ago barriendo TODO el repo con detectVoseo:
  // "registrás" aparecía 4 veces y "registrá" 2, y pasaban intactas. El futuro no
  // colisiona ("registrará" no contiene "registrá": ahí va una R antes de la tilde).
  ['registrá', 'registra'], ['registrás', 'registras'],
  ['generás', 'generas'], ['capturá', 'captura'], ['capturás', 'capturas'],
  ['arrastrá', 'arrastra'], ['arrastrás', 'arrastras'], ['repará', 'repara'],
  ['integrá', 'integra'], ['integrás', 'integras'], ['filtrá', 'filtra'],
  ['filtrás', 'filtras'], ['administrá', 'administra'], ['compará', 'compara'],
  ['aclará', 'aclara'], ['explorá', 'explora'], ['valorá', 'valora'],
  // Imperativos -á con raíz en R que faltaban (mismo hueco del barrido).
  ['ahorrá', 'ahorra'], ['agarrá', 'agarra'], ['borrá', 'borra'],
  ['cobrá', 'cobra'], ['ignorá', 'ignora'], ['apurá', 'apura'],
  ['asegurá', 'asegura'], ['considerá', 'considera'], ['generá', 'genera'],
  ['separá', 'separa'], ['prepará', 'prepara'], ['llorá', 'llora'],
  // Imperativos de verbos -ER (terminan en -é). El barrido NO puede tocarlos por
  // regla: "-é" también es el pretérito de 1ª persona de los verbos -AR ("yo
  // tomé", "yo pensé", "yo cerré"), y sin léxico de verbos no hay forma mecánica
  // de distinguir "comé" (voseo de comer) de "tomé" (pretérito de tomar). Lista
  // fija a propósito, solo verbos -ER cuya forma no choca con nada.
  // EXCLUIDOS por colisión real: "bebé" (= el bebé), "creé" (= yo creé, de crear).
  ['volvé', 'vuelve'], ['perdé', 'pierde'], ['entendé', 'entiende'],
  ['atendé', 'atiende'], ['encendé', 'enciende'], ['defendé', 'defiende'],
  ['queré', 'quiere'], ['mové', 'mueve'], ['tené', 'ten'], ['poné', 'pon'],
  ['hacé', 'haz'], ['comé', 'come'], ['corré', 'corre'], ['aprendé', 'aprende'],
  ['respondé', 'responde'], ['vendé', 'vende'], ['prendé', 'prende'],
  ['meté', 'mete'], ['rompé', 'rompe'], ['escogé', 'escoge'], ['leé', 'lee'],
  // Sus PRESENTES -és. El barrido solo cubre -á/-ás, así que estos también van a
  // mano (medido: "comés" pasaba intacto con "comé" ya en la lista).
  ['comés', 'comes'], ['corrés', 'corres'], ['aprendés', 'aprendes'],
  ['vendés', 'vendes'], ['prendés', 'prendes'], ['metés', 'metes'],
  ['rompés', 'rompes'], ['escogés', 'escoges'], ['atendés', 'atiendes'],
  ['encendés', 'enciendes'], ['defendés', 'defiendes'],
  // Imperativos -ir: SOLO los que no chocan con el pretérito de 1ª persona.
  // "vení"→ven vale (el pretérito es "vine"); "decí"→di vale ("dije"). El resto
  // es intocable de forma determinística: "dormí", "pedí", "seguí", "sentí",
  // "escribí", "salí", "viví", "decidí" son pretéritos legítimos en peruano
  // ("ayer dormí mal") y corregirlos rompería frases correctas de Aaron.
  ['decí', 'di'],
  // Imperativos/presentes de 3 letras: por debajo del piso de largo del barrido.
  ['usá', 'usa'], ['usás', 'usas'],
  // Pronombre TÉRMINO DE PREPOSICIÓN: va ANTES de la regla suelta de abajo, que
  // se aplica en orden. "a vos" no es "a tú" — es "a ti", y "con vos" es
  // "contigo". Cazado el 1-ago barriendo el repo: un comentario decía "te
  // pregunta —a vos, nunca a terceros—" y el scrub lo dejaba en "a tú", que no
  // existe en ningún español. El voseo se corrige o no se toca; producir
  // castellano roto es peor que dejar el voseo (misma lección que 'probá'→'proba').
  ['con vos', 'contigo'], ['sin vos', 'sin ti'], ['a vos', 'a ti'],
  ['para vos', 'para ti'], ['de vos', 'de ti'], ['en vos', 'en ti'],
  ['por vos', 'por ti'], ['hacia vos', 'hacia ti'], ['sobre vos', 'sobre ti'],
  ['contra vos', 'contra ti'], ['según vos', 'según tú'], ['hasta vos', 'hasta ti'],
  // Pronombre en función de SUJETO ("vos sabés" → "tú sabes").
  ['vos', 'tú'],
]

// —— Barrido GENERATIVO de imperativos/presentes voseo ——————————————————
//
// La lista de arriba es una lista blanca: cada sesión se escapa un verbo nuevo
// ("revisá", "agendá"). Para los REGULARES la corrección es mecánica —quitar la
// tilde final: "revisá"→"revisa", "revisás"→"revisas"— así que se hace por regla
// y no por enumeración. Solo aplica donde es INEQUÍVOCO:
//   - termina en "á"/"ás" y la penúltima letra NO es "r" → deja fuera todos los
//     futuros ("pagará", "pagarás", "será", "verás"), que son legítimos.
//   - largo mínimo → deja fuera "está", "acá", "allá", "mamá", "papá", "sofá",
//     "estás", "demás", "atrás", "jamás", "quizás".
//   - lista corta de excepciones para lo que sobrevive (topónimos, "ojalá").
// Los irregulares que diptongan ya fueron reemplazados arriba.
const ACCENT_EXCEPTIONS = new Set([
  // Palabras y nombres largos que legítimamente llevan tilde final.
  'ojalá', 'quizá', 'panamá', 'bogotá', 'canadá', 'paraná', 'maracaná',
  'nicolás', 'quizás', 'además', 'compás', 'detrás',
  // Cortas: antes las cubría el piso de largo (5 con -á, 7 con -ás). El piso se
  // bajó a 4/5 para alcanzar el voseo corto real ("bajá", "pasá", "tocá",
  // "pagás", "sacás"), que se escapaba entero, así que ahora se enumeran.
  'está', 'allá', 'mamá', 'papá', 'sofá', 'maná', 'aupá', 'hurrá',
  'estás', 'demás', 'atrás', 'jamás',
  // "tomás": el nombre propio gana sobre el voseo de "tomar" — misma decisión ya
  // tomada al dejar 'tomás' fuera de la lista de reemplazos ("choca con el
  // nombre Tomás"). El imperativo "tomá" sí se corrige, ahí no hay choque.
  'tomás',
])
const GENERATIVE_VOSEO = /(?<![a-záéíóúüñ])([a-záéíóúüñ]{2,})(á|Á)(s?)(?![a-záéíóúüñ])/gi

/** Quita la tilde final del voseo REGULAR (-á/-ás) cuando es inequívoco. PURO. */
function scrubGenerativeVoseo(text: string): string {
  return text.replace(GENERATIVE_VOSEO, (match, stem: string, tilde: string, s: string) => {
    const lower = match.toLowerCase()
    // Largo mínimo: 4 con -á y 5 con -ás. Deja fuera las de 3 letras ("acá",
    // "ajá", "usá") — ahí la relación señal/ruido no alcanza y el voseo corto
    // real que importa va en la lista fija. Lo de 4-5 letras que es legítimo
    // ("está", "mamá", "estás", "jamás"…) se enumera en ACCENT_EXCEPTIONS.
    if (lower.length < (s ? 5 : 4)) return match
    if (ACCENT_EXCEPTIONS.has(lower)) return match
    // Futuro: la sílaba tónica cae sobre "rá" ("pagará", "tendrás", "verás").
    if (stem.toLowerCase().endsWith('r')) return match
    return `${stem}${tilde === 'Á' ? 'A' : 'a'}${s}`
  })
}

/** Aplica la misma capitalización del original (primera letra) al reemplazo. */
function matchCase(original: string, replacement: string): string {
  if (original.length === 0) return replacement
  if (original[0] === original[0].toUpperCase() && original[0] !== original[0].toLowerCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1)
  }
  return replacement
}

// Fronteras propias en vez de \b: en JS \b se basa en \w (sin acentos), así que
// "mirá " no tenía boundary tras "á". Los lookarounds excluyen letras acentuadas.
const LETTER = 'a-záéíóúüñ'
const COMPILED = REPLACEMENTS.map(([from, to]) =>
  [new RegExp(`(?<![${LETTER}])(?:${from.replace(/\s+/g, '\\s+')})(?![${LETTER}])`, 'gi'), to] as const,
)

/**
 * Formas de voseo que quedan en un texto, sin corregirlo. PURA.
 *
 * Es el MISMO criterio que usa el scrub, así que si esto devuelve [] el texto ya
 * está limpio. Existe para MEDIR: el LLM-juez del harness de eval acusaba voseo
 * inexistente ("podés", "tenés") en respuestas que el scrub ya había limpiado —
 * y bajaba el score de un caso perfecto a 0. El idioma es verificable, no
 * opinable: se mide, no se le pregunta a un modelo.
 */
export function detectVoseo(text: string): string[] {
  if (!text) return []
  const found = new Set<string>()
  for (const [re] of COMPILED) {
    for (const m of text.matchAll(new RegExp(re.source, 'gi'))) found.add(m[0].toLowerCase())
  }
  // El barrido generativo: si cambia algo, había voseo regular (-á/-ás).
  const scrubbed = scrubGenerativeVoseo(text)
  if (scrubbed !== text) {
    const orig = text.split(/\s+/)
    const fixed = scrubbed.split(/\s+/)
    for (let i = 0; i < orig.length && i < fixed.length; i++) {
      if (orig[i] !== fixed[i]) found.add(orig[i].toLowerCase().replace(/[^a-záéíóúüñ]/g, ''))
    }
  }
  return [...found].filter(Boolean)
}

/**
 * Reemplaza voseo/rioplatense por tuteo peruano en un texto. PURO. Preserva
 * mayúsculas de inicio. Idempotente (correr dos veces = una).
 */
export function deVoseo(text: string): string {
  if (!text) return text
  let out = text
  for (const [re, to] of COMPILED) {
    out = out.replace(re, (m) => matchCase(m, to))
  }
  // Después de la lista blanca (que ya resolvió los irregulares que diptongan),
  // el barrido mecánico caza la cola larga: "revisá", "agendá", "revisás"…
  return scrubGenerativeVoseo(out)
}
