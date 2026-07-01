// SIR V2 — Batch loader IDEMPOTENTE para `people` (+ anexas).
//
// Carga personas desde un JSON (array de objetos ya mapeados a columnas)
// contra Supabase via PostgREST con el service_role key. Reusable, no one-off.
//
//   node scripts/seed-people.mjs data/people-batch.json            # DRY-RUN (default)
//   node scripts/seed-people.mjs data/people-batch.json --commit   # escribe de verdad
//   node scripts/seed-people.mjs data/people-batch.json --user-id=<uuid>  # override
//
// Patron de conexion copiado de scripts/audit-prod-schema.mjs:
//   loadEnv de .env.local -> NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
//   -> REST /rest/v1. El service_role key BYPASSEA RLS, por eso derivamos el
//   user_id del primer row existente de people (la DB es monousuario) en vez
//   de hardcodearlo.
//
// Reglas de negocio:
//   - IDEMPOTENTE: matchea persona existente por name (+ phone_number si viene)
//     para el user. Si existe, hace gap-fill (solo campos que estan vacios/null
//     en la DB) o skip; NUNCA duplica.
//   - Completa los NOT NULL con CHECK requeridos con defaults sensatos si faltan
//     (relationship, category, importance_score, energy_impact, trust_level) y
//     los marca como "default" en el reporte.
//   - DRY-RUN por defecto: solo imprime el plan. Escribe unicamente con --commit.
//   - special_dates es una COLUMNA jsonb de people (no tabla). person_money y
//     person_links si son tablas anexas.
//
// NO writes en dry-run. NO ejecuta SQL. Solo REST.

import { readFileSync } from 'node:fs'

// ─── Env (mismo loader que audit-prod-schema.mjs) ────────────────────
function loadEnv(path) {
  const out = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

// ─── Args ────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const COMMIT = argv.includes('--commit')
const userIdFlag = argv.find((a) => a.startsWith('--user-id='))?.slice('--user-id='.length)
const jsonPath = argv.find((a) => !a.startsWith('--'))

if (!jsonPath) {
  console.error('USO: node scripts/seed-people.mjs <archivo.json> [--commit] [--user-id=<uuid>]')
  process.exit(2)
}

const env = loadEnv('.env.local')
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('MISSING_ENV', { url: !!URL, key: !!KEY }, '-> revisa .env.local')
  process.exit(2)
}
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }

// ─── Esquema: columnas escribibles de people (0001 + ALTERs) ─────────
// Solo estas keys del JSON se rutean a la tabla people; el resto son anexas.
const PEOPLE_COLUMNS = new Set([
  'name', 'alias', 'relationship', 'category', 'importance_score', 'energy_impact',
  'trust_level', 'last_contact', 'contact_frequency', 'location', 'tags', 'notes',
  'slug', 'birth_date', 'cycle_start_date', 'cycle_length_days', 'phone_number',
  'linkedin_url', 'instagram_handle', 'twitter_handle', 'profile_avatar_path',
  'estado_civil', 'education', 'organization', 'org_group', 'title', 'ambito',
  'gender', 'interests', 'bio', 'trajectory', 'private_notes', 'special_dates',
])

// Defaults sensatos para los NOT NULL con CHECK (los 5 que pidio el usuario).
const REQUIRED_DEFAULTS = {
  relationship: 'acquaintance',
  category: 'peripheral',
  importance_score: 5,
  energy_impact: 'neutral',
  trust_level: 5,
}

// CHECK constraints que validamos client-side antes de escribir.
const CHECKS = {
  relationship: (v) =>
    ['family', 'friend', 'romantic', 'professional', 'mentor', 'mentee', 'acquaintance'].includes(v),
  category: (v) => ['inner_circle', 'close', 'network', 'peripheral'].includes(v),
  energy_impact: (v) => ['energizing', 'draining', 'neutral'].includes(v),
  gender: (v) => v == null || ['female', 'male', 'other'].includes(v),
  importance_score: (v) => Number.isInteger(v) && v >= 1 && v <= 10,
  trust_level: (v) => Number.isInteger(v) && v >= 1 && v <= 10,
  cycle_length_days: (v) => v == null || (Number.isInteger(v) && v >= 15 && v <= 60),
}

// Columnas text NOT NULL con default '' -> gap-fill si estan vacias.
const EMPTY_STRING_DEFAULTS = new Set(['contact_frequency', 'notes', 'bio', 'trajectory', 'private_notes'])
// Columnas array/jsonb con default vacio -> gap-fill si estan vacias.
const EMPTY_ARRAY_DEFAULTS = new Set(['tags', 'interests', 'special_dates'])

// ─── Helpers REST ────────────────────────────────────────────────────
function eq(col, val) {
  return `${col}=eq.${encodeURIComponent(val)}`
}

async function restGet(pathAndQuery) {
  const r = await fetch(`${URL}/rest/v1/${pathAndQuery}`, { headers: H })
  if (r.status !== 200) {
    const detail = await r.text().catch(() => '')
    throw new Error(`GET ${pathAndQuery} -> ${r.status} ${detail.slice(0, 200)}`)
  }
  return r.json()
}

async function restInsert(table, body) {
  const r = await fetch(`${URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...H, Prefer: 'return=representation' },
    body: JSON.stringify(body),
  })
  if (r.status !== 201 && r.status !== 200) {
    const detail = await r.text().catch(() => '')
    throw new Error(`INSERT ${table} -> ${r.status} ${detail.slice(0, 300)}`)
  }
  return r.json()
}

async function restPatch(table, filter, body) {
  const r = await fetch(`${URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: { ...H, Prefer: 'return=representation' },
    body: JSON.stringify(body),
  })
  if (r.status !== 200 && r.status !== 204) {
    const detail = await r.text().catch(() => '')
    throw new Error(`PATCH ${table} -> ${r.status} ${detail.slice(0, 300)}`)
  }
  return r.status === 204 ? [] : r.json()
}

// ─── Slug (replica de src/lib/people/slug.ts, sin importar TS) ────────
function generateSlug(name) {
  if (!name || typeof name !== 'string') return 'persona'
  const s = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
  return s || 'persona'
}

async function ensureUniqueSlug(base, userId) {
  let candidate = base
  let suffix = 1
  for (let i = 0; i < 50; i++) {
    const rows = await restGet(`people?${eq('user_id', userId)}&${eq('slug', candidate)}&select=id&limit=1`)
    if (!rows.length) return candidate
    suffix += 1
    candidate = `${base}-${suffix}`
  }
  return `${base}-${Date.now()}`
}

// ─── ID generation (mismo shape que el POST del app) ─────────────────
function rand(n) {
  return Math.random().toString(36).slice(2, 2 + n)
}
function newPersonId() {
  return `per_${Date.now()}_${rand(6)}`
}
function newLinkId() {
  return `lnk_${Date.now()}_${rand(6)}`
}

// ─── Gap-fill: que columns de people faltan/estan vacias en el row DB ─
function isEmptyValue(col, existingVal) {
  if (existingVal == null) return true
  if (EMPTY_STRING_DEFAULTS.has(col) && existingVal === '') return true
  if (EMPTY_ARRAY_DEFAULTS.has(col)) {
    if (Array.isArray(existingVal)) return existingVal.length === 0
    if (typeof existingVal === 'string') return existingVal === '[]' || existingVal === '{}' || existingVal === ''
  }
  return false
}

function hasValue(v) {
  if (v == null) return false
  if (typeof v === 'string') return v.trim().length > 0
  if (Array.isArray(v)) return v.length > 0
  return true
}

// ─── Signatures para dedupe idempotente de anexas ────────────────────
function moneySig(m) {
  return [m.direction ?? 'out', m.amount ?? 0, m.currency ?? 'PEN', m.concept ?? '',
    m.kind ?? 'transfer', m.occurred_on ?? '', m.op_ref ?? ''].join('|')
}
function linkSig(l) {
  return `${l.person_b_id}|${l.kind}`
}

// ─── Procesa una persona: arma el plan (y ejecuta si COMMIT) ─────────
async function processPerson(input, userId) {
  const result = {
    name: input?.name, action: null, defaulted: [], updates: null,
    moneyAdd: 0, linksAdd: 0, errors: [], notes: [],
  }

  // Validacion basica.
  if (typeof input?.name !== 'string' || input.name.trim().length === 0) {
    result.action = 'error'
    result.errors.push('name requerido (string no vacio)')
    return result
  }
  const name = input.name.trim().slice(0, 200)

  // Separar columns de people vs anexas.
  const peopleFields = {}
  for (const [k, v] of Object.entries(input)) {
    if (PEOPLE_COLUMNS.has(k)) peopleFields[k] = v
    else if (k === 'person_money' || k === 'person_links') { /* anexas, se manejan abajo */ }
    else result.notes.push(`key ignorada (no es columna de people ni anexa): ${k}`)
  }
  peopleFields.name = name

  // Aplicar defaults requeridos si faltan; marcar en el reporte.
  for (const [col, def] of Object.entries(REQUIRED_DEFAULTS)) {
    if (peopleFields[col] == null) {
      peopleFields[col] = def
      result.defaulted.push(col)
    }
  }

  // Validar CHECKs.
  for (const [col, check] of Object.entries(CHECKS)) {
    if (col in peopleFields && !check(peopleFields[col])) {
      result.action = 'error'
      result.errors.push(`valor invalido para ${col}: ${JSON.stringify(peopleFields[col])}`)
      return result
    }
  }

  const phone = hasValue(input.phone_number) ? String(input.phone_number).trim() : null
  const money = Array.isArray(input.person_money) ? input.person_money : []
  const links = Array.isArray(input.person_links) ? input.person_links : []

  // Idempotencia: buscar persona existente por name (+ phone si hay).
  let existQuery = `people?${eq('user_id', userId)}&${eq('name', name)}&select=*`
  if (phone) existQuery += `&${eq('phone_number', phone)}`
  const existing = await restGet(existQuery)
  const person = existing[0] ?? null

  let personId
  if (person) {
    // ── UPDATE (gap-fill) o SKIP ──────────────────────────────────────
    personId = person.id
    const updates = {}
    for (const [col, val] of Object.entries(peopleFields)) {
      if (col === 'name') continue // ya matcheado, no lo tocamos
      if (!hasValue(val)) continue
      if (isEmptyValue(col, person[col])) updates[col] = val
    }
    if (Object.keys(updates).length > 0) {
      result.updates = updates
      if (COMMIT) await restPatch('people', eq('id', personId), updates)
    }
    // defaults no aplican a rows existentes (ya tienen sus NOT NULL).
    result.defaulted = []
  } else {
    // ── INSERT ────────────────────────────────────────────────────────
    personId = newPersonId()
    const slugBase = hasValue(peopleFields.slug) ? generateSlug(peopleFields.slug) : generateSlug(name)
    const slug = await ensureUniqueSlug(slugBase, userId)
    const row = { ...peopleFields, id: personId, user_id: userId, slug }
    result.insertRow = row
    if (COMMIT) {
      const inserted = await restInsert('people', row)
      personId = inserted[0]?.id ?? personId
    }
  }

  // ── Anexa: person_money (idempotente por signature) ──────────────────
  if (money.length) {
    const existingMoney = person
      ? await restGet(`person_money?${eq('person_id', personId)}&select=*`)
      : []
    const seen = new Set(existingMoney.map(moneySig))
    for (const m of money) {
      if (seen.has(moneySig(m))) continue
      seen.add(moneySig(m))
      result.moneyAdd += 1
      if (COMMIT) await restInsert('person_money', { ...m, person_id: personId, user_id: userId })
    }
  }

  // ── Anexa: person_links (idempotente por (person_b_id, kind)) ────────
  if (links.length) {
    const existingLinks = person
      ? await restGet(`person_links?${eq('person_a_id', personId)}&select=person_b_id,kind`)
      : []
    const seen = new Set(existingLinks.map(linkSig))
    for (const l of links) {
      if (!l?.person_b_id || !l?.kind) {
        result.errors.push(`person_link invalido (requiere person_b_id + kind): ${JSON.stringify(l)}`)
        continue
      }
      // person_b_id debe referenciar una persona existente (FK).
      const target = await restGet(`people?${eq('id', l.person_b_id)}&select=id&limit=1`)
      if (!target.length) {
        result.errors.push(`person_link apunta a person_b_id inexistente: ${l.person_b_id}`)
        continue
      }
      if (seen.has(linkSig(l))) continue
      seen.add(linkSig(l))
      result.linksAdd += 1
      if (COMMIT) {
        await restInsert('person_links', {
          id: newLinkId(), user_id: userId, person_a_id: personId,
          person_b_id: l.person_b_id, kind: l.kind,
        })
      }
    }
  }

  // ── Decidir action final ─────────────────────────────────────────────
  if (result.errors.length && !person && !COMMIT) {
    // errores solo en anexas; la persona base igual se insertaria.
  }
  if (!person) {
    result.action = 'insert'
  } else if (result.updates || result.moneyAdd || result.linksAdd) {
    result.action = 'update'
  } else {
    result.action = 'skip'
  }
  return result
}

// ─── Reporte por persona ─────────────────────────────────────────────
function printPlan(r, i) {
  const tag = { insert: 'INSERT', update: 'UPDATE', skip: 'SKIP  ', error: 'ERROR ' }[r.action]
  console.log(`\n[${i + 1}] ${tag}  ${r.name ?? '(sin name)'}`)
  if (r.defaulted.length) console.log(`      defaults aplicados: ${r.defaulted.join(', ')}`)
  if (r.updates) console.log(`      gap-fill campos: ${Object.keys(r.updates).join(', ')}`)
  if (r.moneyAdd) console.log(`      person_money a agregar: ${r.moneyAdd}`)
  if (r.linksAdd) console.log(`      person_links a agregar: ${r.linksAdd}`)
  for (const n of r.notes) console.log(`      nota: ${n}`)
  for (const e of r.errors) console.log(`      error: ${e}`)
}

// ─── Main ────────────────────────────────────────────────────────────
async function main() {
  let data
  try {
    data = JSON.parse(readFileSync(jsonPath, 'utf8'))
  } catch (e) {
    console.error(`No se pudo leer/parsear ${jsonPath}: ${e.message}`)
    process.exit(2)
  }
  if (!Array.isArray(data)) {
    console.error('El JSON debe ser un ARRAY de personas.')
    process.exit(2)
  }

  // user_id: del primer row existente de people, o del flag --user-id.
  let userId = userIdFlag
  if (!userId) {
    const rows = await restGet('people?select=user_id&limit=1')
    userId = rows[0]?.user_id
    if (!userId) {
      console.error(
        'No hay filas en people para derivar user_id. Crea al menos una persona ' +
        'desde el app, o pasa --user-id=<uuid>.',
      )
      process.exit(2)
    }
  }

  console.log(`Modo: ${COMMIT ? 'COMMIT (escribe)' : 'DRY-RUN (no escribe)'}`)
  console.log(`user_id: ${userId}`)
  console.log(`Personas en el JSON: ${data.length}`)

  const counters = { insert: 0, update: 0, skip: 0, error: 0 }
  for (let i = 0; i < data.length; i++) {
    let r
    try {
      r = await processPerson(data[i], userId)
    } catch (e) {
      r = { name: data[i]?.name, action: 'error', defaulted: [], updates: null, moneyAdd: 0, linksAdd: 0, errors: [e.message], notes: [] }
    }
    counters[r.action] += 1
    printPlan(r, i)
  }

  console.log('\n─── Reporte final ───')
  console.log(`  Insertadas:  ${counters.insert}`)
  console.log(`  Actualizadas:${counters.update}`)
  console.log(`  Saltadas:    ${counters.skip}`)
  console.log(`  Con error:   ${counters.error}`)
  if (!COMMIT) console.log('\n(DRY-RUN — no se escribio nada. Corre con --commit para aplicar.)')
}

main().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
