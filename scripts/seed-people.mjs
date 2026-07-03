#!/usr/bin/env node
/**
 * SIR V2 — seed-people.mjs
 *
 * Carga un batch de personas + tags + observaciones + org_link + person_links
 * desde un JSON (default: data/people-batch.json; formato ver
 * data/seed-batches/README.md) a Supabase, vía REST /rest/v1 con la service key.
 *
 * FILOSOFÍA (spec de esta corrida):
 *  1. Conexión estilo scripts/audit-prod-schema.mjs: loadEnv('.env.local'),
 *     NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, REST /rest/v1.
 *  2. user_id = del PRIMER row existente de `people` (no un env aparte).
 *  3. IDEMPOTENTE por name(+phone): si la persona existe, UPDATE de SOLO los
 *     campos vacíos en DB que el JSON completa. Nunca duplica, nunca pisa lo lleno.
 *  4. GRUPO HNG (org del usuario): si ya hay org_profiles con ese slug, se REUSA.
 *     NUNCA se crea/duplica un org_profiles acá.
 *  5. person_links: SELF → sentinel person_a_id='self' (mig 0058, sin FK del lado A;
 *     person_b SIEMPRE persona real). kind es texto libre → se guarda tal cual.
 *     _peso/_context NO caben en person_links (mig 0035 solo a/b/kind) → van a una
 *     observación manual_note ligada a la persona real del vínculo.
 *  6. SELF-CHECK antes de escribir: si algo no resuelve (user_id, ids de link,
 *     enum/NOT-NULL inválido, duplicado ambiguo) → ABORTA sin escribir.
 *  7. READ-BACK: tras escribir, re-lee de la DB y muestra lo que quedó.
 *
 * USO:
 *   node scripts/seed-people.mjs                      # dry-run (self-check + plan)
 *   node scripts/seed-people.mjs --commit             # escribe si el self-check pasa
 *   node scripts/seed-people.mjs otro.json --commit   # otro batch
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ─── env (patrón audit-prod-schema.mjs) ──────────────────────────────
function loadEnv(path) {
  const out = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}
const env = loadEnv('.env.local')
const BASE = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!BASE || !KEY) {
  console.error('[seed] MISSING_ENV', { url: !!BASE, key: !!KEY })
  process.exit(2)
}
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }

const argv = process.argv.slice(2)
const COMMIT = argv.includes('--commit')
const batchPath = argv.find((a) => !a.startsWith('--')) || 'data/people-batch.json'
const batch = JSON.parse(readFileSync(resolve(batchPath), 'utf8'))

// ─── REST helpers ────────────────────────────────────────────────────
async function rGet(pathq) {
  const r = await fetch(`${BASE}/rest/v1/${pathq}`, { headers: H })
  const json = await r.json().catch(() => null)
  return { status: r.status, json }
}
async function rWrite(method, pathq, body) {
  const r = await fetch(`${BASE}/rest/v1/${pathq}`, {
    method, headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(body),
  })
  const json = await r.json().catch(() => null)
  return { status: r.status, json, ok: r.status >= 200 && r.status < 300 }
}
const eq = (v) => `eq.${encodeURIComponent(v)}`

// ─── helpers puros ────────────────────────────────────────────────────
function generateSlug(name) {
  return String(name || 'persona')
    .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'persona'
}
function nowIso() { return new Date().toISOString() }
function newId(prefix) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` }
const isEmpty = (v) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)

// gender: schema 0069 CHECK ('female','male','other'); JSON viene en ES.
function normGender(raw) {
  if (!raw) return null
  const s = String(raw).toLowerCase().trim()
  if (['female', 'femenino', 'femenina', 'mujer', 'f'].includes(s)) return 'female'
  if (['male', 'masculino', 'hombre', 'varon', 'varón', 'm'].includes(s)) return 'male'
  if (['other', 'otro', 'no-binario', 'no binario', 'nb'].includes(s)) return 'other'
  return null
}

const VALID_REL = new Set(['family', 'friend', 'romantic', 'professional', 'mentor', 'mentee', 'acquaintance'])
const VALID_CAT = new Set(['inner_circle', 'close', 'network', 'peripheral'])
const VALID_ENERGY = new Set(['energizing', 'draining', 'neutral'])
// observations.capture_type permitido (mig 0010).
const VALID_CAPTURE = new Set(['whatsapp_chat', 'whatsapp_info', 'instagram', 'linkedin', 'manual_note', 'voice_note', 'unknown'])

const problems = []
const problem = (msg) => problems.push(msg)

async function ensureUniqueSlug(base, userId) {
  let slug = base
  for (let n = 2; n <= 20; n++) {
    const { json } = await rGet(`people?user_id=${eq(userId)}&slug=${eq(slug)}&select=id&limit=1`)
    if (!Array.isArray(json) || json.length === 0) return slug
    slug = `${base}-${n}`
  }
  return `${base}-${Date.now().toString(36).slice(-4)}`
}

// ═══════════════════════ PLAN (sin escribir) ═══════════════════════════
console.log(`[seed] batch=${batchPath} · modo=${COMMIT ? 'COMMIT' : 'DRY-RUN'}`)

// 1. user_id del primer row de people.
const uidRes = await rGet('people?select=user_id&limit=1')
if (uidRes.status !== 200) { problem(`No pude leer people (status ${uidRes.status}): ${JSON.stringify(uidRes.json)}`) }
const USER_ID = Array.isArray(uidRes.json) && uidRes.json[0]?.user_id ? uidRes.json[0].user_id : null
if (!USER_ID) problem('No hay filas en `people` de donde tomar user_id (o RLS/clave inválida).')

// 2. Plan de personas (insert vs update) + observaciones.
const nameToId = new Map()   // name/alias del batch → id resuelto (existente o nuevo)
const peoplePlans = []       // { mode, id, name, insertRow?, patch?, existing?, obsPlan[] }

if (USER_ID) {
  for (const p of batch.people ?? []) {
    const person = p.person
    const gender = normGender(person.gender)

    // Validaciones de enums / rangos (si fallan, el insert reventaría → abortamos).
    const rel = person.relationship ?? 'professional'
    const cat = person.category ?? 'network'
    const energy = person.energy_impact ?? 'neutral'
    const imp = person.importance_score ?? 5
    const trust = person.trust_level ?? 5
    if (!VALID_REL.has(rel)) problem(`${person.name}: relationship inválido "${rel}"`)
    if (!VALID_CAT.has(cat)) problem(`${person.name}: category inválido "${cat}"`)
    if (!VALID_ENERGY.has(energy)) problem(`${person.name}: energy_impact inválido "${energy}"`)
    if (!(Number.isInteger(imp) && imp >= 1 && imp <= 10)) problem(`${person.name}: importance_score fuera de 1-10 (${imp})`)
    if (!(Number.isInteger(trust) && trust >= 1 && trust <= 10)) problem(`${person.name}: trust_level fuera de 1-10 (${trust})`)

    // Lookup idempotente por name (+ phone si el JSON lo trae).
    let filter = `user_id=${eq(USER_ID)}&name=${eq(person.name)}&select=*`
    if (person.phone_number) filter += `&phone_number=${eq(person.phone_number)}`
    const exRes = await rGet(`people?${filter}`)
    const matches = Array.isArray(exRes.json) ? exRes.json : []
    if (matches.length > 1) {
      problem(`${person.name}: ${matches.length} personas con ese name — no puedo actualizar idempotentemente sin ambigüedad.`)
    }
    const existing = matches.length === 1 ? matches[0] : null

    // Campos candidatos del JSON (col → valor).
    const jsonFields = {
      alias: person.alias ?? null,
      relationship: rel,
      category: cat,
      importance_score: imp,
      trust_level: trust,
      energy_impact: energy,
      contact_frequency: person.contact_frequency ?? '',
      last_contact: person.last_contact ?? null,
      location: person.location ?? null,
      tags: p.tags ?? [],
      notes: person.notes ?? '',
      linkedin_url: person.linkedin_url ?? null,
      title: person.title ?? null,
      organization: person.organization ?? null,
      education: person.education ?? null,
      gender,
    }

    let planEntry
    if (existing) {
      // UPDATE: SOLO campos vacíos en DB que el JSON completa. Nunca pisa lo lleno.
      const patch = {}
      for (const [col, val] of Object.entries(jsonFields)) {
        if (!isEmpty(val) && isEmpty(existing[col])) patch[col] = val
      }
      if (Object.keys(patch).length > 0) patch.updated_at = nowIso()
      planEntry = { mode: 'update', id: existing.id, name: person.name, patch, existing, obsPlan: [] }
    } else {
      // INSERT: NOT NULLs completos con defaults del schema.
      const id = newId('per')
      const slug = await ensureUniqueSlug(generateSlug(person.alias || person.name), USER_ID)
      const insertRow = {
        id, user_id: USER_ID, slug, name: person.name,
        ...jsonFields,
        created_at: nowIso(), updated_at: nowIso(),
      }
      planEntry = { mode: 'insert', id, name: person.name, insertRow, obsPlan: [] }
    }
    nameToId.set(person.name, planEntry.id)
    if (person.alias) nameToId.set(person.alias, planEntry.id)

    // Observaciones del JSON (dedupe por person+capture_type+observed_at).
    for (const o of p.observations ?? []) {
      const ct = o.capture_type
      if (!VALID_CAPTURE.has(ct)) { problem(`${person.name}: capture_type inválido "${ct}"`); continue }
      const observedAt = o.observed_at ? new Date(o.observed_at).toISOString() : nowIso()
      let dup = false
      if (existing) {
        const dchk = await rGet(`observations?user_id=${eq(USER_ID)}&person_id=${eq(existing.id)}&capture_type=${eq(ct)}&observed_at=${eq(observedAt)}&select=id&limit=1`)
        dup = Array.isArray(dchk.json) && dchk.json.length > 0
      }
      if (dup) continue
      planEntry.obsPlan.push({
        id: newId('obs'), user_id: USER_ID, person_id: planEntry.id,
        capture_type: ct, data: o.data ?? {}, confidence: o.confidence ?? 'medium',
        observed_at: observedAt, is_obsolete: false, created_at: nowIso(),
      })
    }

    peoplePlans.push(planEntry)
  }
}

// 3. org_link → GRUPO HNG: reusar org_profiles existente, NUNCA duplicar.
let orgStatus = '—'
const orgLink = (batch.people ?? []).map((p) => p.org_link).find(Boolean)
if (orgLink?.name) {
  const orgSlug = generateSlug(orgLink.name)
  const orgRes = await rGet(`org_profiles?user_id=${eq(USER_ID ?? '')}&org_slug=${eq(orgSlug)}&select=id,org_slug,name&limit=1`)
  if (Array.isArray(orgRes.json) && orgRes.json.length > 0) {
    orgStatus = `REUSA org_profiles existente (${orgRes.json[0].id}) · slug=${orgSlug}`
  } else if (orgRes.status === 200) {
    // No existe: NO creamos (evita duplicar). people.organization ya lleva el nombre.
    orgStatus = `sin org_profiles "${orgLink.name}" — no se crea (solo people.organization). Área "${orgLink.area ?? '—'}" va en observations.`
  } else {
    orgStatus = `no pude leer org_profiles (status ${orgRes.status})`
  }
}

// 4. person_links explícitos: resolver ids, kind tal cual, _peso/_context → obs.
const linkPlans = []      // { row, skip, meta }
const metaObsPlans = []   // observaciones de metadata del vínculo
for (const l of batch.person_links ?? []) {
  const aSelf = l.person_a === 'SELF' || l.person_a === 'self'
  const bSelf = l.person_b === 'SELF' || l.person_b === 'self'
  const aId = aSelf ? 'self' : nameToId.get(l.person_a)
  const bId = bSelf ? 'self' : nameToId.get(l.person_b)
  if (bSelf) { problem(`person_link ${l.person_a}→${l.person_b}: person_b='self' no lo soporta el schema (FK viva del lado B). Invertí a person_a='SELF'.`); continue }
  if (!aId) { problem(`person_link: "${l.person_a}" no resuelve a un id (no está en el batch).`); continue }
  if (!bId) { problem(`person_link: "${l.person_b}" no resuelve a un id (no está en el batch).`); continue }

  // Dedupe por unique (user_id, a, b, kind).
  const dchk = await rGet(`person_links?user_id=${eq(USER_ID)}&person_a_id=${eq(aId)}&person_b_id=${eq(bId)}&kind=${eq(l.kind)}&select=id&limit=1`)
  const exists = Array.isArray(dchk.json) && dchk.json.length > 0
  linkPlans.push({
    skip: exists,
    row: { id: newId('lnk'), user_id: USER_ID, person_a_id: aId, person_b_id: bId, kind: l.kind, created_at: nowIso() },
  })

  // _peso / _context → observación manual_note en la persona REAL del vínculo
  // (si a='self', va en b; si no, en a). kind se guarda descriptivo aparte acá.
  // Dedupe idempotente por (person, manual_note, data->>kind, data->>from).
  if (l._peso || l._context) {
    const anchor = aSelf ? bId : aId
    const mchk = await rGet(`observations?user_id=${eq(USER_ID)}&person_id=${eq(anchor)}&capture_type=eq.manual_note&data->>kind=${eq(l.kind)}&data->>from=${eq(l.person_a)}&select=id&limit=1`)
    const metaExists = Array.isArray(mchk.json) && mchk.json.length > 0
    if (!metaExists) {
      metaObsPlans.push({
        id: newId('obs'), user_id: USER_ID, person_id: anchor,
        capture_type: 'manual_note', confidence: 'medium', observed_at: nowIso(), is_obsolete: false,
        data: { link_meta: true, kind: l.kind, from: l.person_a, to: l.person_b, peso: l._peso ?? null, context: l._context ?? null },
        created_at: nowIso(),
      })
    }
  }
}

// ═══════════════════════ SELF-CHECK ═══════════════════════════════════
console.log('\n[seed] PLAN:')
for (const pe of peoplePlans) {
  if (pe.mode === 'insert') console.log(`  + INSERT ${pe.name} (${pe.id}) · obs=${pe.obsPlan.length}`)
  else console.log(`  ~ UPDATE ${pe.name} (${pe.id}) · campos nuevos: ${Object.keys(pe.patch).filter((k) => k !== 'updated_at').join(', ') || '(ninguno)'} · obs=${pe.obsPlan.length}`)
}
console.log(`  org: ${orgStatus}`)
for (const lp of linkPlans) console.log(`  ${lp.skip ? '· (ya existe, skip)' : '+ LINK'} ${lp.row.person_a_id} —[${lp.row.kind}]→ ${lp.row.person_b_id}`)
console.log(`  meta-obs de vínculos: ${metaObsPlans.length}`)

if (problems.length > 0) {
  console.error('\n[seed] ✗ SELF-CHECK FALLÓ — no se escribe nada:')
  for (const p of problems) console.error(`   - ${p}`)
  process.exit(1)
}
console.log('\n[seed] ✓ SELF-CHECK OK (plan sano).')

if (!COMMIT) {
  console.log('[seed] DRY-RUN: no escribo. Corré con --commit para aplicar.')
  process.exit(0)
}

// ═══════════════════════ ESCRITURA ═══════════════════════════════════
console.log('\n[seed] Escribiendo…')
async function must(res, what) {
  if (!res.ok) { console.error(`[seed] ✗ ${what}: status ${res.status} · ${JSON.stringify(res.json)}`); process.exit(1) }
  return res
}

// people (insert o patch de solo campos nuevos)
for (const pe of peoplePlans) {
  if (pe.mode === 'insert') {
    await must(await rWrite('POST', 'people', pe.insertRow), `INSERT people ${pe.name}`)
    console.log(`  ✓ INSERT people ${pe.name}`)
  } else if (Object.keys(pe.patch).length > 0) {
    await must(await rWrite('PATCH', `people?id=${eq(pe.id)}`, pe.patch), `UPDATE people ${pe.name}`)
    console.log(`  ✓ UPDATE people ${pe.name} (${Object.keys(pe.patch).filter((k) => k !== 'updated_at').join(', ')})`)
  } else {
    console.log(`  · people ${pe.name} ya completa — sin cambios`)
  }
}
// observations (JSON + metadata de vínculos)
const allObs = [...peoplePlans.flatMap((pe) => pe.obsPlan), ...metaObsPlans]
for (const o of allObs) {
  await must(await rWrite('POST', 'observations', o), `INSERT observation ${o.capture_type}`)
}
if (allObs.length) console.log(`  ✓ observations insertadas: ${allObs.length}`)
// person_links
for (const lp of linkPlans) {
  if (lp.skip) { console.log(`  · link ${lp.row.kind} ya existía — skip`); continue }
  await must(await rWrite('POST', 'person_links', lp.row), `INSERT person_link ${lp.row.kind}`)
  console.log(`  ✓ LINK ${lp.row.person_a_id} —[${lp.row.kind}]→ ${lp.row.person_b_id}`)
}

// ═══════════════════════ READ-BACK ════════════════════════════════════
console.log('\n[seed] READ-BACK (releído de la DB):')
const ids = peoplePlans.map((pe) => pe.id)
const idList = ids.map((i) => encodeURIComponent(i)).join(',')

const backPeople = await rGet(`people?user_id=${eq(USER_ID)}&id=in.(${idList})&select=id,name,slug,organization,tags,importance_score,category,gender`)
console.log('\n  PERSONAS:')
console.log(JSON.stringify(backPeople.json, null, 2))

const backObs = await rGet(`observations?user_id=${eq(USER_ID)}&person_id=in.(${idList})&select=id,person_id,capture_type,confidence,observed_at&order=observed_at.desc`)
console.log('\n  OBSERVATIONS:')
console.log(JSON.stringify(backObs.json, null, 2))

const backLinks = await rGet(`person_links?user_id=${eq(USER_ID)}&or=(person_a_id.in.(${idList}),person_b_id.in.(${idList}))&select=id,person_a_id,person_b_id,kind`)
console.log('\n  PERSON_LINKS:')
console.log(JSON.stringify(backLinks.json, null, 2))

console.log('\n[seed] ✓ COMMIT + READ-BACK completos.')
