// SIR V2 — POST /api/seed/batch
//
// Recibe un JSON de batch (formato ver data/seed-batches/README.md) y devuelve
// el plan (dry-run) o lo aplica a la DB. Auth por sesión (RLS del user hace
// que ni siquiera necesitemos service role). Sin CLI, sin envs.
//
// Body: { batch: SeedBatchInput, dry: boolean }
// Response 200:
//   { plan: SeedPlan, applied: boolean, stats?: { people, observations, orgs, links } }
//   { error: string, detail?: string }

import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { buildSeedPlan, generateSlug, type SeedBatchInput } from '@/lib/seed/plan'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface Body {
  batch?: SeedBatchInput
  dry?: boolean
}

function errorJson(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: authData, error: authErr } = await supabase.auth.getUser()
  if (authErr || !authData?.user) {
    return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')
  }
  const userId = authData.user.id

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return errorJson(400, 'Body JSON inválido')
  }
  if (!body.batch || typeof body.batch !== 'object') {
    return errorJson(400, 'Falta `batch` (objeto con people[])')
  }

  const dry = body.dry !== false // default true

  // Slugs y orgs existentes en la DB del user, para el planner puro.
  const peopleInput = body.batch.people ?? []
  const candidateSlugs = new Set(
    peopleInput.map((p) => generateSlug(p.person.alias || p.person.name)),
  )
  const orgSlugs = new Set(
    peopleInput
      .map((p) => p.org_link?.name && generateSlug(p.org_link.name))
      .filter((s): s is string => !!s),
  )

  const [{ data: existingPeople }, { data: existingOrgs }] = await Promise.all([
    supabase
      .from('people')
      .select('slug')
      .eq('user_id', userId)
      .in('slug', [...candidateSlugs]),
    supabase
      .from('org_profiles')
      .select('org_slug')
      .eq('user_id', userId)
      .in('org_slug', [...orgSlugs]),
  ])
  const takenSlugs = new Set<string>((existingPeople ?? []).map((r) => (r as { slug: string }).slug))
  const takenOrgs = new Set<string>((existingOrgs ?? []).map((r) => (r as { org_slug: string }).org_slug))

  const plan = buildSeedPlan({
    input: body.batch,
    userId,
    slugTaken: (s) => takenSlugs.has(s),
    orgExists: (s) => takenOrgs.has(s),
  })

  if (dry) {
    return NextResponse.json({ plan, applied: false }, { status: 200 })
  }

  // ─── COMMIT ────────────────────────────────────────────────────
  // Orden: orgs → people → observations → links (respeta FKs).
  const stats = { people: 0, observations: 0, orgs: 0, links: 0, skippedLinks: 0 }

  for (const org of plan.orgs) {
    if (org.existing) continue
    const { existing: _ignored, ...row } = org
    const { error } = await supabase.from('org_profiles').insert(row)
    if (error) return errorJson(500, `org_profiles ${org.org_slug}: ${error.message}`)
    stats.orgs += 1
  }
  for (const p of plan.people) {
    const { error } = await supabase.from('people').insert(p)
    if (error) return errorJson(500, `people ${p.name}: ${error.message}`)
    stats.people += 1
  }
  for (const o of plan.observations) {
    const { error } = await supabase.from('observations').insert(o)
    if (error) return errorJson(500, `observations: ${error.message}`)
    stats.observations += 1
  }
  for (const l of plan.links) {
    const { inferred: _ig, ...row } = l
    const { error } = await supabase.from('person_links').insert(row)
    if (error) {
      // Fallback si 0107 no está aplicada aún: reintentar sin las 4 columnas.
      const isSchemaGap = /column .*(weight|context|source|confidence)/i.test(error.message)
      if (isSchemaGap) {
        const {
          weight: _w, context: _c, source: _s, confidence: _cf, ...bare
        } = row
        const { error: e2 } = await supabase.from('person_links').insert(bare)
        if (e2) return errorJson(500, `person_links (fallback): ${e2.message}`)
        stats.skippedLinks += 1
        continue
      }
      return errorJson(500, `person_links: ${error.message}`)
    }
    stats.links += 1
  }

  return NextResponse.json({ plan, applied: true, stats }, { status: 200 })
}
