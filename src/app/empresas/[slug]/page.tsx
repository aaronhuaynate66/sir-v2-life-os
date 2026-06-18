// SIR V2 — /empresas/[slug] (Server Component) · escalón 3
//
// Ficha de empresa/holding como HUB de contexto (no pseudo-persona): su gente,
// las empresas que agrupa (o el holding al que pertenece) y los objetivos
// activos ligados. Doble nivel: 'grupo' (Grupo HNG) y 'empresa' (K2).

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { buildCompanyHub, type HubPerson, type HubGoal } from '@/lib/people/companyHub'
import { transversalUnitSlugs } from '@/lib/people/professionalNetwork'
import { CompanyStrategicRead } from '@/components/empresas/CompanyStrategicRead'
import { EditOrgProfile } from '@/components/empresas/EditOrgProfile'

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function EmpresaPage({ params }: PageProps) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: authData } = await supabase.auth.getUser()
  const userId = authData?.user?.id
  if (!userId) redirect('/auth/login')

  const { data: peopleRows } = await supabase
    .from('people')
    .select('id, name, slug, organization, org_group, importance_score, last_contact, tags')
    .eq('user_id', userId)
    .limit(1000)
  const people: HubPerson[] = (peopleRows ?? []).map((r) => {
    const row = r as Record<string, unknown>
    return {
      id: row.id as string,
      name: (row.name as string) ?? 'alguien',
      slug: (row.slug as string | null) ?? null,
      organization: (row.organization as string | null) ?? null,
      orgGroup: (row.org_group as string | null) ?? null,
      importance:
        row.importance_score !== null && row.importance_score !== undefined
          ? Number(row.importance_score)
          : undefined,
      lastContact: (row.last_contact as string | null) ?? null,
    }
  })

  const { data: goalRows } = await supabase
    .from('goals')
    .select('title, related_persons, status')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(200)
  const goals: HubGoal[] = (goalRows ?? []).map((g) => {
    const row = g as Record<string, unknown>
    return {
      title: (row.title as string) ?? '',
      personIds: Array.isArray(row.related_persons) ? (row.related_persons as string[]) : [],
    }
  })

  const { data: profileRow } = await supabase
    .from('org_profiles')
    .select('name, website, description, notes, ruc, address, parent_org, tier')
    .eq('user_id', userId)
    .eq('org_slug', slug)
    .maybeSingle()
  const profile = (profileRow as { name: string | null; website: string | null; description: string | null; notes: string | null; ruc: string | null; address: string | null; parent_org: string | null; tier: string | null } | null) ?? null

  let hub = buildCompanyHub(slug, people, goals)
  // Org creada a mano (org_profile) sin miembros todavía (ej. unidad transversal
  // como el RIT): no derivamos del set de personas → la renderizamos desde el
  // perfil en vez de 404.
  if (!hub.found && profile) {
    const deslug = slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    hub = { found: true, level: 'empresa', label: profile.name || deslug, subCompanies: [], people: [], goals: [] }
  }
  // Miembros de una UNIDAD TRANSVERSAL (ej. RIT): no se derivan por org/grupo
  // sino por el tag `unidad:<slug>`. Los sumamos a "Tu gente acá" para que la
  // ficha sea consistente con el nodo `org:<slug>` del grafo (que sí los liga).
  {
    const unitMembers: HubPerson[] = (peopleRows ?? [])
      .filter((r) => transversalUnitSlugs((r as Record<string, unknown>).tags as string[] | null).includes(slug.trim().toLowerCase()))
      .map((r) => {
        const row = r as Record<string, unknown>
        return {
          id: row.id as string,
          name: (row.name as string) ?? 'alguien',
          slug: (row.slug as string | null) ?? null,
          organization: (row.organization as string | null) ?? null,
          orgGroup: (row.org_group as string | null) ?? null,
          importance:
            row.importance_score !== null && row.importance_score !== undefined
              ? Number(row.importance_score)
              : undefined,
          lastContact: (row.last_contact as string | null) ?? null,
        }
      })
    if (unitMembers.length > 0) {
      const seen = new Set(hub.people.map((p) => p.id))
      hub = { ...hub, people: [...hub.people, ...unitMembers.filter((m) => !seen.has(m.id))] }
    }
  }

  if (!hub.found) notFound()

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 space-y-8">
      <Link href="/red" className="text-sm text-muted-foreground hover:text-foreground">
        ← Volver a la Red
      </Link>

      <header className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {hub.level === 'grupo' ? 'Holding / grupo' : 'Empresa'}
        </p>
        <h1 className="text-3xl font-bold text-foreground">{hub.label}</h1>
        {hub.parentGroup && (
          <p className="text-sm text-muted-foreground">
            Parte de{' '}
            <Link href={`/empresas/${hub.parentGroup.slug}`} className="text-[#14b8a6] hover:underline">
              {hub.parentGroup.label}
            </Link>
          </p>
        )}
      </header>

      <section className="space-y-3">
        <h2 className="text-sm uppercase tracking-wide text-muted-foreground">Sobre la empresa</h2>
        {profile?.description && (
          <p className="text-[14px] leading-relaxed text-foreground/90 whitespace-pre-wrap">{profile.description}</p>
        )}
        {profile?.website && (
          <a href={profile.website} target="_blank" rel="noopener noreferrer" className="inline-block text-sm text-[#14b8a6] hover:underline">
            {profile.website}
          </a>
        )}
        {profile?.notes && (
          <p className="text-[13px] leading-relaxed text-muted-foreground whitespace-pre-wrap">{profile.notes}</p>
        )}
        {!profile?.description && !profile?.website && !profile?.notes && (
          <p className="text-sm text-muted-foreground">Sin info cargada todavía.</p>
        )}
        {(profile?.ruc || profile?.address || profile?.parent_org || profile?.tier) && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px] text-foreground/90">
            {profile?.ruc && <div><span className="text-muted-foreground">RUC:</span> {profile.ruc}</div>}
            {profile?.tier && <div><span className="text-muted-foreground">Tier:</span> {profile.tier}</div>}
            {profile?.parent_org && <div className="col-span-2"><span className="text-muted-foreground">Matriz:</span> {profile.parent_org}</div>}
            {profile?.address && <div className="col-span-2"><span className="text-muted-foreground">Dirección:</span> {profile.address}</div>}
          </div>
        )}
        <EditOrgProfile
          slug={slug}
          label={hub.label}
          initial={{ website: profile?.website ?? null, description: profile?.description ?? null, notes: profile?.notes ?? null, ruc: profile?.ruc ?? null, address: profile?.address ?? null, parentOrg: profile?.parent_org ?? null, tier: profile?.tier ?? null }}
        />
      </section>

      <CompanyStrategicRead slug={slug} />

      {hub.subCompanies.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm uppercase tracking-wide text-muted-foreground">Empresas del grupo</h2>
          <div className="flex flex-wrap gap-2">
            {hub.subCompanies.map((c) => (
              <Link
                key={c.slug}
                href={`/empresas/${c.slug}`}
                className="rounded-full border border-[#14b8a6]/40 px-3 py-1 text-sm text-foreground hover:border-[#14b8a6]"
              >
                {c.label}
                {typeof c.count === 'number' && (
                  <span className="ml-1 text-muted-foreground">· {c.count}</span>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm uppercase tracking-wide text-muted-foreground">
          Tu gente acá ({hub.people.length})
        </h2>
        <div className="space-y-2">
          {hub.people.map((p) => (
            <Link
              key={p.id}
              href={p.slug ? `/relaciones/${p.slug}` : '/relaciones'}
              className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 hover:border-foreground/30"
            >
              <span className="text-foreground">{p.name}</span>
              <span className="text-xs text-muted-foreground">
                {p.organization ? p.organization : ''}
                {typeof p.importance === 'number' ? ` · imp ${p.importance}/10` : ''}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm uppercase tracking-wide text-muted-foreground">
          Objetivos activos ligados ({hub.goals.length})
        </h2>
        {hub.goals.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sin objetivos activos con gente de {hub.label} todavía.
          </p>
        ) : (
          <ul className="space-y-2">
            {hub.goals.map((g, i) => (
              <li key={`${g.title}-${i}`} className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground">
                {g.title}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
