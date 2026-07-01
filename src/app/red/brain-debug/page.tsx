// SIR V2 — /red/brain-debug (Server Component)
//
// Panel debug del CEREBRO F1 (sustrato del grafo tipado). Lista los nodos y
// aristas proyectados por `src/lib/brain` con sus pesos base + delta aprendido.
// No es una vista de usuario — es una lupa para verificar que la proyeccion
// esta cruzando bien las tablas. Se accede tipeando la URL a mano.
//
// F2 (difusion), F3 (Hebbian) y F4 (surfacing) van a construir encima; hoy
// esta pagina solo confirma que el sustrato existe y refleja el schema real.

import { redirect } from 'next/navigation'
import { Brain } from 'lucide-react'

import { AppShell } from '@/components/layout/AppShell'
import { createClient } from '@/lib/supabase/server'
import { loadBrainGraph } from '@/lib/brain/loader'
import { diffuse, topActivated } from '@/lib/brain/diffuse'
import { nodeKey } from '@/lib/brain/types'
import type { EdgeKind, NodeType } from '@/lib/brain/types'

export const dynamic = 'force-dynamic'

const KIND_LABEL: Record<EdgeKind, string> = {
  family: 'familia',
  moment_participant: 'episodio · participante',
  moment_reference: 'episodio · mencionado',
  goal_step: 'objetivo · tarea',
  goal_related_goal: 'objetivo ligado',
  goal_related_person: 'persona del objetivo',
  deal_contact: 'deal · contacto',
  deal_client_org: 'deal · empresa cliente',
  deal_related: 'deal · relacionado',
  memory_person: 'memoria',
  observation_person: 'captura',
  tracker_goal: 'tracker · objetivo',
  tracker_step: 'tracker · tarea',
  money_person: 'plata',
  goal_cost: 'costo',
}

const TYPE_LABEL: Record<NodeType, string> = {
  person: 'persona',
  goal: 'objetivo',
  org: 'empresa',
  moment: 'episodio',
  deal: 'deal',
  step: 'tarea',
  tracker: 'tracker',
}

interface BrainDebugSearchParams {
  seed?: string
}

export default async function BrainDebugPage({
  searchParams,
}: {
  searchParams: Promise<BrainDebugSearchParams>
}) {
  const supabase = await createClient()
  const { data: authData } = await supabase.auth.getUser()
  const user = authData?.user
  if (!user) redirect('/auth/login')

  const { seed } = await searchParams

  const graph = await loadBrainGraph(supabase, user.id)

  // Conteos por tipo/kind para el resumen de arriba.
  const nodesByType: Record<string, number> = {}
  for (const n of graph.nodes) {
    nodesByType[n.type] = (nodesByType[n.type] ?? 0) + 1
  }
  const edgesByKind: Record<string, number> = {}
  for (const e of graph.edges) {
    edgesByKind[e.kind] = (edgesByKind[e.kind] ?? 0) + 1
  }

  // Etiqueta de nodo (para mostrar name en vez del id opaco).
  const labelByKey = new Map<string, string>()
  for (const n of graph.nodes) labelByKey.set(`${n.type}:${n.id}`, n.label)
  const nodeText = (type: NodeType, id: string): string =>
    labelByKey.get(`${type}:${id}`) ?? id
  const nodeTextByKey = (key: string): string => labelByKey.get(key) ?? key

  // Difusion F2 (opcional, si vino ?seed=<nodeKey>).
  const seedKey = seed?.trim() ?? ''
  const seedValid =
    seedKey.length > 0 && graph.nodes.some((n) => nodeKey(n.type, n.id) === seedKey)
  const diffusionTop = seedValid
    ? topActivated(diffuse(graph, seedKey), seedKey, 30)
    : []

  // Semillas sugeridas: hasta 5 goals + 5 personas para tener enlaces
  // clickables sin ID a mano.
  const suggestedSeeds = [
    ...graph.nodes.filter((n) => n.type === 'goal').slice(0, 5),
    ...graph.nodes.filter((n) => n.type === 'person').slice(0, 5),
  ]

  // Ordena aristas por peso descendente (las mas fuertes primero).
  const edgesSorted = [...graph.edges].sort((a, b) => b.weight - a.weight)

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        <header className="space-y-1">
          <div className="flex items-center gap-2 text-fg-muted">
            <Brain className="h-4 w-4" />
            <span className="text-xs uppercase tracking-wider">
              cerebro · F1+F2 · debug
            </span>
          </div>
          <h1 className="text-2xl font-semibold">Grafo tipado — sustrato + difusion</h1>
          <p className="text-sm text-fg-muted">
            Proyeccion pura de las tablas actuales a aristas tipadas con peso
            (F1). Con ?seed=&lt;tipo:id&gt; en la URL, corre difusion (F2) y
            muestra los nodos mas activados desde ese semilla. Hoy no cambia UI
            de usuario.
          </p>
        </header>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-fg-muted">Resumen</h2>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            <div className="rounded border border-border-subtle bg-bg-elev p-3">
              <div className="text-xs text-fg-muted">Nodos totales</div>
              <div className="text-lg font-semibold">{graph.nodes.length}</div>
            </div>
            <div className="rounded border border-border-subtle bg-bg-elev p-3">
              <div className="text-xs text-fg-muted">Aristas totales</div>
              <div className="text-lg font-semibold">{graph.edges.length}</div>
            </div>
            <div className="rounded border border-border-subtle bg-bg-elev p-3">
              <div className="text-xs text-fg-muted">Tipos de nodo</div>
              <div className="text-lg font-semibold">
                {Object.keys(nodesByType).length}
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-fg-muted">Nodos por tipo</h2>
          <ul className="grid grid-cols-2 gap-1 text-sm sm:grid-cols-3">
            {Object.entries(nodesByType)
              .sort((a, b) => b[1] - a[1])
              .map(([t, n]) => (
                <li
                  key={t}
                  className="flex items-baseline justify-between rounded border border-border-subtle bg-bg-elev px-3 py-1.5"
                >
                  <span>{TYPE_LABEL[t as NodeType] ?? t}</span>
                  <span className="font-mono text-fg-muted">{n}</span>
                </li>
              ))}
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-fg-muted">Aristas por tipo</h2>
          <ul className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
            {Object.entries(edgesByKind)
              .sort((a, b) => b[1] - a[1])
              .map(([k, n]) => (
                <li
                  key={k}
                  className="flex items-baseline justify-between rounded border border-border-subtle bg-bg-elev px-3 py-1.5"
                >
                  <span>{KIND_LABEL[k as EdgeKind] ?? k}</span>
                  <span className="font-mono text-fg-muted">{n}</span>
                </li>
              ))}
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-fg-muted">
            Difusion desde una semilla (F2)
          </h2>
          <p className="text-xs text-fg-muted">
            Agrega <code>?seed=tipo:id</code> a la URL para encender ese nodo y
            ver que se prende. Ej: <code>?seed=goal:{'{goalId}'}</code>. Semillas
            sugeridas:
          </p>
          <ul className="flex flex-wrap gap-1 text-xs">
            {suggestedSeeds.map((n) => {
              const k = nodeKey(n.type, n.id)
              const active = k === seedKey
              return (
                <li key={k}>
                  <a
                    href={`/red/brain-debug?seed=${encodeURIComponent(k)}`}
                    className={
                      active
                        ? 'rounded border border-brand bg-brand/10 px-2 py-1 text-brand'
                        : 'rounded border border-border-subtle bg-bg-elev px-2 py-1 text-fg-muted hover:text-fg'
                    }
                  >
                    {TYPE_LABEL[n.type]}: {n.label}
                  </a>
                </li>
              )
            })}
          </ul>
          {seedKey.length > 0 && !seedValid && (
            <p className="text-xs text-warn">
              Semilla <code>{seedKey}</code> no encontrada en el grafo.
            </p>
          )}
          {seedValid && diffusionTop.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full border border-border-subtle text-sm">
                <thead className="bg-bg-elev">
                  <tr>
                    <th className="px-2 py-1 text-left font-medium">Nodo</th>
                    <th className="px-2 py-1 text-right font-medium">
                      Activacion
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {diffusionTop.map((row) => (
                    <tr
                      key={row.nodeKey}
                      className="border-t border-border-subtle"
                    >
                      <td className="px-2 py-1">
                        {nodeTextByKey(row.nodeKey)}{' '}
                        <span className="text-xs text-fg-muted">
                          ({row.nodeKey})
                        </span>
                      </td>
                      <td className="px-2 py-1 text-right font-mono">
                        {row.activation.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {seedValid && diffusionTop.length === 0 && (
            <p className="text-xs text-fg-muted">
              La semilla no tiene vecinos (nodo aislado en el grafo).
            </p>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-fg-muted">
            Top 100 aristas por peso
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full border border-border-subtle text-sm">
              <thead className="bg-bg-elev">
                <tr>
                  <th className="px-2 py-1 text-left font-medium">Origen</th>
                  <th className="px-2 py-1 text-left font-medium">Destino</th>
                  <th className="px-2 py-1 text-left font-medium">Tipo</th>
                  <th className="px-2 py-1 text-right font-medium">Base</th>
                  <th className="px-2 py-1 text-right font-medium">Aprendido</th>
                  <th className="px-2 py-1 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {edgesSorted.slice(0, 100).map((e) => (
                  <tr key={e.key} className="border-t border-border-subtle">
                    <td className="px-2 py-1">
                      <span className="text-fg-muted">
                        {TYPE_LABEL[e.srcType]}:
                      </span>{' '}
                      {nodeText(e.srcType, e.srcId)}
                    </td>
                    <td className="px-2 py-1">
                      <span className="text-fg-muted">
                        {TYPE_LABEL[e.dstType]}:
                      </span>{' '}
                      {nodeText(e.dstType, e.dstId)}
                    </td>
                    <td className="px-2 py-1">{KIND_LABEL[e.kind]}</td>
                    <td className="px-2 py-1 text-right font-mono">
                      {e.derivedWeight}
                    </td>
                    <td className="px-2 py-1 text-right font-mono">
                      {e.learnedWeight === 0 ? '—' : e.learnedWeight}
                    </td>
                    <td className="px-2 py-1 text-right font-mono">
                      {e.weight}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {edgesSorted.length > 100 && (
            <p className="text-xs text-fg-muted">
              (Mostrando 100 de {edgesSorted.length} aristas)
            </p>
          )}
        </section>
      </div>
    </AppShell>
  )
}
