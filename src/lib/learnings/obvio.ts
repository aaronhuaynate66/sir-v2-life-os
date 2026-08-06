// SIR V2 — Descarta las "lecciones" que el sistema YA afirma por su cuenta. PURO.
//
// ═══ POR QUÉ, CON LA MEDICIÓN QUE LO MOTIVA ═══════════════════════════════════
//
// Medido el 6-ago-2026 contra producción: la tabla `learnings` tiene **6 filas**, y
// **5 son obviedades** que el prompt del sistema ya asserta por su cuenta:
//
//     [fact       medium x1] Aaron es peruano, no argentino
//     [preference medium x1] Aaron prefiere comunicarse en español peruano
//     [fact       medium x1] Aaron tiene una pareja llamada Diana
//     [pattern    medium x1] Aaron tiende a consultar sobre su pareja Diana frecuentemente
//     [principle  medium x1] Aaron valora mantener seguimiento activo de sus relaciones cercanas
//
// La sexta —el resultado del chequeo preventivo— es la única que enseña algo.
//
// Y `DERIVE_SYSTEM_PROMPT` **ya pide** "NO repitas lecciones que Aaron YA sabe" y
// "NO incluyas cosas efímeras". Las produjo igual. **Pedírselo al modelo no
// alcanza**, y esa es la misma conclusión que dejó el scrub de voseo: cuando la
// corrección es mecánica, se hace determinística y no se le ruega al LLM.
//
// El idioma y la pareja no son lecciones: el idioma es una regla dura del prompt y
// las personas viven en `people`, que se inyecta aparte. Ocupan lugar en el contexto
// y no cambian ninguna respuesta.
//
// ═══ POR QUÉ LA LISTA ES CORTA A PROPÓSITO ════════════════════════════════════
//
// Un filtro amplio se come lecciones de verdad, y ese error es peor: una lección
// perdida no deja rastro, mientras que una obviedad que pasa solo gasta tokens. Así
// que acá solo entra lo que el sistema afirma por su cuenta **en otro lado**, no
// todo lo que "suena genérico". Si hay duda, pasa.

/** Normaliza para comparar: minúsculas, sin tildes, espacios colapsados. */
function norm(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Patrones de lo que el sistema YA afirma sin ayuda de `learnings`.
 *
 * Cada uno lleva de dónde sale esa afirmación, para que se pueda auditar si algún
 * día deja de ser cierto (y entonces el patrón hay que sacarlo, no dejarlo tapando
 * una lección que sí haría falta).
 */
const YA_LO_SABE: ReadonlyArray<{ re: RegExp; porque: string }> = [
  // El idioma es una REGLA DURA del prompt (y hay un scrub determinístico encima).
  { re: /\b(es|no es) (peruano|argentino)\b/, porque: 'el idioma y el país son regla dura del prompt' },
  { re: /\bperuano,? no argentino\b/, porque: 'el idioma y el país son regla dura del prompt' },
  { re: /\b(prefiere|usa|habla) .{0,20}espanol (peruano|del peru)\b/, porque: 'el idioma es regla dura del prompt' },
  { re: /\bprefiere (comunicarse|hablar) en espanol\b/, porque: 'el idioma es regla dura del prompt' },
  { re: /\b(tuteo|vosear|voseo)\b/, porque: 'el idioma es regla dura del prompt + scrub determinístico' },
  // Las personas y su vínculo se inyectan desde `people`, no desde `learnings`.
  { re: /\btiene una (pareja|novia|esposa) llamada\b/, porque: 'el vínculo vive en `people`' },
  { re: /\b(diana|su pareja) es su (pareja|novia|enamorada)\b/, porque: 'el vínculo vive en `people`' },
]

/**
 * ¿Esta lección es una obviedad que el sistema ya afirma por su cuenta?
 *
 * Devuelve el MOTIVO (para poder reportarlo) o null si la lección pasa. PURA.
 */
export function motivoDeObviedad(text: string): string | null {
  const t = norm(text)
  if (t.length === 0) return 'texto vacío'
  for (const p of YA_LO_SABE) {
    if (p.re.test(t)) return p.porque
  }
  return null
}

/** Azúcar booleano de `motivoDeObviedad`. PURA. */
export function esAprendizajeObvio(text: string): boolean {
  return motivoDeObviedad(text) !== null
}
