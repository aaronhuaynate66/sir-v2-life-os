// SIR V2 — Proponer en LOTE las cuentas de IG que parecen organizaciones.
//
// POR QUÉ EN LOTE. El flujo que existe pregunta UNA cuenta por noche, con foto.
// Está bien para una cara ("¿es Laura?"), pero la bandeja tiene 103 handles y a
// una por noche son 103 noches. Y para una empresa la foto no aporta nada: nadie
// reconoce a @panoramaoutsourcing por su logo. Lo que decide es la palabra que
// está en el propio handle, y eso se puede leer de 30 de golpe.
//
// CÓMO SE GUARDA EL ESTADO: no se guarda. El mensaje numera los handles y, cuando
// Aaron responde, el webhook los recupera leyendo el TEXTO del mensaje al que
// contestó. Es el mismo patrón que ya usa la tarjeta de identidad con su caption,
// y existe porque `callback_data` de Telegram corta en 64 bytes — no caben 30
// handles ahí, y una tabla de lotes pendientes sería estado que se puede quedar
// huérfano.
//
// PURO.

import { deVoseo } from '@/lib/text/deVoseo'

/** Cuántas se proponen juntas. No es un límite técnico (el mensaje aguanta 4096
 *  caracteres) sino de revisión: 30 líneas se leen de una pasada en el celular, y
 *  si me equivoco el error queda acotado a 30 filas y no a las 103. */
export const MAX_POR_LOTE = 30

export interface CuentaPropuesta {
  handle: string
  /** Por qué se propone, en las palabras del léxico ("el handle dice …"). */
  razon: string
}

export interface LoteOrgs {
  text: string
  keyboard: Array<Array<{ text: string; callbackData: string }>>
  /** Los handles en el MISMO orden en que se numeraron. */
  handles: string[]
}

/** Marca invisible para que el webhook reconozca el mensaje sin guardar estado. */
export const MARCA_LOTE = '🏢 Cuentas que parecen empresas u organizaciones'

/**
 * Arma el mensaje del lote. Devuelve también los handles en orden, porque la
 * numeración que ve Aaron y la que interpreta el webhook TIENEN que coincidir.
 */
export function buildOrgBatch(
  cuentas: CuentaPropuesta[],
  callbackAll: string,
  callbackNo: string,
): LoteOrgs | null {
  const lote = cuentas.slice(0, MAX_POR_LOTE)
  if (lote.length === 0) return null

  const lineas = lote.map((c, i) => `${i + 1}. @${c.handle} — ${c.razon}`)
  const restantes = cuentas.length - lote.length

  const cuerpo = [
    MARCA_LOTE,
    '',
    ...lineas,
    '',
    lote.length === 1
      ? '¿La marco como organización y la saco de la cola?'
      : `¿Las marco como organizaciones y las saco de la cola? Si alguna NO es empresa, respóndeme con sus números (ej. "3, 7") y esas las dejo pendientes.`,
  ]
  if (restantes > 0) cuerpo.push('', `Quedan ${restantes} más para el siguiente lote.`)

  return {
    text: deVoseo(cuerpo.join('\n')),
    keyboard: [[
      { text: lote.length === 1 ? '✅ Sí, la 1' : `✅ Sí, las ${lote.length}`, callbackData: callbackAll },
      { text: '✕ Ninguna', callbackData: callbackNo },
    ]],
    handles: lote.map((c) => c.handle),
  }
}

/**
 * Recupera los handles numerados desde el texto del mensaje. Es la contracara de
 * `buildOrgBatch`: si el formato de la línea cambia, esto tiene que cambiar con
 * él, y por eso hay un test que va y vuelve.
 */
export function parseOrgBatch(text: string): string[] {
  if (!text || !text.includes(MARCA_LOTE)) return []
  const out: string[] = []
  for (const linea of text.split('\n')) {
    const m = linea.match(/^\s*(\d+)\.\s*@([A-Za-z0-9._]+)/)
    if (!m) continue
    const idx = parseInt(m[1], 10)
    if (idx !== out.length + 1) continue // numeración rota → no adivinar
    out.push(m[2].toLowerCase())
  }
  return out
}

/**
 * Los números que Aaron excluyó ("3, 7" · "el 3 y el 7" · "3 7"). Devuelve ÍNDICES
 * base 0, ya filtrados al rango del lote y sin repetidos.
 *
 * Un número fuera de rango se DESCARTA en silencio en vez de correr el resto: si
 * él escribe "35" en un lote de 30, tomar eso como el 5 sería inventarle una
 * intención.
 */
export function parseExclusiones(respuesta: string, total: number): number[] {
  const nums = String(respuesta ?? '').match(/\d+/g) ?? []
  const fuera = new Set<number>()
  for (const n of nums) {
    const i = parseInt(n, 10) - 1
    if (i >= 0 && i < total) fuera.add(i)
  }
  return [...fuera].sort((a, b) => a - b)
}

/** Terminaciones de dominio que las empresas peruanas se pegan al handle. NO son
 *  parte del nombre: @vitamedical.pe es "Vitamedical", no "Vitamedical Pe". */
const COLAS_DE_DOMINIO = new Set(['pe', 'com', 'net', 'org', 'ai', 'io', 'co', 'la', 'ci', 'app'])

/** Nombre legible para una organización a partir del handle, cuando no hay otro.
 *  Conserva los dígitos porque a veces SON el nombre ("Salamanca 127"). */
export function nombreDesdeHandle(handle: string): string {
  const limpio = String(handle ?? '').replace(/^@/, '').trim()
  if (!limpio) return ''
  const tokens = limpio.split(/[._\-]+/).filter(Boolean)
  // Se saca la cola de dominio solo si NO es lo único que queda (@pe → "Pe").
  if (tokens.length > 1 && COLAS_DE_DOMINIO.has(tokens[tokens.length - 1].toLowerCase())) tokens.pop()
  return tokens.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(' ')
}
