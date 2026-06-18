// SIR V2 — POST /api/empresas/profile — guarda (upsert) la info de una empresa/
// holding (escalón 3). Anclada al slug de la organización + user. Carga manual
// por ahora; el auto-extract (URL/pegar texto) llega después y usa lo mismo.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 15

function err(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}

function str(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim().slice(0, max) : null
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return err(401, 'No autenticado')
  const userId = auth.user.id

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return err(400, 'Body JSON inválido')
  }
  const slug = str(body.slug, 200)
  if (!slug) return err(400, 'slug requerido')

  const row: Record<string, unknown> = {
    user_id: userId,
    org_slug: slug,
    name: str(body.name, 160),
    website: str(body.website, 300),
    description: str(body.description, 2000),
    notes: str(body.notes, 4000),
    ruc: str(body.ruc, 20),
    address: str(body.address, 300),
    parent_org: str(body.parentOrg, 160),
    tier: str(body.tier, 20),
    source: str(body.source, 40) ?? 'manual',
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('org_profiles')
    .upsert([row], { onConflict: 'user_id,org_slug' })
  if (error) return err(500, 'No se pudo guardar', error.message)

  return NextResponse.json({ ok: true }, { status: 200 })
}
