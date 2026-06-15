// SIR V2 — /empresas (Server Component) · índice de organizaciones
//
// Sección propia (como /relaciones para personas): lista las empresas/grupos de
// la red, computadas desde la gente del usuario (1 por orgJoinKey, mismo
// criterio que los nodos `org:<key>` del grafo). Cada una linkea a su ficha
// /empresas/[slug]. Las orgs NO viven encima del grafo: acá tienen su lugar.

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Building2 } from 'lucide-react'

import { AppShell } from '@/components/layout/AppShell'
import { createClient } from '@/lib/supabase/server'
import { listOrganizations, type HubPerson } from '@/lib/people/companyHub'
import { NuevaOrganizacion } from '@/components/empresas/NuevaOrganizacion'

export const dynamic = 'force-dynamic'

export default async function EmpresasPage() {
  const supabase = await createClient()
  const { data: authData } = await supabase.auth.getUser()
  const userId = authData?.user?.id
  if (!userId) redirect('/auth/login')

  const { data: peopleRows } = await supabase
    .from('people')
    .select('id, name, slug, organization, org_group')
    .eq('user_id', userId)
    .limit(2000)

  const people: HubPerson[] = (peopleRows ?? []).map((r) => {
    const row = r as Record<string, unknown>
    return {
      id: row.id as string,
      name: (row.name as string) ?? 'alguien',
      slug: (row.slug as string | null) ?? null,
      organization: (row.organization as string | null) ?? null,
      orgGroup: (row.org_group as string | null) ?? null,
    }
  })

  const orgs = listOrganizations(people)

  // Además de las orgs derivadas de personas, incluí las creadas a mano
  // (org_profiles) — así una org sin miembros aún (ej. una unidad transversal)
  // también aparece. Dedup por slug.
  const { data: profileRows } = await supabase
    .from('org_profiles')
    .select('org_slug, name')
    .eq('user_id', userId)
    .limit(300)
  const deslug = (sg: string) => sg.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  const seen = new Set(orgs.map((o) => o.slug))
  const profileOrgs = (profileRows ?? [])
    .map((r) => r as { org_slug: string | null; name: string | null })
    .filter((r) => r.org_slug && !seen.has(r.org_slug))
    .map((r) => ({ label: r.name || deslug(r.org_slug as string), slug: r.org_slug as string, count: 0 }))
  const allOrgs = [...orgs, ...profileOrgs]

  return (
    <AppShell>
      <header className="mb-6 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Building2 className="text-muted-foreground" size={22} strokeWidth={1.75} />
          <div>
            <h1 className="text-xl font-semibold">Empresas</h1>
            <p className="text-sm text-muted-foreground">
              Organizaciones y grupos de tu red. {allOrgs.length} {allOrgs.length === 1 ? 'organización' : 'organizaciones'}.
            </p>
          </div>
        </div>
        <NuevaOrganizacion />
      </header>

      {allOrgs.length === 0 ? (
        <div className="rounded-lg border border-border p-6 text-sm text-muted-foreground">
          Todavía no hay organizaciones. Cuando una persona tenga empresa o grupo cargado, aparece acá.
        </div>
      ) : (
        <ul className="space-y-2">
          {allOrgs.map((o) => (
            <li key={o.slug}>
              <Link
                href={`/empresas/${o.slug}`}
                className="flex items-center justify-between rounded-lg border border-border px-4 py-3 hover:bg-accent/10 transition-colors"
              >
                <span className="font-medium">{o.label}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {o.count === 0 ? 'perfil' : `${o.count} ${o.count === 1 ? 'persona' : 'personas'}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  )
}
