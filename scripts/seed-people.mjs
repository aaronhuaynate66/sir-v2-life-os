#!/usr/bin/env node
/**
 * SIR V2 — seed-people.mjs
 *
 * Carga a Supabase un batch de personas + observaciones + org_profile +
 * person_links desde un JSON con el formato acordado (ver
 * data/seed-batches/README.md y el ejemplo 2026-07-01-linkedin-hng.json).
 *
 * FILOSOFÍA:
 *  1. Dry-run por default → jamás escribe salvo `--commit`.
 *  2. Idempotente por slug: reprocesar el mismo batch no crea duplicados.
 *  3. Respeta el schema real (mig 0107 para person_links con metadata).
 *  4. GRUPO HNG es la empresa del usuario — si ya existe org_profile con
 *     ese slug, se REUSA (nunca se sobreescribe).
 *
 * USO:
 *   node scripts/seed-people.mjs data/seed-batches/mi-batch.json          # dry
 *   node scripts/seed-people.mjs data/seed-batches/mi-batch.json --commit # write
 *
 * ENV:
 *   NEXT_PUBLIC_SUPABASE_URL      — url del proyecto
 *   SUPABASE_SERVICE_ROLE_KEY     — service role (NO ANON) para bypass RLS
 *   SEED_USER_ID                  — uuid del auth.users al que asignar todo
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

// ─── env ─────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const USER_ID = process.env.SEED_USER_ID

if (!SUPABASE_URL || !SERVICE_KEY || !USER_ID) {
  console.error('[seed] Faltan envs: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SEED_USER_ID')
  process.exit(1)
}

const [, , batchPath, ...flags] = process.argv
if (!batchPath) {
  console.error('[seed] Uso: node scripts/seed-people.mjs <path-al-json> [--commit]')
  process.exit(1)
}
const COMMIT = flags.includes('--commit')

const absPath = resolve(batchPath)
console.log(`[seed] Leyendo batch: ${absPath}`)
const batch = JSON.parse(readFileSync(absPath, 'utf8'))

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

// ─── helpers ─────────────────────────────────────────────────────────
function generateSlug(name) {
  return String(name || 'persona')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'persona'
}

async function ensureUniqueSlug(baseSlug) {
  let slug = baseSlug
  let n = 2
  while (true) {
    const { data } = await admin
      .from('people')
      .select('id')
      .eq('user_id', USER_ID)
      .eq('slug', slug)
      .maybeSingle()
    if (!data) return slug
    slug = `${baseSlug}-${n++}`
    if (n > 20) throw new Error(`No pude generar un slug único para ${baseSlug}`)
  }
}

function nowIso() { return new Date().toISOString() }
function newId(prefix) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` }

// ─── plan de escritura ───────────────────────────────────────────────
async function planPerson(p) {
  const person = p.person
  const baseSlug = generateSlug(person.alias || person.name)
  const slug = await ensureUniqueSlug(baseSlug)
  const id = newId('per')

  const row = {
    id,
    user_id: USER_ID,
    slug,
    name: person.name,
    alias: person.alias ?? null,
    relationship: person.relationship ?? 'professional',
    category: person.category ?? 'network',
    importance_score: person.importance_score ?? 5,
    trust_level: person.trust_level ?? 5,
    energy_impact: person.energy_impact ?? 'neutral',
    contact_frequency: person.contact_frequency ?? '',
    last_contact: person.last_contact ?? null,
    location: person.location ?? null,
    tags: p.tags ?? [],
    notes: person.notes ?? '',
    linkedin_url: person.linkedin_url ?? null,
    instagram_handle: person.instagram_handle ?? null,
    phone_number: person.phone_number ?? null,
    title: person.title ?? null,
    organization: person.organization ?? null,
    education: person.education ?? null,
    gender: person.gender ?? null,
    created_at: nowIso(),
    updated_at: nowIso(),
  }

  const obs = (p.observations ?? []).map((o) => ({
    id: newId('obs'),
    user_id: USER_ID,
    person_id: id,
    capture_type: o.capture_type,
    data: o.data ?? {},
    confidence: o.confidence ?? 'medium',
    observed_at: o.observed_at ? new Date(o.observed_at).toISOString() : nowIso(),
    is_obsolete: false,
    source_image_path: null,
    storage_bucket: null,
    detector_data: null,
    user_edits: null,
    created_at: nowIso(),
  }))

  const orgSlug = p.org_link?.name ? generateSlug(p.org_link.name) : null

  return { row, obs, orgSlug, orgLink: p.org_link ?? null }
}

async function planOrgProfile(orgSlug, orgLink) {
  const { data } = await admin
    .from('org_profiles')
    .select('id, org_slug')
    .eq('user_id', USER_ID)
    .eq('org_slug', orgSlug)
    .maybeSingle()
  if (data) return { existing: true, id: data.id, org_slug: orgSlug }
  return {
    existing: false,
    id: newId('org'),
    user_id: USER_ID,
    org_slug: orgSlug,
    name: orgLink.name,
    description: null,
    website: null,
    notes: orgLink.warning ?? null,
    source: 'linkedin_batch',
    sectors: [],
    created_at: nowIso(),
    updated_at: nowIso(),
  }
}

async function planPersonLinks(peoplePlans) {
  // Si el batch trae >1 persona con la misma org+área, las linkeamos como
  // 'colega' con weight=6 (default declarativo). El schema gap lo cierra 0107.
  const links = []
  for (let i = 0; i < peoplePlans.length; i++) {
    for (let j = i + 1; j < peoplePlans.length; j++) {
      const a = peoplePlans[i]
      const b = peoplePlans[j]
      const sameOrg = a.orgSlug && a.orgSlug === b.orgSlug
      const sameArea = a.orgLink?.area && b.orgLink?.area && a.orgLink.area === b.orgLink.area
      if (!sameOrg) continue
      const kind = sameArea ? 'colega_area' : 'colega'
      const context = sameArea
        ? `${a.orgLink.name} · área ${a.orgLink.area}`
        : `${a.orgLink.name}`
      links.push({
        id: newId('lnk'),
        user_id: USER_ID,
        person_a_id: a.row.id,
        person_b_id: b.row.id,
        kind,
        weight: sameArea ? 7 : 5,
        context,
        source: 'linkedin_batch',
        confidence: 'medium',
        created_at: nowIso(),
      })
    }
  }
  return links
}

// ─── ejecución ───────────────────────────────────────────────────────
console.log(`[seed] Modo: ${COMMIT ? 'COMMIT (escribe en Supabase)' : 'DRY-RUN (solo imprime)'}`)
console.log(`[seed] Batch: ${batch._meta?.batch ?? '(sin _meta.batch)'}`)
console.log(`[seed] Personas en el batch: ${batch.people?.length ?? 0}\n`)

const peoplePlans = []
const orgsByS = new Map()

for (const p of batch.people ?? []) {
  const plan = await planPerson(p)
  peoplePlans.push(plan)
  if (plan.orgSlug && !orgsByS.has(plan.orgSlug)) {
    const org = await planOrgProfile(plan.orgSlug, plan.orgLink)
    orgsByS.set(plan.orgSlug, org)
  }
  console.log(`  ✓ ${plan.row.name} → slug=${plan.row.slug} · obs=${plan.obs.length} · org=${plan.orgSlug || '—'}`)
}

const links = await planPersonLinks(peoplePlans)
console.log(`\n[seed] Person links entre el batch: ${links.length}`)
for (const l of links) console.log(`  · ${l.person_a_id} —[${l.kind}, w=${l.weight}]→ ${l.person_b_id}`)

console.log('\n[seed] Org profiles:')
for (const [s, o] of orgsByS) console.log(`  · ${s} ${o.existing ? '(YA EXISTE — se reusa)' : '(nuevo)'}`)

if (!COMMIT) {
  console.log('\n[seed] DRY-RUN completo. Volvé a correr con --commit para escribir.')
  process.exit(0)
}

console.log('\n[seed] Escribiendo…')

// Orden: orgs → people → observations → links (respeta FKs).
for (const [, o] of orgsByS) {
  if (o.existing) continue
  const { existing, ...row } = o
  const { error } = await admin.from('org_profiles').insert(row)
  if (error) throw new Error(`org_profiles ${o.org_slug}: ${error.message}`)
  console.log(`  ✓ org_profiles ${o.org_slug}`)
}
for (const plan of peoplePlans) {
  const { error } = await admin.from('people').insert(plan.row)
  if (error) throw new Error(`people ${plan.row.name}: ${error.message}`)
  console.log(`  ✓ people ${plan.row.name}`)
}
for (const plan of peoplePlans) {
  for (const o of plan.obs) {
    const { error } = await admin.from('observations').insert(o)
    if (error) throw new Error(`observations ${plan.row.name}: ${error.message}`)
  }
  if (plan.obs.length > 0) console.log(`  ✓ observations ${plan.row.name} · ${plan.obs.length}`)
}
for (const l of links) {
  const { error } = await admin.from('person_links').insert(l)
  if (error) {
    // Fail-open si 0107 no está: intentar sin las columnas nuevas.
    if (/column "weight"|column "context"|column "source"|column "confidence"/i.test(error.message)) {
      const { weight, context, source, confidence, ...bare } = l
      const { error: e2 } = await admin.from('person_links').insert(bare)
      if (e2) throw new Error(`person_links (fallback): ${e2.message}`)
      console.log(`  ⚠ person_links ${l.kind} · fallback (0107 no aplicada) · sin metadata`)
      continue
    }
    throw new Error(`person_links: ${error.message}`)
  }
  console.log(`  ✓ person_links ${l.kind} w=${l.weight}`)
}

console.log('\n[seed] ✓ COMMIT completado.')
