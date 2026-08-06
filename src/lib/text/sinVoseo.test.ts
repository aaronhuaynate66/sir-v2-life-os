// SIR V2 — GUARDA: el fuente no puede tener voseo.
//
// ═══ POR QUÉ ES UN TEST Y NO UNA CONVENCIÓN ═══════════════════════════════════
//
// CLAUDE.md lo prohíbe desde el principio: *"Prohibido el voseo en todo lo que
// Aaron llegue a leer: código, copys, prompts, mensajes"*. Y aun así, medido el
// 1-ago-2026 con `detectVoseo` sobre todo el repo: **324 líneas en 192 archivos**.
//
// La regla escrita no alcanzó porque el voseo entra de a una línea y nadie relee
// 1,000 archivos. El scrub `deVoseo` cubre la salida del LLM en Telegram y en el
// chat, pero **la app web no pasa por ahí**: el copy de los componentes y los
// mensajes de error de las API llegan crudos a la pantalla.
//
// Esto lo vuelve verificable: si alguien escribe "revisá" en un componente, la
// suite falla y dice dónde. Es el mismo criterio con el que el harness de eval
// mide `language` con el scrub y no con un LLM-juez — el idioma se mide, no se
// opina. [[idioma-espanol-peru]]
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { detectVoseo, tieneVoseo } from './deVoseo'

/** `deVoseo.ts` ENUMERA las formas de voseo: son sus datos, no un error. */
const EXENTOS = ['src/lib/text/deVoseo.ts']

// Los TESTS quedan fuera, y a propósito: ahí el voseo suele ser el dato de
// entrada, no una falla. `parse.test.ts` trae un export real de WhatsApp que
// dice "y vos?" (lo escribió una persona, corregirlo falsearía el fixture), y
// los tests del motor de manipulación le pasan frases rioplatenses adrede para
// ver si las detecta. Esta guarda protege el COPY que llega a la pantalla; si un
// test asertara voseo de salida, el fuente que lo produce ya caería acá.
const esTest = (rel: string) => /\.test\.tsx?$/.test(rel)

// Las instrucciones de prompt LISTAN lo prohibido ("PROHIBIDO el voseo: vos, sos,
// tenés…"). Esa línea contiene voseo por necesidad: es la regla, no su violación.
const esLaRegla = (line: string) => /voseo|rioplatense|argentin/i.test(line)

// Identificadores de código que casualmente coinciden con una forma de voseo:
// `animate={{…}}` (Framer Motion) coincide con el imperativo de "animar". Se
// reconocen porque están pegados a sintaxis, no a prosa.
// `.`, `/` y `@` separan identificadores (`obj.prop`, `lib/vos`) pero también
// terminan oraciones ("…lo usás."). Solo cuentan como código si al otro lado hay
// algo alfanumérico.
const IDENT = /[A-Za-z0-9_-]/
const pegadoACodigo = (borde: string, vecino: string) =>
  IDENT.test(borde) || (/[./@]/.test(borde) && /[A-Za-z0-9]/.test(vecino))

const esCodigo = (line: string, v: string) => {
  const re = new RegExp(`(?<![a-záéíóúñ])${v}(?![a-záéíóúñ])`, 'gi')
  for (const m of line.matchAll(re)) {
    const i = m.index ?? 0
    const fin = i + m[0].length
    // Pegado a un identificador en CUALQUIER lado (`animate-spin`, el guion va
    // después), o seguido de `=`/`:`/`(` → es código, no prosa.
    if (pegadoACodigo(line[i - 1] ?? ' ', line[i - 2] ?? ' ')) continue
    if (pegadoACodigo(line[fin] ?? ' ', line[fin + 1] ?? ' ')) continue
    if (/^\s*[=:(]/.test(line.slice(fin))) continue
    return false // esta ocurrencia es prosa
  }
  return true
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(e)) out.push(p)
  }
  return out
}

describe('el fuente está libre de voseo', () => {
  it('ningún archivo de src/ trae formas rioplatenses', () => {
    const ofensas: string[] = []
    for (const f of walk('src')) {
      const rel = f.replace(/\\/g, '/')
      if (EXENTOS.includes(rel) || esTest(rel)) continue
      const contenido = readFileSync(f, 'utf8')
      // Pre-filtro por archivo: correr el detector línea por línea sobre todo el
      // repo tarda ~20 s. Por archivo, la mayoría sale limpia en una pasada.
      //
      // `tieneVoseo` y no `detectVoseo(...).length === 0`: acá solo importa el SÍ/NO
      // y el booleano corta al primer hallazgo, sin armar la lista de coincidencias
      // ni correr el barrido generativo sobre el contenido completo. Junto con dejar
      // de recompilar las 94 reglas en cada llamada, es lo que saca a este test del
      // borde del timeout de 60 s que lo hacía fallar en CI.
      if (!tieneVoseo(contenido)) continue
      contenido.split(/\r?\n/).forEach((line, i) => {
        if (esLaRegla(line)) return
        const v = detectVoseo(line).filter((x) => !esCodigo(line, x))
        if (v.length) ofensas.push(`${rel}:${i + 1}  [${v.join(', ')}]  ${line.trim().slice(0, 90)}`)
      })
    }
    // El mensaje ES la lista: quien rompa esto tiene que ver QUÉ y DÓNDE, no un
    // "expected 0 to be 3" que lo manda a buscar a mano por 1,000 archivos.
    expect(ofensas, `Voseo en el fuente (usa tuteo peruano):\n${ofensas.join('\n')}`).toEqual([])
  }, 60_000)

  // Una guarda que no puede fallar no sirve de nada. Estos casos prueban que los
  // filtros de arriba (la-regla, es-código) no ANULAN la detección: si alguien
  // los afloja de más, el test verde dejaría de significar algo.
  it('caza el voseo que se reintroduzca en prosa', () => {
    const prosa = [
      `        <p>Revisá tus pendientes y marcá lo que hiciste.</p>`,
      `  return errorJson(400, 'Mandá el archivo de nuevo')`,
      `  // Acá vos elegís qué mostrar`,
      `    toast.success('Listo, ya lo registrás')`,
    ]
    for (const line of prosa) {
      const v = detectVoseo(line).filter((x) => !esCodigo(line, x))
      expect(v.length, `debió cazar voseo en: ${line}`).toBeGreaterThan(0)
    }
  })

  it('no acusa código ni la propia regla anti-voseo', () => {
    const limpias = [
      `        <Loader2 className="animate-spin" />`,
      `  <motion.div animate={{ opacity: 1 }} />`,
      `  PROHIBIDO el voseo y los giros argentinos ("vos", "sos", "tenés", "mirá").`,
      `  const sos = { id: 1 }`,
      `  // Ayer dormí mal y pedí ayuda: pretéritos legítimos en peruano.`,
    ]
    for (const line of limpias) {
      const v = esLaRegla(line) ? [] : detectVoseo(line).filter((x) => !esCodigo(line, x))
      expect(v, `falso positivo en: ${line}`).toEqual([])
    }
  })
})
