// SIR V2 — POST /api/social/ingest  (Parte A: reader social pasivo)
//
// Recibe capturas PASIVAS de la extensión (lo que Aaron ya ve al navegar IG/
// LinkedIn de su sesión — nada de requests automáticos). Resuelve el handle →
// persona (people.instagram_handle / linkedin_url), deriva una señal de timing
// (deriveSocialSignal) y la inserta en contact_activity → alimenta el veredicto
// "buen/mal momento" (Parte B). No guarda contenido crudo: solo la señal + un
// detalle corto.
//
// Auth: TOKEN (no sesión), MISMO esquema que /api/reader/ingest:
//   x-reader-token | Authorization: Bearer  ==  READER_INGEST_TOKEN
// Cliente service-role; user_id vía READER_INGEST_USER_ID || único profile.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { reportApiError } from '@/lib/observability/reportApiError'
import { deriveSocialSignal } from '@/lib/social-reader/derive'

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
  text?: string
  hasActiveStory?: boolean
  headline?: string
}

/** Handle IG canónico: sin @, minúsculas, sin espacios. */
function canonHandle(h: string): string {
  return h.trim().replace(/^@/, '').toLowerCase()
}
/** Slug de una URL/handle de LinkedIn (linkedin.com/in/<slug>). */
function linkedinSlug(v: string): string | null {
  const m = v.match(/\/in\/([^/?#\s]+)/i) || v.match(/^([A-Za-z0-9\-_%]+)$/)
  return m ? m[1].replace(/\/+$/, '').toLowerCase() : null
}

// Dedup: no insertamos la MISMA señal (persona+kind) más de una vez cada 6h,
// para que ver la misma story varias veces no la multiplique.
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
  if (items.length === 0) return NextResponse.json({ inserted: 0, matched: 0, unmatched: 0, skipped: 0 })

  const nowIso = new Date().toISOString()
  const sinceIso = new Date(Date.now() - DEDUP_HOURS * 3_600_000).toISOString()
  let inserted = 0, matched = 0, unmatched = 0, skipped = 0

  try {
    for (const it of items) {
      const platform = typeof it.platform === 'string' ? it.platform : ''
      if (platform !== 'instagram' && platform !== 'linkedin') { skipped++; continue }

      // Resolver persona por handle/URL.
      let person: { id: string; title: string | null } | null = null
      if (platform === 'instagram' && it.handle) {
        const h = canonHandle(it.handle)
        const { data } = await admin.from('people').select('id, title').eq('user_id', userId).ilike('instagram_handle', h).limit(1)
        person = (data?.[0] as { id: string; title: string | null }) ?? null
      } else if (platform === 'linkedin') {
        const slug = it.linkedinUrl ? linkedinSlug(it.linkedinUrl) : (it.handle ? linkedinSlug(it.handle) : null)
        if (slug) {
          const { data } = await admin.from('people').select('id, title').eq('user_id', userId).ilike('linkedin_url', `%/in/${slug}%`).limit(1)
          person = (data?.[0] as { id: string; title: string | null }) ?? null
        }
      }
      if (!person) { unmatched++; continue }
      matched++

      const signal = deriveSocialSignal({
        platform,
        text: it.text ?? null,
        hasActiveStory: it.hasActiveStory === true,
        headline: it.headline ?? null,
        priorHeadline: platform === 'linkedin' ? (person.title ?? null) : null,
      })
      if (!signal) { skipped++; continue }

      // Dedup: ¿ya hay una señal igual (persona+kind) reciente?
      const { data: recent } = await admin
        .from('contact_activity')
        .select('id')
        .eq('user_id', userId).eq('person_id', person.id).eq('kind', signal.kind)
        .gte('observed_at', sinceIso)
        .limit(1)
      if (recent && recent.length > 0) { skipped++; continue }

      const { error: insErr } = await admin.from('contact_activity').insert({
        user_id: userId, person_id: person.id, kind: signal.kind, detail: signal.detail,
        source: platform, observed_at: nowIso,
      })
      if (insErr) { skipped++; continue }
      inserted++
    }
  } catch (e) {
    reportApiError(e, { route: 'social/ingest' })
    return errorJson(500, 'Fallo procesando la ingesta', e instanceof Error ? e.message : String(e))
  }

  return NextResponse.json({ inserted, matched, unmatched, skipped })
}
