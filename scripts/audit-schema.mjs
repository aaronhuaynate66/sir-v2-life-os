#!/usr/bin/env node
// SIR V2 — Audita TODA referencia a la base contra el esquema REAL.
//
// ═══ POR QUÉ EXISTE ═══════════════════════════════════════════════════════════
//
// PostgREST **no lanza** cuando pides una columna que no existe: manda el error a
// `.error` y devuelve `data: null`. Si el código no revisa `.error` —y en este repo
// casi ningún slot del brief lo hace, a propósito, para ser fail-soft— el resultado
// es indistinguible de "no hay filas". La feature muere en silencio y nadie se
// entera. [[postgrest-columna-inexistente]]
//
// El 1-ago-2026 esta trampa mordió SIETE veces en una sola sesión, ya conociéndola.
// Escribir la nota no alcanzó, porque el error aparece justo cuando uno está
// apurado. Lo único que funciona es MEDIRLO.
//
// Corriendo esto sobre las 361 referencias de `src/app/api` salió un bug real:
// `review/generate` pedía `identity_profile.name` (la columna es `full_name`) y
// encima no la usaba — solo leía `roles`. La consulta entera fallaba y **la tarjeta
// de roles no se generaba nunca**.
//
// ═══ USO ══════════════════════════════════════════════════════════════════════
//
//   node scripts/audit-schema.mjs            # todo src/
//   node scripts/audit-schema.mjs src/app/api/cron
//
// Necesita `.env.local` con NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
// Sale con código 1 si encuentra problemas, para poder colgarlo de un check.
//
// ═══ LÍMITE HONESTO, QUE HAY QUE LEER ═════════════════════════════════════════
//
// El esquema se deduce de `Object.keys()` de UNA fila. **Una tabla vacía no se
// puede verificar por esta vía** y se reporta aparte — nunca como "está bien". Es
// la misma regla de honestidad de cobertura de CLAUDE.md: no concluir desde una
// vista parcial. Si la lista de no-verificables crece, eso es información, no ruido.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const RAIZ = process.argv[2] ?? 'src'

const env = {}
for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(2)
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(e) && !/\.test\./.test(e)) out.push(p)
  }
  return out
}

// `.from('tabla')` … `.select('a, b, c')`, tolerando saltos de línea y encadenados.
const RE = /\.from\(\s*'([a-z_]+)'\s*\)[\s\S]{0,200}?\.select\(\s*'([^']*)'/g

const refs = []
for (const f of walk(RAIZ)) {
  const src = readFileSync(f, 'utf8')
  for (const m of src.matchAll(RE)) {
    refs.push({
      file: f.replace(/\\/g, '/'),
      linea: src.slice(0, m.index).split('\n').length,
      tabla: m[1],
      select: m[2],
    })
  }
}

const tablas = [...new Set(refs.map((r) => r.tabla))].sort()
const esquema = new Map()
for (const t of tablas) {
  const { data, error } = await sb.from(t).select('*').limit(1)
  if (error) esquema.set(t, { existe: false, motivo: error.message })
  else esquema.set(t, { existe: true, cols: new Set(Object.keys(data?.[0] ?? {})), vacia: !data?.[0] })
}

/**
 * Columnas pedidas en un `select`. Descarta lo que no es una columna plana:
 *   - `*`
 *   - joins embebidos: `goals!inner(title, status)` — y su paréntesis de cierre,
 *     que si no se filtra produce un falso positivo tipo "objective_steps.status)"
 *   - alias: `alias:columna`
 */
function columnasPlanas(select) {
  const sinJoins = select.replace(/[a-z_!]+\([^)]*\)/gi, '')
  return sinJoins.split(',').map((c) => c.trim())
    .filter((c) => c && c !== '*' && !c.includes('(') && !c.includes(')') && !c.includes(':'))
}

const problemas = []
for (const r of refs) {
  const e = esquema.get(r.tabla)
  if (!e.existe) {
    problemas.push({ ...r, tipo: 'TABLA', detalle: e.motivo.slice(0, 70) })
    continue
  }
  if (e.vacia) continue // no verificable: se reporta aparte
  const faltan = columnasPlanas(r.select).filter((c) => !e.cols.has(c))
  if (faltan.length) problemas.push({ ...r, tipo: 'COLUMNA', detalle: faltan.join(', ') })
}

const noVerificables = tablas.filter((t) => esquema.get(t).existe && esquema.get(t).vacia)

console.log(`Referencias analizadas : ${refs.length}`)
console.log(`Tablas distintas       : ${tablas.length}`)
console.log(`NO verificables (vacías): ${noVerificables.length}`)
if (noVerificables.length) console.log(`   ${noVerificables.join(', ')}`)
console.log(`\n${problemas.length === 0 ? '✅ Sin problemas.' : `❌ PROBLEMAS: ${problemas.length}`}\n`)
for (const p of problemas) {
  console.log(`${p.tipo.padEnd(8)} ${p.tabla} → falta: ${p.detalle}`)
  console.log(`         ${p.file}:${p.linea}`)
}
process.exit(problemas.length === 0 ? 0 : 1)
