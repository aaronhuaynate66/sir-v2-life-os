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
/**
 * Latido más viejo que esto (o inexistente) mientras siguen llegando datos = el
 * latido está ROTO, no la PC apagada. Ninguna PC manda correos de las 18:23 estando
 * apagada; a las 48 h la excusa de "estuvo apagada un rato" ya no se sostiene.
 */
export const LATIDO_ROTO_HORAS = 48
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

  // NUNCA TRAJO NADA → no está en uso; no es una caída.
  //
  // Antes esta rama exigía `hb === null` además, y por eso LinkedIn y Outlook —que
  // Aaron no usa— salían como 'caido' con el texto "dejó de reportar, probablemente
  // la pestaña está cerrada": tienen fila de latido (se creó cuando alguna vez hubo
  // una pestaña abierta) pero jamás trajeron un dato. Decirle que "dejó de reportar"
  // algo que nunca funcionó es ruido con forma de alarma. Lo que define si un canal
  // está EN USO es si alguna vez produjo, no si alguna vez latió.
  if (dd === null) return { ...base, kind: 'nunca_visto' }

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

/**
 * ═══ CANALES QUE NO PUEDEN AUTODIAGNOSTICARSE ════════════════════════════════
 *
 * Aaron, 4-ago-2026, sobre la línea "Instagram está corriendo pero hace 4 día(s)
 * que no trae nada": *"entonces no entiendo si sirve o no sirve, qué hacemos"*.
 *
 * La pregunta era la correcta y la respuesta honesta es que **el sistema no puede
 * saberlo**. Dos razones estructurales, verificadas en la extensión:
 *
 * · `background.js` arranca `probeCanal` con `if (channel !== 'whatsapp') return
 *   null`. Solo WhatsApp tiene probe de salud. Para el resto, la columna
 *   `reader_heartbeats.probe` es null siempre.
 * · El lector de Instagram (`content/instagramReader.js`) es un INTERCEPTOR
 *   PASIVO de fetch/XHR: captura lo que pasa cuando Aaron navega Instagram él
 *   mismo. No hace backfill como WhatsApp contra su Store local. Así que "no
 *   trajo nada en 4 días" puede ser, sin más, que no abrió Instagram.
 *
 * Y el latido no ayuda: `status:'ok'` significa "hay una pestaña abierta que
 * matchea la URL", no "el lector está leyendo".
 *
 * Entonces para estos canales `sin_datos` es AMBIGUO por construcción, y el
 * brief tiene que decirlo. Es la regla de honestidad de cobertura de CLAUDE.md
 * aplicada al reader: si la ventana es parcial, se dice — no se insinúa que se
 * está vigilando algo que no se vigila.
 */
export const CANALES_SIN_DIAGNOSTICO = new Set(['instagram', 'linkedin'])

/**
 * ¿Este canal puede distinguir "roto" de "sin novedad"? PURA.
 *
 * ═══ EL PROBE MANDA SOBRE LA LISTA ════════════════════════════════════════════
 *
 * `CANALES_SIN_DIAGNOSTICO` es una lista escrita a mano, y una lista a mano se
 * vuelve mentira sola: el día que el lector de Instagram aprenda a diagnosticarse,
 * esta función seguiría diciendo que no puede y el brief seguiría dándole a Aaron la
 * respuesta ambigua — con el diagnóstico ya llegando en el latido, ignorado.
 *
 * Así que **si llegó un probe, el canal SÍ se autodiagnostica**, sin importar la
 * lista. La lista queda solo como el default para cuando no hay probe: describe lo
 * que se sabe HOY, y deja de poder contradecir a la evidencia.
 *
 * Es la misma idea que "data fresca es prueba de vida" de
 * [[alarma-silencio-reader-apagada]]: la evidencia le gana a la configuración.
 */
export function tieneDiagnostico(channel: string, probe?: unknown): boolean {
  if (probe !== undefined && probe !== null) return true
  return !CANALES_SIN_DIAGNOSTICO.has((channel ?? '').toLowerCase())
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
    // Un canal CON diagnóstico late y se le puede creer que está leyendo. Uno sin
    // diagnóstico no: ahí "no trae nada" es ambiguo y hay que decirlo, en vez de
    // dejarle a Aaron la pregunta de si sirve o no.
    if (tieneDiagnostico(v.channel)) {
      partes.push(`${label(v.channel)} está corriendo pero hace ${v.daysSinceData} día(s) que no trae nada`)
    } else {
      // Y se dice que la BANDEJA VIEJA sigue viva, porque si no este aviso parece
      // desmentir a la tarjeta del "¿quién es quién?" que llega esa misma noche con
      // una historia. Aaron lo leyó como contradicción el 6-ago; los dos mensajes
      // eran verdaderos y ninguno mencionaba al otro. Ver `lineaDeBandejaVieja`.
      partes.push(
        `${label(v.channel)} no trae nada NUEVO hace ${v.daysSinceData} día(s), y no se puede saber si es falta ` +
        `de uso o que se rompió: su lector es pasivo (captura solo cuando abres ${label(v.channel)}) y no tiene ` +
        `diagnóstico. Lo que sí tengo es bandeja vieja por identificar, y de ahí sale la tarjeta de cada noche`,
      )
    }
  }
  // Se dice que TRAE DATOS antes de mencionar el problema: es una versión vieja,
  // no una caída, y confundirlas es lo que hace que un aviso pierda credibilidad.
  if (sinLatido.length) {
    // NO SE AFIRMA LA CAUSA. La versión anterior decía "la extensión de esa PC es una
    // versión vieja; hay que recargarla", y eso se volvió FALSO en cuanto la extensión
    // empezó a mandar su versión (v0.9.0): un latido viejo con datos frescos también
    // pasa cuando esa PC estuvo apagada un rato, que es lo normal de madrugada. Se
    // describe lo que se ve y se ofrecen las dos causas, sin elegir una.
    // ═══ DOS COSAS DISTINTAS SE VEÍAN IGUAL ACÁ ═══════════════════════════════
    //
    // "PC apagada un rato" y "el latido está roto" son el mismo veredicto pero NO
    // el mismo mensaje, y el de arriba solo servía para el primero. El 7-ago-2026
    // Outlook y Teams entraron por esta rama trayendo datos **de esa misma tarde**
    // con el latido de hace ocho días (Teams sin fila de latido siquiera), y el
    // texto decía *"puede ser que esa PC esté apagada"* — contradicho por los seis
    // correos que acababan de llegar de esa PC. Un aviso que se desmiente solo en
    // su propia frase es peor que no avisar.
    //
    // Lo que separa los dos casos es la DISTANCIA entre el latido y el dato: unas
    // horas es una PC que estuvo apagada; días con datos de hoy es imposible de
    // explicar por la PC, y solo queda que el latido no esté mirando ese canal.
    const roto = sinLatido.filter((v) => v.hoursSinceHeartbeat === null || v.hoursSinceHeartbeat >= LATIDO_ROTO_HORAS)
    const dormida = sinLatido.filter((v) => !(v.hoursSinceHeartbeat === null || v.hoursSinceHeartbeat >= LATIDO_ROTO_HORAS))
    if (roto.length) {
      const nombres = lista(roto.map((v) => label(v.channel)))
      const pl = roto.length > 1
      partes.push(
        `${nombres} ${pl ? 'están trayendo' : 'está trayendo'} datos frescos pero ${pl ? 'sus latidos llevan' : 'su latido lleva'} ` +
        `días sin reportar: ${pl ? 'los lectores están andando' : 'el lector está andando'} —por eso llegan los datos— y lo que no ` +
        `reporta es el latido. No hay nada que reabrir en esa PC`,
      )
    }
    if (dormida.length) {
      const nombres = lista(dormida.map((v) => label(v.channel)))
      const pl = dormida.length > 1
      partes.push(`${nombres} ${pl ? 'traen' : 'trae'} datos pero ahora mismo no ${pl ? 'reportan' : 'reporta'} latido — puede ser que esa PC esté apagada, o que la extensión no esté corriendo`)
    }
  }
  // Se dice qué SÍ funciona: sin eso parece que "el reader está roto" cuando lo
  // que hay es un canal caído entre varios vivos — que fue justo la confusión.
  const vivos = verdicts.filter((v) => v.kind === 'ok').map((v) => label(v.channel))
  const cola = vivos.length ? ` (${lista(vivos)} sí ${vivos.length > 1 ? 'están' : 'está'} andando)` : ''
  return `📡 ${partes.join('. ')}${cola}.`
}
