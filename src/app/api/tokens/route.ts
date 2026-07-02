// SIR V2 — GET/POST/DELETE /api/tokens (Personal Access Tokens)
//
// Session-auth (Aaron logueado). El API está diseñado para que Aaron
// gestione tokens desde /yo, sin ir a Vercel. Los tokens son la llave
// para que clientes externos (Claude, scripts, curl) llamen la API
// como si fueran él — ver `src/lib/auth/tokens.ts`.
//
// GET     → lista { tokens: [{id, label, prefix, createdAt, lastUsedAt}, ...] }
// POST    → { label } → 201 { token: {id, plain, prefix, ...} } (plain SOLO acá)
// DELETE  → ?id=…      → revoca (soft: seteando revoked_at)

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateTokenParts } from '@/lib/auth/tokens'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SELECT_COLS = 'id, label, token_prefix, created_at, last_used_at, revoked_at'

function errorJson(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}

interface TokenRowFromDb {
  id: string
  label: string
  token_prefix: string
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

function toDto(row: TokenRowFromDb) {
  return {
    id: row.id,
    label: row.label,
    prefix: row.token_prefix,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  }
}

export async function GET() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return errorJson(401, 'No autenticado')
  try {
    const { data, error } = await supabase
      .from('personal_tokens')
      .select(SELECT_COLS)
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ tokens: [] })
    const rows = (data ?? []) as TokenRowFromDb[]
    return NextResponse.json({ tokens: rows.map(toDto) })
  } catch { return NextResponse.json({ tokens: [] }) }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return errorJson(401, 'No autenticado')
  let body: { label?: unknown }
  try { body = (await req.json()) as { label?: unknown } } catch { body = {} }
  const label = typeof body.label === 'string' && body.label.trim()
    ? body.label.trim().slice(0, 60)
    : 'Token'
  const { plain, prefix, hash } = generateTokenParts()
  try {
    const { data, error } = await supabase
      .from('personal_tokens')
      .insert({
        user_id: auth.user.id,
        label,
        token_prefix: prefix,
        token_hash: hash,
      })
      .select(SELECT_COLS)
      .single()
    if (error || !data) return errorJson(500, 'No pude guardar el token', error?.message)
    return NextResponse.json({
      token: { ...toDto(data as TokenRowFromDb), plain },
    }, { status: 201 })
  } catch (e) {
    return errorJson(500, 'No pude guardar el token', e instanceof Error ? e.message : String(e))
  }
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return errorJson(401, 'No autenticado')
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return errorJson(400, 'id requerido')
  try {
    const { error } = await supabase
      .from('personal_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', auth.user.id)
      .eq('id', id)
    if (error) return errorJson(500, 'No pude revocar', error.message)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorJson(500, 'No pude revocar', e instanceof Error ? e.message : String(e))
  }
}
