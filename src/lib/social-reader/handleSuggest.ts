// SIR V2 — Sugerir a QUIÉN pertenece un @handle, cruzándolo contra los contactos
// que YA existen.
//
// POR QUÉ, y en qué se diferencia de lo que ya había: `handleToProbableName`
// (whoIsWho.ts) ADIVINA un nombre desde el handle troceándolo — y se midió que da
// basura el 56% de las veces, porque no mira los contactos reales. Esto hace lo
// contrario: no inventa nombres, BUSCA cuál de los contactos de Aaron encaja con
// ese handle. "@lauralfaroh" no se convierte en "Lauralfaroh", se resuelve a
// "Laura Alfaro" porque esa persona existe en su red.
//
// El caso de uso inmediato (28-jul): Aaron no tiene acceso a la otra PC, así que
// el catálogo de seguidos —que es de donde saldrían los nombres reales— no se
// puede correr. Sin esto, el Excel de identidades le deja 141 filas con solo el
// handle y una foto. Con esto, las que llevan el nombre adentro llegan resueltas.
//
// NUNCA decide solo: devuelve una sugerencia con puntaje y el motivo, para que
// Aaron confirme. Un contacto mal nombrado envenena el auto-match y cuesta más
// que una fila sin resolver.
//
// PURO: cero red, cero IA.

import { pistaDebilEnHandle, pistaFuerteEnHandle } from './orgLexicon'

/** Contacto mínimo contra el que se compara. */
export interface SuggestCandidate {
  id: string
  name: string
}

export interface HandleSuggestion {
  candidate: SuggestCandidate
  /** 0..100. Ver UMBRAL_SUGERENCIA para lo que vale mostrar. */
  score: number
  /** Por qué se sugirió, en palabras. Va al Excel para que Aaron juzgue. */
  reason: string
}

/**
 * Debajo de esto no se sugiere nada: preferimos vacío a una pista mala.
 *
 * CALIBRADO contra los 141 handles reales de Aaron (28-jul). Con el umbral en 55
 * salieron 8 sugerencias y **las 8 estaban mal**, porque el tramo de "solo el
 * nombre de pila" matchea subcadenas: `@giancarlopostigo` → "Carlo Rodríguez"
 * (el "carlo" vive DENTRO de "giancarlo"), `@carlosampuerooficial` → "Carlo
 * Rodríguez", `@carlo_pezo` → idem. Y el tramo de "solo apellido" propuso a una
 * persona para `@jimenezabogados.legal`, que es un estudio de abogados.
 *
 * En 80 solo sobreviven los tramos que exigen NOMBRE **y** APELLIDO en el mismo
 * handle. Sobre su data eso da cero sugerencias — que es la respuesta honesta:
 * los 141 sin asignar son justo los handles no parlantes. Los que sí llevaban el
 * nombre adentro ya estaban asignados.
 */
export const UMBRAL_SUGERENCIA = 80

/** Minúsculas, sin tildes, solo letras y números. */
function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
}

/** Tokens del nombre, sin partículas que no identifican. */
const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'da', 'do', 'van', 'von', 'san'])

export function nameTokens(name: string): string[] {
  return name
    .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !PARTICULAS.has(t))
}

/** Handle sin @, sin dígitos ni separadores: "dayana.rr_12" → "dayanarr". */
export function handleCore(handle: string): string {
  return norm(String(handle ?? '').replace(/^@/, '').replace(/\d+/g, ''))
}

/**
 * Puntúa cuánto encaja un handle con UN nombre. Explicable a propósito: cada
 * rama dice por qué, así la sugerencia se puede defender o descartar de un
 * vistazo en vez de confiar en un número opaco.
 */
export function scoreHandleAgainstName(handle: string, name: string): { score: number; reason: string } {
  const h = handleCore(handle)
  const tokens = nameTokens(name)
  if (!h || tokens.length === 0) return { score: 0, reason: '' }

  const juntos = tokens.join('')
  const nombre = tokens[0]
  const apellidos = tokens.slice(1)

  // Concatenación exacta: "miluskacastillo" ↔ "Miluska Castillo".
  if (h === juntos) return { score: 100, reason: 'el handle es su nombre completo' }
  // Nombre + inicial(es) del apellido: "lauralfaroh" ↔ "Laura Alfaro".
  if (juntos.startsWith(h) && h.length >= Math.min(8, juntos.length - 2)) {
    return { score: 92, reason: 'el handle es su nombre completo abreviado' }
  }

  const tieneNombre = nombre.length >= 4 && h.includes(nombre)
  const apellidoEntero = apellidos.find((a) => a.length >= 5 && h.includes(a))
  const apellidoParcial = apellidos.find((a) => a.length >= 4 && h.includes(a.slice(0, 4)))

  if (tieneNombre && apellidoEntero) return { score: 95, reason: `contiene "${nombre}" y "${apellidoEntero}"` }
  if (tieneNombre && apellidoParcial) return { score: 80, reason: `contiene "${nombre}" y el arranque de "${apellidoParcial}"` }
  // Solo el apellido completo y largo: distintivo, pero podría ser un familiar.
  if (apellidoEntero && apellidoEntero.length >= 6) {
    return { score: 62, reason: `contiene el apellido "${apellidoEntero}" (¿o un familiar?)` }
  }
  // Solo el nombre de pila: débil — hay muchos Diana, muchos Jorge.
  if (tieneNombre && nombre.length >= 5) {
    return { score: 56, reason: `contiene solo "${nombre}" — puede ser otra persona` }
  }
  return { score: 0, reason: '' }
}

/**
 * La MEJOR sugerencia para un handle entre los contactos dados, o null.
 *
 * Si dos contactos empatan en el mejor puntaje, devuelve null: sugerir uno al
 * azar entre "Laura Alfaro" y "Laura Silva" es peor que no sugerir, porque
 * invita a confirmar sin mirar.
 */
export function suggestForHandle(
  handle: string,
  candidates: SuggestCandidate[],
): HandleSuggestion | null {
  let best: HandleSuggestion | null = null
  let empatados = 0
  for (const c of candidates) {
    const { score, reason } = scoreHandleAgainstName(handle, c.name)
    if (score < UMBRAL_SUGERENCIA) continue
    if (!best || score > best.score) { best = { candidate: c, score, reason }; empatados = 1 }
    else if (score === best.score) empatados++
  }
  if (!best || empatados > 1) return null
  return best
}

// ── ¿Parece una cuenta de negocio por el propio handle? ──────────────────────
//
// Sirve para que Aaron descarte en lote sin abrir la foto. Es una PISTA, no un
// veredicto: `looksLikeOrg` (igProfile.ts) decide con seguidores y categoría, que
// es evidencia mucho más fuerte — pero eso exige que el reader haya visitado el
// perfil, y hoy no corrió.
// El léxico ya NO vive acá: está en orgLexicon.ts, uno solo para el nombre y para
// el handle. Tener dos listas hizo que esta se quedara sin 'airguns', 'uniformes',
// 'club', 'comunidad' ni 'diario' cuando la otra sí las tenía, y por eso
// @impalaairguns y @clubdecaballeros pasaban como personas. Medido sobre las 103
// cuentas reales de la bandeja: de 27 marcadas a 44, sin falsos positivos nuevos.

export function looksLikeBusinessHandle(handle: string): string | null {
  if (!handleCore(handle)) return null
  // El léxico vive en orgLexicon.ts, UNO SOLO. Antes había una lista acá y otra en
  // entityKind.ts, y se separaron: esta nunca recibió 'airguns', 'uniformes',
  // 'club', 'comunidad' ni 'diario', así que @impalaairguns y @clubdecaballeros
  // pasaban como personas aunque la otra lista sí tuviera la palabra.
  // Acá valen las pistas DÉBILES ('oficial') además de las fuertes: esta función
  // es una PISTA para descartar en lote mirando solo el @, no un veredicto. La
  // distinción fuerte/débil la usa `clasificarCuenta` (orgVerdict.ts), que sí
  // decide si algo se puede PROPONER como organización sin preguntar.
  const hit = pistaFuerteEnHandle(handle) ?? pistaDebilEnHandle(handle)
  return hit ? `el handle dice "${hit}"` : null
}
