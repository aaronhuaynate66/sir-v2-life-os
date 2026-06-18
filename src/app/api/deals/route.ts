// SIR V2 — /api/deals (Oportunidades, migración 0084)
//   GET  → lista de oportunidades del usuario (más nuevas primero).
//   POST → crea o actualiza (upsert por id). Auth + RLS. Patrón query directa.

import { NextResponse, type NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import type { Deal, DealStage, DealStatus, DealTier, DealImpactType } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 15

function err(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}
function str(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim().slice(0, max) : null
}
const STAGES = ['lead', 'reunion', 'relevamiento', 'propuesta', 'negociacion', 'ganado', 'perdido']
const STATUSES = ['open', 'won', 'lost', 'paused']
const TIERS = ['chico', 'mediano', 'grande']

function rowToDeal(r: Record<string, unknown>): Deal {
  return {
    id: r.id as string,
    title: (r.title as string) ?? '',
    clientOrg: (r.client_org as string) ?? undefined,
    clientOrgSlug: (r.client_org_slug as string) ?? undefined,
    contactPersonId: (r.contact_person_id as string) ?? undefined,
    seller: (r.seller as string) ?? undefined,
    stage: ((r.stage as string) ?? 'lead') as DealStage,
    status: ((r.status as string) ?? 'open') as DealStatus,
    source: (r.source as string) ?? undefined,
    amount: r.amount !== null && r.amount !== undefined ? Number(r.amount) : undefined,
    currency: (r.currency as string) ?? undefined,
    tier: (r.tier as DealTier) ?? undefined,
    scope: (r.scope as string) ?? undefined,
    closeWindow: (r.close_window as string) ?? undefined,
    nextAction: (r.next_action as string) ?? undefined,
    nextActionDate: (r.next_action_date as string) ?? undefined,
    relatedPersons: Array.isArray(r.related_persons) ? (r.related_persons as string[]) : [],
    impactTypes: Array.isArray(r.impact_types) ? (r.impact_types as DealImpactType[]) : [],
    whyMatters: (r.why_matters as string) ?? undefined,
    internalStakeholders: Array.isArray(r.internal_stakeholders) ? (r.internal_stakeholders as string[]) : [],
    notes: (r.notes as string) ?? undefined,
    createdAt: (r.created_at as string) ?? new Date().toISOString(),
    updatedAt: (r.updated_at as string) ?? new Date().toISOString(),
  }
}

export async function GET() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return err(401, 'No autenticado')
  const { data, error } = await supabase
    .from('deals')
    .select('*')
    .eq('user_id', auth.user.id)
    .order('updated_at', { ascending: false })
    .limit(500)
  if (error) return err(500, 'No se pudo leer oportunidades', error.message)
  return NextResponse.json({ deals: ((data ?? []) as Record<string, unknown>[]).map(rowToDeal) }, { status: 200 })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return err(401, 'No autenticado')
  const userId = auth.user.id

  let b: Record<string, unknown>
  try {
    b = (await req.json()) as Record<string, unknown>
  } catch {
    return err(400, 'Body JSON inválido')
  }
  const title = str(b.title, 200)
  if (!title) return err(400, 'title requerido')

  const stage = STAGES.includes(b.stage as string) ? (b.stage as string) : 'lead'
  const status = STATUSES.includes(b.status as string) ? (b.status as string) : 'open'
  const tier = TIERS.includes(b.tier as string) ? (b.tier as string) : null
  const amount = typeof b.amount === 'number' && Number.isFinite(b.amount) ? b.amount : null
  const persons = Array.isArray(b.relatedPersons)
    ? (b.relatedPersons as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 20)
    : []
  const IMPACTS = ['financiero', 'profesional', 'relacional', 'emocional']
  const impactTypes = Array.isArray(b.impactTypes)
    ? (b.impactTypes as unknown[]).filter((x): x is string => typeof x === 'string' && IMPACTS.includes(x)).slice(0, 4)
    : []
  const stakeholders = Array.isArray(b.internalStakeholders)
    ? (b.internalStakeholders as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 20)
    : []
  const now = new Date().toISOString()

  const row: Record<string, unknown> = {
    id: str(b.id, 80) ?? randomUUID(),
    user_id: userId,
    title,
    client_org: str(b.clientOrg, 200),
    client_org_slug: str(b.clientOrgSlug, 200),
    contact_person_id: str(b.contactPersonId, 80),
    seller: str(b.seller, 80),
    stage,
    status,
    source: str(b.source, 80),
    amount,
    currency: str(b.currency, 8) ?? 'PEN',
    tier,
    scope: str(b.scope, 400),
    close_window: str(b.closeWindow, 80),
    next_action: str(b.nextAction, 400),
    next_action_date: str(b.nextActionDate, 12),
    related_persons: persons,
    impact_types: impactTypes,
    why_matters: str(b.whyMatters, 1000),
    internal_stakeholders: stakeholders,
    notes: str(b.notes, 20000),
    updated_at: now,
  }

  const { data, error } = await supabase
    .from('deals')
    .upsert([row], { onConflict: 'id' })
    .select('*')
    .maybeSingle()
  if (error) return err(500, 'No se pudo guardar la oportunidad', error.message)
  return NextResponse.json({ deal: data ? rowToDeal(data as Record<string, unknown>) : null }, { status: 200 })
}
