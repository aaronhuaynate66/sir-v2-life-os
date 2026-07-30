// SIR V2 — cazar la afirmación de haber guardado algo que NO se guardó.
//
// POR QUÉ EXISTE (fallo real, 29-jul-2026 19:44). Aaron le escribió por Telegram:
//
//     "A diana Díaz le vino la regla recién ayer"
//
// y SIR contestó: *"gracias por actualizarme … Acabo de recalcular su ciclo desde
// esa fecha"*. No recalculó nada. No insertó la fila en `person_cycles`, no dejó
// una acción pendiente, no llamó a ninguna tool. Nueve horas después el ancla del
// ciclo de Diana Díaz seguía en el 26-may — 64 días vieja — y el brief del día
// siguiente iba a estimar la fase con esa data podrida.
//
// Lo grave no es el dato perdido: es que él CREE que SIR ya lo sabe. Un dato que
// falta se nota; un dato que uno cree entregado, no.
//
// LA VÍA DEL PROMPT YA ESTABA AGOTADA. La regla del sistema prohíbe esto de forma
// explícita —"PROHIBIDO decir 'listo', 'te lo marco', 'ya lo agendé/anoté' o
// similar SIN haber llamado a la tool"— y la descripción de la tool incluso trae
// la frase textual "le vino la regla ayer" y un "NUNCA digas que ya lo guardaste
// sin llamar a esta tool". El modelo la ignoró igual. Es el mismo patrón del
// voseo: el prompt lo prohíbe, el modelo se resbala, y la única garantía es un
// scrub determinístico sobre la salida.
//
// PURO.

/** Verbos de escritura en primera persona del pasado. Si aparecen sin tool, es falso. */
const VERBOS = [
  'registré', 'anoté', 'guardé', 'marqué', 'agendé', 'actualicé', 'apunté',
  'recalculé', 'creé', 'añadí', 'agregué',
]

/** "acabo de registrar", "acabo de anotar"… */
const ACABO_DE = /\bacabo de (registrar|anotar|guardar|marcar|agendar|actualizar|recalcular|apuntar|crear|añadir|agregar)\b/i

/** Participios usados como confirmación al arranque de una línea: "Anotado:", "Listo". */
const CONFIRMACION = /^[\s>*_·-]*(listo|hecho|anotado|registrado|guardado|agendado|actualizado)\b/im

/**
 * ¿La respuesta afirma haber guardado algo? Devuelve la frase que lo delata, o
 * null.
 *
 * OJO CON LAS NEGACIONES Y EL ESTADO PREEXISTENTE: "no lo registré" y "ya lo
 * tengo anotado" NO son afirmaciones de una escritura nueva. La primera es
 * justamente la respuesta honesta que queremos permitir; la segunda habla de data
 * que ya existía. Confundirlas haría que el guard dispare sobre respuestas
 * correctas, y un guard que grita en falso se vuelve ruido y termina apagado.
 */
export function afirmaEscritura(respuesta: string): string | null {
  const texto = String(respuesta ?? '')
  if (!texto) return null

  const m = ACABO_DE.exec(texto)
  if (m && !negadoAntes(texto, m.index)) return m[0]

  const reVerbos = palabra(VERBOS.join('|'), 'gi')
  let hit: RegExpExecArray | null
  while ((hit = reVerbos.exec(texto)) !== null) {
    if (!negadoAntes(texto, hit.index)) return hit[0]
  }

  const c = CONFIRMACION.exec(texto)
  if (c && !negadoAntes(texto, c.index)) return c[0].trim()

  return null
}

/**
 * Bordes de palabra que funcionan en español.
 *
 * `\b` de JavaScript NO sirve acá: `\w` es [A-Za-z0-9_], así que una vocal
 * acentuada cuenta como carácter NO-palabra y no hay frontera después de ella.
 * `\banoté\b` no matchea "Ya lo anoté." —la é y el punto son los dos no-palabra—
 * y justamente TODOS estos verbos terminan en tilde. El primer intento de este
 * módulo solo pescaba "acabo de recalcular", que termina en consonante.
 */
const LETRA = 'a-záéíóúüñ'
function palabra(cuerpo: string, banderas = 'i'): RegExp {
  return new RegExp(`(?<![${LETRA}])(?:${cuerpo})(?![${LETRA}])`, banderas)
}

/** ¿Hay un "no"/"todavía no"/"tengo" en los ~24 caracteres previos? */
function negadoAntes(texto: string, indice: number): boolean {
  const antes = texto.slice(Math.max(0, indice - 24), indice).toLowerCase()
  // 'tengo/tenía anotado' y 'está registrado' = data que ya existía, no una
  // escritura nueva.
  return palabra('no|nunca|tengo|tenía|está|estaba|estuvo').test(antes)
}

/** Lo que se le agrega cuando lo pescamos. Sin markdown: esto sale por Telegram. */
export const AVISO =
  '⚠️ Corrección automática: arriba te dije que lo guardé, pero NO lo guardé — '
  + 'no llegué a llamar a la herramienta que lo anota, así que ese dato NO está en tu SIR. '
  + 'Vuelve a decírmelo y esta vez te lo propongo para que lo confirmes.'

/**
 * Corrige la respuesta si afirma una escritura que no ocurrió.
 *
 * Se AGREGA un aviso en vez de reescribir la prosa: el análisis que dio SIR suele
 * ser útil (en el caso real calculó bien la fase del ciclo) y lo único falso es la
 * afirmación de haber guardado. Y un aviso visible es mejor que una corrección
 * invisible: que él vea el bocinazo es preferible a que crea un dato que no está.
 */
export function corregirFalsaEscritura(
  respuesta: string,
  opts: { huboTool: boolean },
): { respuesta: string; corregida: boolean; frase: string | null } {
  // Si propuso una acción, la afirmación es legítima: el flujo sigue con la
  // confirmación de Aaron.
  if (opts.huboTool) return { respuesta, corregida: false, frase: null }

  const frase = afirmaEscritura(respuesta)
  if (!frase) return { respuesta, corregida: false, frase: null }

  return { respuesta: `${respuesta.trimEnd()}\n\n${AVISO}`, corregida: true, frase }
}
