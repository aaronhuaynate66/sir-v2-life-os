// SIR V2 — GET /api/objectives/meaning?q=<texto>. Trae los HITOS positivos del
// usuario que matchean el tema del objetivo (memorias con carga emocional >= 0),
// para reconectar el objetivo con su SIGNIFICADO (no con el costo). RLS.
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { extractKeywords } from '@/lib/goals/conflictFriction'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const q = req.nextUrl.searchParams.get('q') ?? ''
  const kw = extractKeywords(q).slice(0, 6)
  if (kw.length === 0) return NextResponse.json({ milestones: [] })
  try {
    const orPat = kw.map((k) => `content.ilike.%${k}%`).join(',')
    const { data } = await supabase.from('memories')
      .select('content, importance, emotional_charge')
      .eq('user_id', auth.user.id).gte('emotional_charge', 0).or(orPat)
      .order('importance', { ascending: false }).limit(20)
    const rows = (data ?? []) as Array<{ content: string; importance: number }>
    // dedup por contenido normalizado, top 5.
    const seen = new Set<string>(); const out: string[] = []
    for (const r of rows) {
      const c = (r.content || '').trim(); if (!c) continue
      const key = c.toLowerCase().slice(0, 60)
      if (seen.has(key)) continue; seen.add(key)
      out.push(c.slice(0, 200))
      if (out.length >= 5) break
    }
    return NextResponse.json({ milestones: out })
  } catch { return NextResponse.json({ milestones: [] }) }
}
