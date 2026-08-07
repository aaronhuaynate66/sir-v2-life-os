// SIR V2 — ¿el código que arreglamos está CORRIENDO en la otra PC?
//
// ═══ POR QUÉ EXISTE ═════════════════════════════════════════════════════════
//
// Aaron, 7-ago-2026: *"arregla lo de Instagram que no captura"*. Al ir a mirar por
// qué no captura, la respuesta fue peor que el bug: **no se puede saber**.
//
// El 6-ago se mergeó #1115, cuyo título es literalmente *"Instagram puede decir si
// está roto o si simplemente no lo abriste"*. Pone un `probe()` en el lector que
// separa los tres casos que desde afuera se ven idénticos:
//
//   · hooked=false                  → el lector está roto
//   · hooked=true, loggedIn=false   → se cayó la sesión de IG
//   · hooked=true, 0 vistos         → nadie navegó Instagram
//
// En producción, `reader_heartbeats.probe` de instagram es **null**. Y null, por
// diseño, significa *"no sé"* — nunca *"está bien"*.
//
// El de WhatsApp sí llega lleno (`{lee:'getMessages', chats:1129, libVersion:'4.5.0'}`).
// El de WhatsApp se agregó el **30-jul** (#1034); el de Instagram el **6-ago**
// (#1115). O sea: la otra PC corre un build del 30-jul y **#1115 nunca se instaló**.
// Encaja con todo lo demás de esa fecha — la última data de Teams es del 30-jul y
// el latido de Outlook quedó congelado el 30-jul.
//
// ═══ Y LO QUE HACE QUE ESTO SEA UN MÓDULO Y NO UN COMENTARIO ════════════════
//
// #1115 **no subió la versión del manifest**. Sigue en `0.9.0` desde el 30-jul, así
// que `ext_version` vale para las dos cosas a la vez: el build viejo sin probe de IG
// y el nuevo con probe. La columna que existe para identificar el código **no lo
// identifica**, y por eso "¿por qué Instagram no captura?" no tiene respuesta.
//
// Es el gemelo de *"mergeado ≠ en producción"* (CLAUDE.md), pero un paso más lejos:
// acá no alcanza ni con que Vercel despliegue, porque la extensión se carga
// desempaquetada de una CARPETA en la otra PC. Entre `main` y el navegador de Aaron
// hay un paso **manual** que nadie registra. Un arreglo puede estar mergeado,
// desplegado, con los tests verdes, y no estar corriendo donde importa.
//
// Este módulo lo vuelve visible: compara lo que la extensión REPORTA contra lo que
// el repo ESPERA, y si está atrás lo dice en el brief con la acción concreta.
//
// Honestidad de cobertura: si ningún canal reporta versión, esto devuelve `null` —
// "no sé", nunca "está al día". Es la misma regla del probe.

/**
 * La versión que el repo espera que esté instalada — debe ser IDÉNTICA a la de
 * `extension/sir-reader/manifest.json`.
 *
 * No se importa el manifest directamente a propósito: vive fuera de `src/` y del
 * bundle de Next. El candado es un test que lee el archivo de verdad y falla si
 * los dos números se separan, así que **subir el manifest sin subir esta constante
 * pone el CI en rojo**. Que es justo lo que faltó en #1115.
 */
export const VERSION_EXTENSION = '0.10.0'

/**
 * Compara dos versiones tipo `0.10.0`. Devuelve <0, 0 o >0.
 *
 * Numérica por segmento, NO alfabética: `'0.9.0' > '0.10.0'` como strings, que es
 * exactamente el caso que tenemos entre manos y habría dado "está al día" con la
 * extensión ocho días atrás. PURA.
 */
export function comparaVersiones(a: string, b: string): number {
  const parse = (v: string) => String(v).trim().replace(/^v/i, '').split('.').map((n) => {
    const x = Number.parseInt(n, 10)
    return Number.isFinite(x) ? x : 0
  })
  const pa = parse(a)
  const pb = parse(b)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

/** ¿Es una versión con forma de versión? Un `null`, un `''` o basura no lo son. */
function esVersion(v: unknown): v is string {
  return typeof v === 'string' && /^v?\d+(\.\d+)*$/.test(v.trim())
}

export type EstadoDeVersion = 'al-dia' | 'vieja' | 'adelantada' | 'no-se'

export interface VeredictoDeVersion {
  estado: EstadoDeVersion
  /** La MÁS ALTA que reportó algún canal. `null` si ninguno reportó una válida. */
  instalada: string | null
  esperada: string
}

/**
 * Qué build está corriendo allá, mirando lo que reportan TODOS los canales.
 *
 * Se queda con la MÁS ALTA a propósito: todos los canales los sirve la misma
 * extensión, así que versiones distintas solo pueden venir de una fila vieja que
 * quedó sin actualizar (el latido de Outlook lleva ocho días congelado y reporta
 * `null`). Quedarse con la más baja diría "está desactualizada" por culpa de una
 * pestaña muerta, y sería una alarma falsa cada vez.
 *
 * PURA.
 */
export function estadoDeVersion(
  reportadas: Array<string | null | undefined>,
  esperada: string = VERSION_EXTENSION,
): VeredictoDeVersion {
  let mejor: string | null = null
  for (const v of reportadas) {
    if (!esVersion(v)) continue
    if (mejor === null || comparaVersiones(v, mejor) > 0) mejor = v.trim()
  }
  if (mejor === null) return { estado: 'no-se', instalada: null, esperada }
  const d = comparaVersiones(mejor, esperada)
  return { estado: d < 0 ? 'vieja' : d > 0 ? 'adelantada' : 'al-dia', instalada: mejor, esperada }
}

/**
 * La línea del brief. `null` cuando no hay nada que decir.
 *
 * Calla en tres de los cuatro casos:
 *   · al-dia      → no hay noticia
 *   · adelantada  → la otra PC va ADELANTE del repo (build de prueba). Es raro pero
 *                   no es un problema de Aaron, y avisarlo sería ruido.
 *   · no-se       → no sé qué corre. Decirlo acá sería alarmar sin dato; el silencio
 *                   de los canales ya se cubre en `channelSilence`.
 *
 * Habla solo cuando la extensión está ATRÁS, porque solo ese caso tiene una acción
 * concreta y un costo medible: arreglos mergeados que no están corriendo.
 */
export function lineaDeVersionVieja(v: VeredictoDeVersion): string | null {
  if (v.estado !== 'vieja' || !v.instalada) return null
  return `📦 La extensión de la otra PC corre ${v.instalada} y la del repo es ${v.esperada}: `
    + 'lo que arreglamos después no está corriendo allá. Hay que copiar la carpeta '
    + '`extension/sir-reader` y recargar la extensión en chrome://extensions.'
}
