// SIR V2 — ¿lo que Aaron escribió es una PERSONA, una ORGANIZACIÓN, o no es un
// nombre usable?
//
// POR QUÉ EXISTE (28-jul-2026). Aaron llenó el Excel de identidades con 70 nombres
// y avisó del riesgo antes de que lo importáramos:
//
//   "hay que tener cuidado porque algunos son páginas simplemente de branding, o de
//    empresas o de negocios; por ejemplo está la página de bomberos salamanca 127,
//    en la cual yo soy bombero, y varios de mis contactos son bomberos en esa unidad
//    como daniel francia, y a su vez esa unidad le responde al cuerpo general de
//    bomberos voluntarios del perú"
//
// Tenía razón: importar los 70 como personas habría creado "Bomberos Salamanca 127"
// como si fuera un contacto. Eso no es un dato incompleto, es un dato FALSO — y
// además tira a la basura la estructura real (unidad → CGBVP), que `org_profiles`
// ya sabe modelar con `parent_org` y nadie había poblado.
//
// Y dos problemas más del llenado a mano, que este módulo también ataja:
//   · 2 filas decían "Si" en la columna del nombre (respondió, no nombró).
//   · ~8 quedaron truncadas a 5 letras — "Impal" por @impalaairguns, "Ecofl" por
//     @ecoflow_market_peru, "Yayoc" por @yayocastaneda.pe. Crear "Impal" como
//     contacto es peor que dejar la fila pendiente.
//
// PURO. Ante la duda devuelve 'person' (el caso mayoritario) o 'invalid' cuando el
// texto claramente no sirve — nunca inventa una organización.
//
// El léxico de organizaciones vive en orgLexicon.ts, compartido con el análisis del
// handle. Antes había una lista acá y otra allá, y se separaron: la del handle se
// quedó sin 'airguns', 'uniformes', 'club', 'comunidad' ni 'diario' —palabras que
// ESTA lista sí tenía— así que @impalaairguns y @clubdecaballeros pasaban como
// personas. Dos copias de la misma verdad siempre se separan.

import { pistaEnTexto } from './orgLexicon'

/** Respuestas que NO son un nombre: Aaron contestó la pregunta en vez de nombrar. */
const NO_ES_NOMBRE = new Set([
  'si', 'sí', 'no', 'ok', 'oka', 'x', 'xx', 'ya', 'yes', 'nose', 'no se', 'ninguno',
  'negocio', 'empresa', 'pagina', 'página', 'marca', 'branding', 'desconocido',
])

/**
 * Marcadores de que la nota habla de una PERSONA. Vetan la clasificación de
 * organización, porque describen la PROFESIÓN o el VÍNCULO de alguien —no la
 * naturaleza de la cuenta. "trabaja en una productora" y "exoficial del ejército"
 * son currículum, no razón social.
 */
const ES_PERSONA = /\b(influencer|youtuber|streamer|exalumno|ex alumno|alumn[oa]|amig[oa]|compa[nñ]er|colega|profesor|maestr[oa]|vecin[oa]|prim[oa]|herman[oa]|ti[oa]\b|sobrin[oa]|cu[nñ]ad[oa]|suegr[oa]|novi[oa]|esposa|esposo|mi ex|trabaja (en|con|para)|exoficial|ex oficial|jubilad[oa]|retirad[oa]|estudia|entrenador|coach|doctor|abogad[oa]|ingenier[oa])\b/

export type EntityKind = 'person' | 'org' | 'invalid'

export interface EntityVerdict {
  kind: EntityKind
  /** Por qué, para poder reportarlo en el dry-run. */
  reason: string
}

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}
function soloLetras(s: string): string {
  return norm(s).replace(/[^a-z0-9]/g, '')
}

/**
 * ¿El nombre quedó cortado al escribirlo? Se detecta porque es un PREFIJO corto
 * del propio handle y el handle es bastante más largo: "Impal" ← @impalaairguns.
 *
 * El margen de 4 caracteres evita falsos positivos con nombres cortos legítimos:
 * "Amy" para @amyst02 NO se marca (el handle apenas es 2 más largo), pero
 * "Ecofl" para @ecoflow_market_peru sí.
 */
export function looksTruncated(name: string, handle: string): boolean {
  const n = soloLetras(name)
  // Los dígitos del handle NO son parte de un nombre: contarlos hacía que "Amy"
  // para @amyst02 alcanzara el margen y se marcara como cortado siendo un nombre.
  const h = soloLetras(handle.replace(/^@/, '')).replace(/\d+/g, '')
  if (!n || !h || n.length > 5) return false
  return h.startsWith(n) && h.length >= n.length + 4
}

export function classifyEntity(name: string, handle: string, note = ''): EntityVerdict {
  const limpio = (name ?? '').trim()
  if (!limpio) return { kind: 'invalid', reason: 'vacío' }

  const n = norm(limpio)
  if (NO_ES_NOMBRE.has(n)) return { kind: 'invalid', reason: `"${limpio}" es una respuesta, no un nombre` }
  if (soloLetras(limpio).length < 3) return { kind: 'invalid', reason: `"${limpio}" es demasiado corto` }
  if (looksTruncated(limpio, handle)) {
    return { kind: 'invalid', reason: `"${limpio}" parece cortado (el handle es @${handle.replace(/^@/, '')})` }
  }

  // La NOTA de Aaron manda sobre cualquier heurística: es él describiendo la cuenta.
  const nota = norm(note)
  if (nota && !nota.startsWith('el handle dice')) {
    // PRIMERO el veto: si la nota describe a una PERSONA, no importa cuántas
    // palabras de organización traiga. Esta rama nació de dos errores reales:
    // "@tiocharlype → Giancarlo Montaldo" salió org porque su nota decía "trabaja
    // en una productora", y "@carlosampuerooficial → Carlos Ampuero" porque decía
    // "exoficial del ejercito". Las dos notas dicen DÓNDE trabaja o QUÉ fue una
    // persona — no que la cuenta sea una empresa. Leer la profesión como si fuera
    // la naturaleza de la cuenta convertía contactos reales en organizaciones.
    if (ES_PERSONA.test(nota)) return { kind: 'person', reason: `tu nota lo describe como persona` }

    const pistaOrg = pistaEnTexto(note)
      // Frases con las que describió organizaciones en su propio llenado.
      || (/\b(es una pagina|es mi unidad|pagina de|centro de)\b/.test(nota) ? 'su nota la describe como página/unidad' : null)
    if (pistaOrg) return { kind: 'org', reason: `tu nota dice "${note.slice(0, 60)}"` }
  }

  const pista = pistaEnTexto(limpio)
  if (pista) return { kind: 'org', reason: `el nombre contiene "${pista}"` }

  return { kind: 'person', reason: 'parece nombre de persona' }
}

/** Slug estable para `org_profiles.org_slug`. */
export function orgSlug(name: string): string {
  return norm(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
}

/**
 * ¿De qué organización cuelga? Hoy solo resuelve el caso que Aaron describió —
 * las compañías de bomberos responden al CGBVP — porque es el único donde la
 * jerarquía es un hecho y no una suposición. Devuelve el `org_slug` del padre.
 */
export function inferParentOrg(name: string, existingSlugs: string[]): string | null {
  const n = norm(name)
  if (!existingSlugs.includes('cgbvp')) return null
  // Solo las COMPAÑÍAS de bomberos cuelgan del CGBVP. Un simple /bombero/ era
  // demasiado ancho: colgó "Juegos Latinoamericanos de Policías y Bomberos" —un
  // evento internacional— como si fuera una unidad del cuerpo peruano.
  const esCompania = /^(bomberos|compania|compañia|cia)\b/.test(n) || /\bcompania de bomberos\b/.test(n)
  const esEvento = /\b(juegos|campeonato|torneo|copa|congreso|feria|expo)\b/.test(n)
  return esCompania && !esEvento ? 'cgbvp' : null
}
