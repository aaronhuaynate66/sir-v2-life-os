// SIR V2 — ¿algún canal del reader se quedó MUDO?
//
// POR QUÉ EXISTE (fallo real, 22→29 jul 2026). El reader de WhatsApp Web venía
// trayendo los mensajes de Aaron con latencia de SEGUNDOS (mensaje 02:34 → grabado
// 02:34). Se cortó el 22-jul y nadie se enteró hasta que él preguntó el 29:
// *"¿y por qué mis conversaciones con Diana no están cargadas? si he hablado con
// ella incluso hoy en la mañana"*.
//
// Siete días ciego. Y lo peor: **Instagram siguió funcionando todo ese tiempo**, así
// que desde afuera el reader parecía vivo. Yo mismo llegué a decirle que WhatsApp
// no tenía carga automática — cuando la tenía y estaba caída.
//
// EL PROBLEMA DE FONDO: "no llegaron datos" es AMBIGUO. Puede ser que no pasó nada
// (nadie le escribió) o que el canal está muerto. Sin un LATIDO que diga "estoy
// vivo y mirando", las dos cosas se ven idénticas. Por eso acá se cruzan dos
// señales distintas:
//   · `lastHeartbeatAt` — el canal reportó que está corriendo.
//   · `lastDataAt`      — la última vez que ese canal trajo algo.
//
// Un canal con latido y sin datos está bien (silencio real). Un canal SIN latido
// está caído, y eso hay que decirlo.
//
// PURO: cero red, cero IA, el "ahora" se inyecta.

export interface ChannelState {
  /** 'whatsapp' | 'instagram' | 'teams' | 'outlook' | 'linkedin'. */
  channel: string
  /** ISO del último latido, o null si nunca reportó. */
  lastHeartbeatAt: string | null
  /** ISO del último dato que trajo, o null si nunca trajo nada. */
  lastDataAt: string | null
  /** Lo que el propio canal reportó ('ok' | 'logged_out' | texto de error). */
  status?: string | null
}

export type SilenceKind =
  | 'caido' | 'deslogueado' | 'sin_datos' | 'ok' | 'nunca_visto'
  /**
   * Trae datos FRESCOS pero no reporta latido. No está caído: está corriendo una
   * versión de la extensión anterior al latido (o el latido se rompió).
   *
   * ESTE VEREDICTO EXISTE POR UN FALSO POSITIVO REAL, medido el 30-jul-2026:
   * `reader_heartbeats` estaba en 0 filas mientras Instagram había traído data
   * ese mismo día a las 11:42. Sin esta rama, el diagnóstico decía «Instagram
   * dejó de reportar — probablemente la pestaña está cerrada», que es FALSO y lo
   * contradice un dato de hace veinte minutos.
   *
   * La regla de fondo: **data fresca es prueba positiva de vida, y la ausencia de
   * latido no puede pisarla.** El latido sirve para desambiguar la AUSENCIA de
   * datos, no para negar los que están.
   */
  | 'sin_latido'

export interface ChannelVerdict {
  channel: string
  kind: SilenceKind
  /** Horas desde el último latido (null si nunca latió). */
  hoursSinceHeartbeat: number | null
  /** Días desde el último dato (null si nunca trajo). */
  daysSinceData: number | null
}

/** Sin latido por más de esto, el canal se considera CAÍDO. El reader late cada
 *  ~10 min; 6 h de margen absorbe una PC apagada un rato sin gritar. */
export const HEARTBEAT_DEAD_HOURS = 6
/** Con latido pero sin traer nada por más de esto, vale mencionarlo (puede ser
 *  silencio real, pero en WhatsApp una semana sin un solo mensaje es raro). */
export const DATA_QUIET_DAYS = 4
/**
 * Datos de hace este tiempo o menos = el canal está VIVO, sin importar el latido.
 * 1 día porque el reader es pasivo: depende de que Aaron abra la app, así que un
 * hueco de horas es normal, pero si trajo algo ayer u hoy está andando.
 */
export const DATOS_FRESCOS_DIAS = 1

const HOUR = 3_600_000
const DAY = 86_400_000

function hoursSince(iso: string | null, now: Date): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  return Math.max(0, Math.floor((now.getTime() - t) / HOUR))
}
function daysSince(iso: string | null, now: Date): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  return Math.max(0, Math.floor((now.getTime() - t) / DAY))
}

/**
 * Diagnostica UN canal. El orden de las ramas importa: un canal deslogueado
 * SIGUE latiendo (la extensión corre, es la sesión la que se cayó), así que hay
 * que preguntar por el deslogueo ANTES de mirar la antigüedad del dato.
 */
export function diagnoseChannel(c: ChannelState, now: Date = new Date()): ChannelVerdict {
  const hb = hoursSince(c.lastHeartbeatAt, now)
  const dd = daysSince(c.lastDataAt, now)
  const base = { channel: c.channel, hoursSinceHeartbeat: hb, daysSinceData: dd }

  // Nunca latió ni trajo nada → no está instalado/activado; no es una caída.
  if (hb === null && dd === null) return { ...base, kind: 'nunca_visto' }

  // DATA FRESCA GANA SOBRE LA FALTA DE LATIDO. Va ANTES de la rama de 'caido'
  // porque si no, un canal que acaba de traer datos se declara muerto — pasó de
  // verdad: el 30-jul Instagram había traído data a las 11:42 y `reader_heartbeats`
  // estaba en 0 filas. El latido desambigua la AUSENCIA de datos; no puede negar
  // los que están ahí.
  const sinLatido = hb === null || hb >= HEARTBEAT_DEAD_HOURS
  const datosFrescos = dd !== null && dd <= DATOS_FRESCOS_DIAS
  if (sinLatido && datosFrescos) return { ...base, kind: 'sin_latido' }

  // Latió alguna vez y dejó de latir, y tampoco trae nada reciente → caído.
  if (sinLatido) return { ...base, kind: 'caido' }
  // Late pero la sesión se cayó (WhatsApp Web pidiendo QR, por ejemplo).
  if (c.status && /logged_out|desloguead|qr/i.test(c.status)) return { ...base, kind: 'deslogueado' }
  // Vivo y logueado, pero hace días que no trae nada.
  if (dd !== null && dd >= DATA_QUIET_DAYS) return { ...base, kind: 'sin_datos' }
  return { ...base, kind: 'ok' }
}

const NOMBRE: Record<string, string> = {
  whatsapp: 'WhatsApp', instagram: 'Instagram', teams: 'Teams',
  outlook: 'Outlook', linkedin: 'LinkedIn',
}
const label = (c: string) => NOMBRE[c] ?? c

/** "A", "A y B", "A, B y C" — con `join(' y ')` salía "A y B y C". */
function lista(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? ''
  return `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`
}

/**
 * Línea para el brief. Solo habla de lo que está MAL y nombra la acción concreta,
 * porque Aaron no puede arreglar la extensión desde el celular: lo único útil es
 * saber qué pestaña abrir cuando llegue a esa PC.
 *
 * Devuelve null si todo está bien o si nunca se vio el canal — no se avisa de algo
 * que nunca estuvo andando (eso sería ruido, no una caída).
 */
export function channelSilenceLine(verdicts: ChannelVerdict[], now: Date = new Date()): string | null {
  const caidos = verdicts.filter((v) => v.kind === 'caido')
  const deslog = verdicts.filter((v) => v.kind === 'deslogueado')
  const mudos = verdicts.filter((v) => v.kind === 'sin_datos')
  const sinLatido = verdicts.filter((v) => v.kind === 'sin_latido')
  if (caidos.length === 0 && deslog.length === 0 && mudos.length === 0 && sinLatido.length === 0) return null

  const partes: string[] = []
  for (const v of deslog) {
    partes.push(`${label(v.channel)} se deslogueó — hay que volver a escanear el QR en esa PC`)
  }
  for (const v of caidos) {
    const cuando = v.daysSinceData !== null
      ? `lo último que trajo es de hace ${v.daysSinceData} día(s)`
      : 'nunca llegó a traer nada'
    partes.push(`${label(v.channel)} dejó de reportar (${cuando}) — probablemente la pestaña está cerrada`)
  }
  for (const v of mudos) {
    partes.push(`${label(v.channel)} está corriendo pero hace ${v.daysSinceData} día(s) que no trae nada`)
  }
  // Se dice que TRAE DATOS antes de mencionar el problema: es una versión vieja,
  // no una caída, y confundirlas es lo que hace que un aviso pierda credibilidad.
  if (sinLatido.length) {
    const nombres = lista(sinLatido.map((v) => label(v.channel)))
    partes.push(`${nombres} ${sinLatido.length > 1 ? 'traen' : 'trae'} datos pero no ${sinLatido.length > 1 ? 'reportan' : 'reporta'} latido — la extensión de esa PC es una versión vieja; hay que recargarla para que se pueda avisar si se cae`)
  }
  // Se dice qué SÍ funciona: sin eso parece que "el reader está roto" cuando lo
  // que hay es un canal caído entre varios vivos — que fue justo la confusión.
  const vivos = verdicts.filter((v) => v.kind === 'ok').map((v) => label(v.channel))
  const cola = vivos.length ? ` (${lista(vivos)} sí ${vivos.length > 1 ? 'están' : 'está'} andando)` : ''
  return `📡 ${partes.join('. ')}${cola}.`
}
