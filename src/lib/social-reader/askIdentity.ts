// SIR V2 — Preguntar por Telegram, de a UNA cuenta y CON LA CARA: ¿esto es una
// persona o una empresa?
//
// POR QUÉ EXISTE (Aaron, 28-jul-2026):
//   "ya no quiero llenar más excel. que SIR me pregunte pasivamente si un usuario
//    es tal persona o si es una empresa, y si le creamos su perfil o ficha, pero ya
//    me aburrí del excel"
//
// LO QUE CAMBIÓ Y HACE ESTO POSIBLE. La decisión de #942 fue que por Telegram solo
// se ofreciera DESCARTAR, con este argumento textual: *"Telegram no puede mostrar
// la CARA y el pálpito del handle es basura la mayoría de las veces → confirmar
// crearía un contacto mal nombrado"*. La primera mitad ya no es cierta: las filas
// de la bandeja traen `avatar_url`/`avatar_path`, y Telegram manda fotos. Si la
// pregunta LLEGA CON LA CARA, se cae la objeción — no hay que adivinar por el @.
//
// Y suma la pregunta que faltaba en todas las superficies: **persona o empresa**.
// El Excel demostró que importa (importar "Bomberos Salamanca 127" como contacto
// era un dato falso, no incompleto). Acá se pregunta antes de escribir.
//
// PASIVO de verdad: UNA cuenta por vez, sin listas. El Excel de 141 filas aburrió;
// una foto con tres botones no.
//
// PURO: cero red. El envío y la escritura los hace el caller.

import type { InlineButton } from '@/lib/telegram/client'

export interface IdentityCandidate {
  /** id de `unmatched_social_activity`. */
  id: string
  handle: string
  /** URL pública de la foto, si la hay. Sin foto no vale preguntar acá. */
  photoUrl?: string | null
  /** Lo que ya se sabe (nombre del catálogo, rubro, seguidores…). */
  hint?: string | null
  followers?: number | null
}

/** Prefijo de los callbacks de esta tarjeta: `wi|<p|o|x>|<unmatchedId>`. */
export const IDENTITY_PREFIX = 'wi|'
const MAX_CALLBACK = 64

export type IdentityAction = 'person' | 'org' | 'dismiss'

const CODE: Record<IdentityAction, string> = { person: 'p', org: 'o', dismiss: 'x' }
const FROM_CODE: Record<string, IdentityAction> = { p: 'person', o: 'org', x: 'dismiss' }

export function identityCallback(action: IdentityAction, id: string): string {
  const data = `${IDENTITY_PREFIX}${CODE[action]}|${id}`
  return Buffer.byteLength(data, 'utf8') <= MAX_CALLBACK ? data : ''
}

export function parseIdentityCallback(data: string): { action: IdentityAction; id: string } | null {
  if (!data?.startsWith(IDENTITY_PREFIX)) return null
  const rest = data.slice(IDENTITY_PREFIX.length)
  const sep = rest.indexOf('|')
  if (sep <= 0) return null
  const action = FROM_CODE[rest.slice(0, sep)]
  const id = rest.slice(sep + 1)
  return action && id ? { action, id } : null
}

/**
 * La tarjeta: pie de foto + tres botones. El `@handle` va SIEMPRE en el pie porque
 * es lo que permite resolver una respuesta sin guardar estado: si Aaron responde
 * al mensaje con un nombre, el webhook saca el handle de la cita.
 */
export function buildIdentityCard(c: IdentityCandidate): { caption: string; keyboard: InlineButton[][] } {
  const partes = [
    `👀 Vi una historia de @${c.handle} y no sé de quién es.`,
    c.hint ? `Lo que tengo: ${c.hint}` : null,
    typeof c.followers === 'number' ? `Seguidores: ${c.followers.toLocaleString('es-PE')}` : null,
    '¿Es una persona de tu círculo o una empresa/página?',
    'Si es persona, respóndeme a este mensaje con su nombre y le creo la ficha.',
  ].filter(Boolean)
  const keyboard: InlineButton[][] = [
    [
      { text: '👤 Es persona', callbackData: identityCallback('person', c.id) },
      { text: '🏢 Empresa o página', callbackData: identityCallback('org', c.id) },
    ],
    [{ text: '✕ No me interesa', callbackData: identityCallback('dismiss', c.id) }],
  ]
  return { caption: partes.join('\n\n'), keyboard: keyboard.map((r) => r.filter((b) => b.callbackData)) }
}

/**
 * Saca el @handle del pie de foto citado. Es lo que hace que responder con SOLO el
 * nombre alcance: no hay tabla de estado ni "última pregunta" que se pueda
 * desincronizar — el mensaje citado lleva el dato.
 */
export function handleFromCaption(caption: string): string | null {
  const m = /@([a-zA-Z0-9._]{2,30})/.exec(caption || '')
  return m ? m[1].toLowerCase() : null
}

/**
 * Nombre presentable de una organización a partir del handle:
 * "bomberos.salamanca127" → "Bomberos Salamanca 127".
 *
 * A diferencia de `handleToProbableName` (que trocea para adivinar el nombre de una
 * PERSONA y por eso borra los dígitos), acá los dígitos se CONSERVAN y se separan:
 * en una unidad de bomberos el número es parte del nombre, no ruido.
 */
export function orgNameFromHandle(handle: string): string {
  const limpio = String(handle ?? '').replace(/^@/, '')
  const tokens = limpio
    .split(/[._\-\s]+/)
    .flatMap((t) => t.split(/(?<=[a-zA-Z])(?=\d)|(?<=\d)(?=[a-zA-Z])/))
    .map((t) => t.trim())
    .filter(Boolean)
  if (tokens.length === 0) return limpio
  return tokens
    .map((t) => (/^\d+$/.test(t) ? t : t.charAt(0).toUpperCase() + t.slice(1)))
    .join(' ')
    .slice(0, 120)
}
