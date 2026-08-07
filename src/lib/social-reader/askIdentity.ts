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
  /** Cuántas cuentas quedan sin identificar. Para decir que sale de la bandeja vieja. */
  pendientesEnBandeja?: number | null
  /** id de `unmatched_social_activity`. */
  id: string
  handle: string
  /** URL pública de la foto, si la hay. Sin foto no vale preguntar acá. */
  photoUrl?: string | null
  /** Lo que ya se sabe (nombre del catálogo, rubro, seguidores…). */
  hint?: string | null
  followers?: number | null
  /** `observed_at` de la fila: CUÁNDO se vio la historia. ISO. */
  observedAt?: string | null
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/**
 * Cuándo se vio, dicho como se dice. PURA. '' si no hay fecha usable.
 *
 * ═══ POR QUÉ ESTO IMPORTA ════════════════════════════════════════════════════
 *
 * Aaron, 5-ago-2026: *"hoy temprano me dijo que no estaba leyendo nada en Instagram
 * pero un día antes me manda la historia de una persona en Instagram, entonces se
 * está confundiendo o hay un error ahí"*.
 *
 * No había error. Los dos mensajes eran ciertos: la historia de @pierolq se vio el
 * **30-jul** (`observed_at`) y la tarjeta salió el **4-ago 21:23** (`asked_at`), seis
 * días después. La consulta que arma la tarjeta NO tiene filtro de frescura — es un
 * drenaje de bandeja (70 cuentas sin preguntar) a razón de una por noche.
 *
 * El bug era el VERBO: *"Vi una historia"* en pasado reciente y sin fecha solo se
 * puede leer como "acabo de ver". Con esa redacción, concluir que el reader estaba
 * trayendo data era lo único razonable. Dos mensajes verdaderos se contradicen en la
 * cabeza del que los lee si solo uno está fechado. [[aviso-sin-fecha-se-lee-como-ahora]]
 */
export function cuandoLaVi(observedAt: string | null | undefined, nowMs: number = Date.now()): string {
  if (!observedAt) return ''
  const t = Date.parse(observedAt)
  if (Number.isNaN(t)) return ''
  // Días de calendario en Lima, no horas: "ayer a las 23:00" es ayer aunque hayan
  // pasado 3 horas. [[hora-de-lima-tz-no-funciona]]
  const diaLima = (ms: number) => new Date(ms - 5 * 3_600_000).toISOString().slice(0, 10)
  const d = diaLima(t)
  const hoy = diaLima(nowMs)
  const dias = Math.round((Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / 86_400_000)
  if (dias <= 0) return 'hoy'
  if (dias === 1) return 'ayer'
  if (dias < 7) return `hace ${dias} días`
  const [, m, dd] = d.split('-')
  return `el ${Number(dd)} de ${MESES[Number(m) - 1]}`
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
/**
 * La cláusula que evita que esta tarjeta parezca desmentir al brief. PURA.
 *
 * ═══ LA CONTRADICCIÓN QUE ARREGLA ════════════════════════════════════════════
 *
 * El 6-ago-2026 el brief de la mañana dijo *"Instagram no trae nada hace 6 días"* y
 * esa misma noche llegó esta tarjeta con una historia. Aaron, textual: *"por un lado
 * me dice que no le anda el de Instagram pero por otro al final me manda una historia
 * de una persona"*.
 *
 * Los dos mensajes eran VERDADEROS y hasta compatibles: la cola tenía 69 cuentas y lo
 * más nuevo era del 30-jul, o sea que "no trae nada nuevo" y "acá va una vieja" dicen
 * lo mismo. Pero ninguno mencionaba al otro, y leídos juntos se peleaban.
 *
 * Con decir de dónde sale la tarjeta, la contradicción desaparece sin cambiar ningún
 * dato. Es el mismo criterio que [[aviso-sin-fecha-se-lee-como-ahora]]: el dato estaba
 * bien, faltaba el contexto que lo hace interpretable.
 */
export function lineaDeBandejaVieja(pendientes: number, esNueva: boolean): string | null {
  if (esNueva) return null
  if (!Number.isFinite(pendientes) || pendientes <= 1) {
    return 'Sale de la bandeja vieja, no es material nuevo.'
  }
  return `Sale de la bandeja vieja: me quedan ${pendientes - 1} cuentas por identificar y te paso una por noche. No es material nuevo.`
}

export function buildIdentityCard(c: IdentityCandidate, nowMs: number = Date.now()): { caption: string; keyboard: InlineButton[][] } {
  // La fecha va PEGADA al verbo, no en una línea aparte: es lo que evita que "Vi"
  // se lea como "acabo de ver". Sin `observed_at` se omite en vez de inventarla.
  const cuando = cuandoLaVi(c.observedAt, nowMs)
  // "Nueva" = de las últimas 48 h. Si la historia es de hace días, la tarjeta tiene
  // que decir que sale de la bandeja vieja — si no, contradice al brief de la mañana
  // que dijo "no trae nada nuevo hace 6 días".
  const ms = c.observedAt ? Date.parse(c.observedAt) : NaN
  const esNueva = Number.isFinite(ms) && nowMs - ms < 48 * 3_600_000
  const partes = [
    `👀 Vi ${cuando ? `${cuando} ` : ''}una historia de @${c.handle} y no sé de quién es.`,
    c.hint ? `Lo que tengo: ${c.hint}` : null,
    typeof c.followers === 'number' ? `Seguidores: ${c.followers.toLocaleString('es-PE')}` : null,
    lineaDeBandejaVieja(c.pendientesEnBandeja ?? 0, esNueva),
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
 * Elige con qué foto mandar la tarjeta, en orden de preferencia.
 *
 * POR QUÉ IMPORTA (medido el 28-jul): `avatar_url` apunta al CDN de Instagram y
 * **caduca**. Hoy responde 200 porque el reader corrió hace horas, pero las filas
 * viejas se van a quedar sin foto — y sin foto la tarjeta pierde justo lo que la
 * hace funcionar (que Aaron vea la cara en vez de adivinar por el @).
 *
 * Por eso existe el snapshot en Storage (`avatar_path`, #927). El bucket NO es
 * público —da 400— así que hay que FIRMAR la URL; el caller lo hace y la pasa acá.
 *
 * PURO: recibe las dos opciones ya resueltas y decide. Prefiere el snapshot cuando
 * está, porque es el que no expira.
 */
export function pickPhoto(opts: { signedSnapshotUrl?: string | null; avatarUrl?: string | null }): string | null {
  return opts.signedSnapshotUrl || opts.avatarUrl || null
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
