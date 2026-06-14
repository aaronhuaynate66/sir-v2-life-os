// SIR V2 — /empresas/[slug] (Server Component) · escalón 3
//
// Ficha de empresa/holding como HUB de contexto (no pseudo-persona): su gente,
// las empresas que agrupa (o el holding al que pertenece) y los objetivos
// activos ligados. Doble nivel: 'grupo' (Grupo HNG) y 'empresa' (K2).

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { buildCompanyHub, type HubPerson, type HubGoal } from '@/lib/people/companyHub'
import { CompanyStrategicRead } from '@/components/empresas/CompanyStrategicRead'

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
    .select('id, name, slug, organization, org_group, importance_score, last_contact')
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

  const hub = buildCompanyHub(slug, people, goals)
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
