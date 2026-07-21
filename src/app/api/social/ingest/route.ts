// SIR V2 — POST /api/social/ingest  (Parte A: reader social pasivo)
//
// Recibe capturas PASIVAS de la extensión (lo que Aaron ya ve al navegar IG/
// LinkedIn de su sesión — nada de requests automáticos). Resuelve el handle/URL/
// NOMBRE → persona, deriva una señal de timing (deriveSocialSignal) y la inserta
// en contact_activity → alimenta el veredicto "buen/mal momento" (Parte B).
//
// AUTO-BOOTSTRAP de LinkedIn: si matchea por NOMBRE una persona sin linkedin_url,
// se lo RELLENA con la URL capturada — así, con solo ver el perfil, queda seteado
// sin que Aaron cargue URLs a mano. No guarda contenido crudo: solo la señal.
//
// Auth: TOKEN (no sesión), MISMO esquema que /api/reader/ingest:
//   x-reader-token | Authorization: Bearer  ==  READER_INGEST_TOKEN

import { createHash } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { reportApiError } from '@/lib/observability/reportApiError'
import { deriveSocialSignal } from '@/lib/social-reader/derive'
import { buildPersonIndex, matchPerson, linkedinSlug, canonHandle, identityKey, type PersonLite } from '@/lib/social-reader/match'

/** Id determinístico de una señal no-asignada → una fila por (identidad, kind).
 *  Re-ver la misma cuenta actualiza la fila (upsert), no la duplica. */
function unmatchedId(userId: string, key: string, kind: string): string {
  return `usa_${createHash('sha1').update(`${userId}|${key}|${kind}`).digest('hex')}`
}

/** observed_at = el momento REAL de la actividad si vino y es razonable (no futuro,
 *  ≤14 días atrás); si no, ahora. Refleja SUS horas de actividad, no la captura. */
function resolveObservedAt(activityAt: string | undefined, nowIso: string): string {
  if (activityAt) {
    const t = Date.parse(activityAt)
    if (Number.isFinite(t) && t <= Date.now() + 60_000 && t > Date.now() - 14 * 86_400_000) return new Date(t).toISOString()
  }
  return nowIso
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

function errorJson(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function readToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization')
  if (auth?.startsWith('Bearer ')) return auth.slice(7).trim()
  return req.headers.get('x-reader-token')?.trim() || null
}

async function resolveUserId(admin: SupabaseClient): Promise<string | null> {
  const explicit = (process.env.READER_INGEST_USER_ID || process.env.HEALTH_INGEST_USER_ID)?.trim()
  if (explicit) return explicit
  const { data } = await admin.from('profiles').select('id').limit(2)
  const rows = (data ?? []) as Array<{ id: string }>
  return rows.length === 1 ? rows[0].id : null
}

interface SocialItem {
  platform: string
  handle?: string
  linkedinUrl?: string
  name?: string
  text?: string
  hasActiveStory?: boolean
  headline?: string
  /** ISO del momento REAL de la actividad (ej. cuándo posteó la story), si el
   *  interceptor lo pudo leer. Si no, se usa now() al insertar. */
  activityAt?: string
}

// Dedup: no insertamos la MISMA señal (persona+kind) más de una vez cada 6h.
const DEDUP_HOURS = 6

export async function POST(req: NextRequest) {
  const token = readToken(req)
  const expected = process.env.READER_INGEST_TOKEN?.trim()
  if (!expected) return errorJson(500, 'READER_INGEST_TOKEN no configurado en el server')
  if (!token || !safeEqual(token, expected)) return errorJson(401, 'Token inválido')

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return errorJson(500, 'Faltan credenciales de Supabase')
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  const userId = await resolveUserId(admin)
  if (!userId) return errorJson(500, 'No pude resolver el user id — seteá READER_INGEST_USER_ID')

  let body: { items?: unknown }
  try { body = (await req.json()) as typeof body } catch { return errorJson(400, 'JSON inválido') }
  const items = Array.isArray(body.items) ? (body.items as SocialItem[]).slice(0, 100) : []
  if (items.length === 0) return NextResponse.json({ inserted: 0, matched: 0, unmatched: 0, skipped: 0, backfilled: 0, promoted: 0 })

  const nowIso = new Date().toISOString()
  const sinceIso = new Date(Date.now() - DEDUP_HOURS * 3_600_000).toISOString()
  let inserted = 0, matched = 0, unmatched = 0, skipped = 0, backfilled = 0, promoted = 0

  try {
    // Personas una sola vez → índice para matcheo por handle/slug/nombre.
    const { data: peopleRows } = await admin
      .from('people').select('id, name, instagram_handle, linkedin_url, title').eq('user_id', userId).limit(2000)
    const people: PersonLite[] = (peopleRows ?? []).map((r) => ({
      id: String(r.id), name: String(r.name ?? ''),
      instagramHandle: (r.instagram_handle as string | null) ?? null,
      linkedinUrl: (r.linkedin_url as string | null) ?? null,
      title: (r.title as string | null) ?? null,
    }))
    const index = buildPersonIndex(people)

    // AUTO-PROMOCIÓN: señales que se guardaron sin asignar y que AHORA matchean
    // (se les seteó el handle / se cargó la persona) → a contact_activity + borrar
    // de la bandeja. matchPerson es puro/en-memoria → barato aunque haya muchas.
    try {
      const { data: pend } = await admin
        .from('unmatched_social_activity')
        .select('id, platform, handle, name, kind, detail, observed_at')
        .eq('user_id', userId).limit(2000)
      const doneIds: string[] = []
      for (const u of (pend ?? []) as Array<{ id: string; platform: string; handle: string | null; name: string | null; kind: string; detail: string | null; observed_at: string }>) {
        const pm = matchPerson(index, { platform: u.platform, handle: u.handle ?? undefined, name: u.name ?? undefined })
        if (!pm) continue
        const { data: rec } = await admin
          .from('contact_activity').select('id')
          .eq('user_id', userId).eq('person_id', pm.person.id).eq('kind', u.kind)
          .gte('observed_at', sinceIso).limit(1)
        if (!rec || rec.length === 0) {
          const { error } = await admin.from('contact_activity').insert({
            user_id: userId, person_id: pm.person.id, kind: u.kind, detail: u.detail, source: u.platform, observed_at: u.observed_at,
          })
          if (!error) promoted++
        }
        doneIds.push(u.id)
      }
      if (doneIds.length > 0) await admin.from('unmatched_social_activity').delete().in('id', doneIds)
    } catch { /* fail-open: la tabla 0152 puede no haber propagado aún */ }

    for (const it of items) {
      const platform = typeof it.platform === 'string' ? it.platform : ''
      if (platform !== 'instagram' && platform !== 'linkedin') { skipped++; continue }

      const m = matchPerson(index, { platform, handle: it.handle, linkedinUrl: it.linkedinUrl, name: it.name })
      if (!m) {
        unmatched++
        // NO se pierde: si la señal tiene identidad (handle/nombre) y deriva algo,
        // la retenemos deduplicada en la bandeja "¿quién es quién?" para asignarla
        // luego (asignar setea el handle → matchea y se auto-promueve). Fail-soft.
        try {
          const sig = deriveSocialSignal({ platform, text: it.text ?? null, hasActiveStory: it.hasActiveStory === true, headline: it.headline ?? null, priorHeadline: null })
          const key = identityKey({ platform, handle: it.handle, linkedinUrl: it.linkedinUrl, name: it.name })
          if (sig && key) {
            await admin.from('unmatched_social_activity').upsert({
              id: unmatchedId(userId, key, sig.kind), user_id: userId, platform,
              handle: it.handle ? canonHandle(it.handle) : null, name: it.name ?? null,
              kind: sig.kind, detail: sig.detail, observed_at: resolveObservedAt(it.activityAt, nowIso),
            }, { onConflict: 'id' })
          }
        } catch { /* fail-soft: tabla 0152 sin propagar */ }
        continue
      }
      matched++
      const person = m.person

      // Auto-bootstrap: matcheó por nombre (o slug) una persona sin URL → la seteamos.
      if (platform === 'linkedin' && !person.linkedinUrl && it.linkedinUrl) {
        const slug = linkedinSlug(it.linkedinUrl)
        if (slug) {
          const canonUrl = `https://linkedin.com/in/${slug}`
          const { error: upErr } = await admin.from('people').update({ linkedin_url: canonUrl }).eq('user_id', userId).eq('id', person.id)
          if (!upErr) { person.linkedinUrl = canonUrl; backfilled++ }
        }
      }
      // Auto-bootstrap IG (idea de Aaron, "quién es quién" por NOMBRE, no por foto):
      // si matcheó por nombre una persona sin instagram_handle, lo rellenamos con el
      // handle del tray. Así, con solo cargar tu feed, los handles se llenan solos.
      if (platform === 'instagram' && m.matchedBy === 'name' && !person.instagramHandle && it.handle) {
        const canon = canonHandle(it.handle)
        if (canon) {
          const { error: upErr } = await admin.from('people').update({ instagram_handle: canon }).eq('user_id', userId).eq('id', person.id)
          if (!upErr) { person.instagramHandle = canon; backfilled++ }
        }
      }

      const signal = deriveSocialSignal({
        platform,
        text: it.text ?? null,
        hasActiveStory: it.hasActiveStory === true,
        headline: it.headline ?? null,
        priorHeadline: platform === 'linkedin' ? (person.title ?? null) : null,
      })
      if (!signal) { skipped++; continue }

      const { data: recent } = await admin
        .from('contact_activity')
        .select('id')
        .eq('user_id', userId).eq('person_id', person.id).eq('kind', signal.kind)
        .gte('observed_at', sinceIso)
        .limit(1)
      if (recent && recent.length > 0) { skipped++; continue }

      const observedAt = resolveObservedAt(it.activityAt, nowIso)
      const { error: insErr } = await admin.from('contact_activity').insert({
        user_id: userId, person_id: person.id, kind: signal.kind, detail: signal.detail,
        source: platform, observed_at: observedAt,
      })
      if (insErr) { skipped++; continue }
      inserted++
    }
  } catch (e) {
    reportApiError(e, { route: 'social/ingest' })
    return errorJson(500, 'Fallo procesando la ingesta', e instanceof Error ? e.message : String(e))
  }

  return NextResponse.json({ inserted, matched, unmatched, skipped, backfilled, promoted })
}
