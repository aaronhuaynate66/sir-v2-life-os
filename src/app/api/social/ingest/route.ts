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
import { snapshotUnmatchedAvatar } from '@/lib/social-reader/avatarSnapshot'

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
  avatarUrl?: string
  text?: string
  hasActiveStory?: boolean
  headline?: string
  /** ISO del momento REAL de la actividad (ej. cuándo posteó la story), si el
   *  interceptor lo pudo leer. Si no, se usa now() al insertar. */
  activityAt?: string
  /** Gente que Aaron SIGUE y que también sigue esta cuenta — el renglón
   *  "Seguido por fulano, mengano y N más que sigues" del perfil de Instagram.
   *  Es el único lugar donde ese dato existe (ninguna API lo expone) y es lo que
   *  permite ver INTERESES EN COMÚN en el grafo. Opcional: el reader lo manda
   *  cuando visita el perfil de una página. */
  followedBy?: Array<{ handle?: string; name?: string }>
}

/**
 * Guarda "estas personas de tu círculo también siguen esta página". Resuelve
 * cada seguidor contra los contactos ya cargados (mismo matcher que la bandeja);
 * si todavía no es un contacto, se guarda el handle/nombre crudo y `person_id`
 * queda null — se resolverá cuando esa persona exista. Idempotente por
 * (usuario, página, seguidor). Fail-soft: devuelve cuántas filas escribió.
 */
async function recordPageFollowers(
  admin: SupabaseClient,
  userId: string,
  pageHandle: string,
  followers: Array<{ handle?: string; name?: string }>,
  index: ReturnType<typeof buildPersonIndex>,
  nowIso: string,
): Promise<number> {
  const rows: Array<Record<string, unknown>> = []
  const seen = new Set<string>()
  for (const f of followers.slice(0, 60)) {
    const handle = f.handle ? canonHandle(f.handle) : null
    const name = typeof f.name === 'string' ? f.name.trim().slice(0, 120) : null
    if (!handle && !name) continue
    const key = handle || (name as string).toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const pm = matchPerson(index, { platform: 'instagram', handle: handle ?? undefined, name: name ?? undefined })
    rows.push({
      id: `spf_${createHash('sha1').update(`${userId}|${pageHandle}|${key}`).digest('hex').slice(0, 32)}`,
      user_id: userId, page_handle: pageHandle,
      follower_handle: handle, follower_name: name,
      person_id: pm?.person.id ?? null,
      source: 'instagram', observed_at: nowIso,
    })
  }
  if (rows.length === 0) return 0
  try {
    const { error } = await admin.from('social_page_followers').upsert(rows, { onConflict: 'id' })
    return error ? 0 : rows.length
  } catch {
    return 0 // tabla 0167 sin propagar
  }
}

// Dedup: no insertamos la MISMA señal (persona+kind) más de una vez cada 6h.
const DEDUP_HOURS = 6
// Tope de snapshots de avatar por request: bajar+subir imágenes es I/O; los que
// no entren se snapshotean en el próximo ingest (el reader corre seguido).
const AVATAR_SNAPSHOT_CAP = 40

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
  if (items.length === 0) return NextResponse.json({ inserted: 0, matched: 0, unmatched: 0, skipped: 0, backfilled: 0, promoted: 0, snapped: 0 })

  const nowIso = new Date().toISOString()
  const sinceIso = new Date(Date.now() - DEDUP_HOURS * 3_600_000).toISOString()
  let inserted = 0, matched = 0, unmatched = 0, skipped = 0, backfilled = 0, promoted = 0
  let snapped = 0
  let followerRows = 0

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

    // PÁGINAS YA CONOCIDAS: cuentas de IG que Aaron asignó a una organización
    // (empresa o unidad: CGBVP, RIT…). No son contactos → no vuelven a la
    // bandeja "¿quién es quién?". Fail-soft si 0167 no propagó.
    const orgByHandle = new Map<string, string>()
    try {
      const { data: orgRows } = await admin
        .from('org_profiles').select('org_slug, instagram_handle')
        .eq('user_id', userId).not('instagram_handle', 'is', null).limit(500)
      for (const o of (orgRows ?? []) as Array<{ org_slug: string; instagram_handle: string }>) {
        const c = canonHandle(o.instagram_handle)
        if (c) orgByHandle.set(c, o.org_slug)
      }
    } catch { /* columna 0167 sin propagar */ }

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

      // Seguidores en común de una PÁGINA ("Seguido por X, Y y N más que
      // sigues"): el dato que hace visible el interés compartido. Se registra
      // aunque la cuenta no sea de una org todavía. Fail-soft.
      const canonSelf = it.handle ? canonHandle(it.handle) : null
      if (canonSelf && Array.isArray(it.followedBy) && it.followedBy.length > 0) {
        followerRows += await recordPageFollowers(admin, userId, canonSelf, it.followedBy, index, nowIso)
      }

      // Página ya asignada a una organización → no es un contacto, no va a la
      // bandeja. La señal de su historia no aporta timing relacional.
      if (platform === 'instagram' && canonSelf && orgByHandle.has(canonSelf)) { skipped++; continue }

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
            const uid = unmatchedId(userId, key, sig.kind)
            await admin.from('unmatched_social_activity').upsert({
              id: uid, user_id: userId, platform,
              handle: it.handle ? canonHandle(it.handle) : null, name: it.name ?? null,
              avatar_url: it.avatarUrl ?? null,
              kind: sig.kind, detail: sig.detail, observed_at: resolveObservedAt(it.activityAt, nowIso),
            }, { onConflict: 'id' })
            // Snapshot permanente de la cara (la URL de IG caduca). Solo si aún no
            // lo tiene y no pasamos el tope del request. Fail-soft.
            if (it.avatarUrl && snapped < AVATAR_SNAPSHOT_CAP) {
              const { data: cur } = await admin
                .from('unmatched_social_activity').select('avatar_path').eq('id', uid).maybeSingle()
              if (!(cur as { avatar_path?: string | null } | null)?.avatar_path) {
                const path = await snapshotUnmatchedAvatar(admin, userId, uid, it.avatarUrl)
                if (path) { await admin.from('unmatched_social_activity').update({ avatar_path: path }).eq('id', uid); snapped++ }
              }
            }
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

  return NextResponse.json({ inserted, matched, unmatched, skipped, backfilled, promoted, snapped, followerRows })
}
