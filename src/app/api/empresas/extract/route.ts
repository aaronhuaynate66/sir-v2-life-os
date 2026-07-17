// SIR V2 — POST /api/empresas/extract (Empresa Fase B)
//
// Autocompletar la ficha de una empresa. Dos modos (combinables):
//   - { url }  → fetch best-effort del HTML público → metaFromHtml (meta desc /
//                og:* / title) como prefill. Sin render: sirve poco en sitios
//                JS-rendered, por eso es solo prefill.
//   - { text } → el usuario pega texto (web/LinkedIn) → Anthropic estructura
//                description/sectors/notes SIN inventar (camino robusto).
// NO persiste: devuelve campos para que EditOrgProfile los muestre a revisión y
// el usuario guarde con el POST /api/empresas/profile existente.

import { NextResponse, type NextRequest } from 'next/server'
import { complete, LlmError } from '@/lib/llm'
import { reportApiError } from '@/lib/observability/reportApiError'

import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import {
  EXTRACT_SYSTEM_PROMPT,
  buildExtractInput,
  parseExtraction,
  foldNotes,
  metaFromHtml,
} from '@/lib/empresas/extract'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30
const MAX_HTML_BYTES = 600_000

function errorJson(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}

/** ¿La URL es http(s) y pública (no localhost / IP interna)? Defensa básica SSRF. */
function isPublicHttpUrl(raw: string): URL | null {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  const h = u.hostname.toLowerCase()
  if (
    h === 'localhost' ||
    h === '0.0.0.0' ||
    h.endsWith('.local') ||
    /^127\./.test(h) ||
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^169\.254\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h)
  ) {
    return null
  }
  return u
}

async function fetchHtml(u: URL): Promise<string | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(u.toString(), {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'SIR-V2/1.0 (+empresa-extract)' },
    })
    if (!res.ok) return null
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.includes('text/html') && !ct.includes('text/plain') && ct !== '') return null
    const buf = await res.arrayBuffer()
    return new TextDecoder('utf-8').decode(buf.slice(0, MAX_HTML_BYTES))
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) return errorJson(401, 'No autenticado', 'Inicia sesión y reinténtalo.')

  const rl = await enforceRateLimit(supabase, authData.user.id, 'generation')
  if (!rl.ok) return rl.response

  let body: { text?: unknown; url?: unknown; label?: unknown }
  try {
    body = (await req.json()) as { text?: unknown; url?: unknown; label?: unknown }
  } catch {
    return errorJson(400, 'Body JSON inválido')
  }
  const text = typeof body.text === 'string' && body.text.trim().length > 0 ? body.text.trim() : null
  const url = typeof body.url === 'string' && body.url.trim().length > 0 ? body.url.trim() : null
  const label = typeof body.label === 'string' ? body.label.trim().slice(0, 160) : null
  if (!text && !url) return errorJson(400, 'Mandá texto o una URL')

  let website = ''
  let description = ''
  let notes = ''

  // 1) URL → meta prefill (best-effort, no fatal).
  if (url) {
    const u = isPublicHttpUrl(url)
    if (!u) return errorJson(400, 'URL inválida', 'Usá una URL pública http(s).')
    website = u.toString()
    const html = await fetchHtml(u)
    if (html) {
      const meta = metaFromHtml(html, website)
      if (meta.description) description = meta.description
    }
  }

  // 2) Texto pegado → extracción IA (camino robusto). Pisa la descripción de meta.
  if (text) {
    try {
      const res = await complete({
        task: 'extract',
        sensitivity: 'none',
        system: EXTRACT_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildExtractInput({ text, label }) }],
        maxTokens: 700,
      }, { supabase, userId: authData.user.id })
      const parsed = parseExtraction(res.text)
      if (parsed) {
        if (parsed.description) description = parsed.description
        notes = foldNotes(parsed.notes, parsed.sectors)
      }
    } catch (e) {
      reportApiError(e)
      if (e instanceof LlmError && e.code === 'no_provider') {
        return errorJson(503, 'IA no disponible', 'No hay proveedor LLM configurado.')
      }
      const m = e instanceof Error ? e.message : String(e)
      return errorJson(502, 'Falló la extracción con IA', m.slice(0, 300))
    }
  }

  if (!website && !description && !notes) {
    return errorJson(422, 'No se pudo extraer info', 'La URL no expuso metadatos y no pegaste texto útil.')
  }

  return NextResponse.json({ website, description, notes }, { status: 200 })
}
