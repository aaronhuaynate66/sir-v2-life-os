'use client'
// SIR V2 — Oportunidades / pipeline comercial estructurado (migración 0084).
// Lista las oportunidades por etapa + alta/edición. Patrón fetch a /api/deals.

import { useCallback, useEffect, useState } from 'react'
import { Handshake, Plus, Loader2, Building2, User } from 'lucide-react'
import Link from 'next/link'
import { AppShell } from '@/components/layout/AppShell'
import type { Deal, DealStage, DealStatus, DealTier, DealImpactType } from '@/types'
import { groupByStage, STAGE_LABEL, STAGE_ORDER, daysSinceUpdate } from '@/lib/deals/pipeline'
import { useRelationshipStore } from '@/stores'

const TIERS: DealTier[] = ['chico', 'mediano', 'grande']
const STATUSES: DealStatus[] = ['open', 'won', 'lost', 'paused']
const IMPACTS: DealImpactType[] = ['financiero', 'profesional', 'relacional', 'emocional']

type Draft = Partial<Deal>

function emptyDraft(): Draft {
  return { title: '', stage: 'lead', status: 'open', currency: 'PEN', relatedPersons: [], impactTypes: [], internalStakeholders: [] }
}

export default function OportunidadesPage() {
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const people = useRelationshipStore((st) => st.people)
  const nameById = new Map(people.map((p) => [p.id, p.name]))

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/deals')
      if (res.ok) {
        const data = (await res.json()) as { deals?: Deal[] }
        setDeals(Array.isArray(data.deals) ? data.deals : [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function save() {
    if (!draft || saving || !(draft.title ?? '').trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      if (res.ok) {
        setDraft(null)
        await load()
      }
    } finally {
      setSaving(false)
    }
  }

  const groups = groupByStage(deals)
  const open = deals.filter((d) => d.stage !== 'ganado' && d.stage !== 'perdido').length

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Handshake size={18} className="text-brand-soft-foreground" aria-hidden="true" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">Oportunidades</h1>
              <p className="text-xs text-muted-foreground">{open} abiertas · pipeline comercial</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDraft(emptyDraft())}
            className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-sm text-brand-foreground"
          >
            <Plus size={14} /> Nueva
          </button>
        </header>

        {draft && <DealForm draft={draft} setDraft={setDraft} onSave={save} onCancel={() => setDraft(null)} saving={saving} people={people} />}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>
        ) : deals.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin oportunidades todavía. Creá la primera con “Nueva”.</p>
        ) : (
          <div className="space-y-6">
            {groups.map(({ stage, deals: ds }) => (
              <section key={stage} className="space-y-2">
                <h2 className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">{STAGE_LABEL[stage]} · {ds.length}</h2>
                <div className="space-y-2">
                  {ds.map((d) => <DealCard key={d.id} deal={d} onEdit={() => setDraft(d)} nameById={nameById} />)}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}

function money(d: Deal): string | null {
  if (typeof d.amount !== 'number') return null
  return `${d.currency ?? 'PEN'} ${d.amount.toLocaleString('es-PE')}`
}

function DealCard({ deal, onEdit, nameById }: { deal: Deal; onEdit: () => void; nameById: Map<string, string> }) {
  const cold = (daysSinceUpdate(deal) ?? 0) > 7 && deal.stage !== 'ganado' && deal.stage !== 'perdido'
  return (
    <button type="button" onClick={onEdit} className="block w-full rounded-lg border border-border bg-card p-3 text-left hover:border-border/80">
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium text-foreground text-sm">{deal.title}</span>
        {deal.tier && <span className="text-[10px] uppercase tracking-wide text-muted-foreground border border-border rounded px-1.5 py-0.5">{deal.tier}</span>}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-muted-foreground">
        {deal.clientOrg && <span className="inline-flex items-center gap-1"><Building2 size={11} />{deal.clientOrg}</span>}
        {deal.seller && <span>vende: {deal.seller}</span>}
        {money(deal) && <span className="text-foreground/80">{money(deal)}</span>}
        {deal.closeWindow && <span>cierre: {deal.closeWindow}</span>}
        {cold && <span className="text-warn">se está enfriando</span>}
      </div>
      {deal.nextAction && (
        <div className="mt-1 text-[12px] text-foreground/85">→ {deal.nextAction}{deal.nextActionDate ? ` (${deal.nextActionDate})` : ''}</div>
      )}
      {(deal.impactTypes.length > 0 || deal.internalStakeholders.length > 0) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
          {deal.impactTypes.map((t) => (
            <span key={t} className="rounded border border-brand/30 bg-brand-soft/30 px-1.5 py-0.5 text-brand-soft-foreground">{t}</span>
          ))}
          {deal.internalStakeholders.length > 0 && (
            <span className="text-muted-foreground">te acerca a: {deal.internalStakeholders.map((id) => (nameById.get(id) ?? '—').split(' ')[0]).join(', ')}</span>
          )}
        </div>
      )}
    </button>
  )
}

function DealForm({ draft, setDraft, onSave, onCancel, saving, people }: {
  draft: Draft; setDraft: (d: Draft) => void; onSave: () => void; onCancel: () => void; saving: boolean; people: { id: string; name: string }[]
}) {
  const [skQuery, setSkQuery] = useState('')
  const set = (k: keyof Deal, v: unknown) => setDraft({ ...draft, [k]: v })
  const inputCls = 'mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground'
  const lblCls = 'text-xs text-muted-foreground'
  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div>
        <label className={lblCls}>Título *</label>
        <input value={draft.title ?? ''} onChange={(e) => set('title', e.target.value)} placeholder="ej. Licitación seguridad Sienna Minerals" className={inputCls} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lblCls}>Etapa</label>
          <select value={draft.stage ?? 'lead'} onChange={(e) => set('stage', e.target.value as DealStage)} className={inputCls}>
            {STAGE_ORDER.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
          </select>
        </div>
        <div>
          <label className={lblCls}>Estado</label>
          <select value={draft.status ?? 'open'} onChange={(e) => set('status', e.target.value as DealStatus)} className={inputCls}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lblCls}>Empresa cliente</label>
          <input value={draft.clientOrg ?? ''} onChange={(e) => set('clientOrg', e.target.value)} placeholder="Sienna Minerals" className={inputCls} />
        </div>
        <div>
          <label className={lblCls}>Vendemos (K2 / Marlab)</label>
          <input value={draft.seller ?? ''} onChange={(e) => set('seller', e.target.value)} placeholder="K2" className={inputCls} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={lblCls}>Ticket</label>
          <input type="number" value={draft.amount ?? ''} onChange={(e) => set('amount', e.target.value === '' ? undefined : Number(e.target.value))} className={inputCls} />
        </div>
        <div>
          <label className={lblCls}>Moneda</label>
          <input value={draft.currency ?? 'PEN'} onChange={(e) => set('currency', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={lblCls}>Tier</label>
          <select value={draft.tier ?? ''} onChange={(e) => set('tier', (e.target.value || undefined) as DealTier | undefined)} className={inputCls}>
            <option value="">—</option>
            {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lblCls}>Fuente</label>
          <input value={draft.source ?? ''} onChange={(e) => set('source', e.target.value)} placeholder="Formulario web" className={inputCls} />
        </div>
        <div>
          <label className={lblCls}>Ventana de cierre</label>
          <input value={draft.closeWindow ?? ''} onChange={(e) => set('closeWindow', e.target.value)} placeholder="jul-ago 2026" className={inputCls} />
        </div>
      </div>
      <div>
        <label className={lblCls}>Alcance</label>
        <input value={draft.scope ?? ''} onChange={(e) => set('scope', e.target.value)} placeholder="5→20 agentes armados" className={inputCls} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lblCls}>Próximo paso</label>
          <input value={draft.nextAction ?? ''} onChange={(e) => set('nextAction', e.target.value)} placeholder="Reunión Teams con equipo técnico" className={inputCls} />
        </div>
        <div>
          <label className={lblCls}>Fecha próximo paso</label>
          <input type="date" value={draft.nextActionDate ?? ''} onChange={(e) => set('nextActionDate', e.target.value || undefined)} className={inputCls} />
        </div>
      </div>
      <div>
        <label className={lblCls}>¿Por qué te importa? (impacto)</label>
        <div className="mt-1 flex flex-wrap gap-2">
          {IMPACTS.map((imp) => {
            const on = (draft.impactTypes ?? []).includes(imp)
            return (
              <button key={imp} type="button" onClick={() => set('impactTypes', on ? (draft.impactTypes ?? []).filter((x) => x !== imp) : [...(draft.impactTypes ?? []), imp])}
                className={`rounded-full border px-3 py-1 text-xs ${on ? 'border-brand bg-brand text-brand-foreground' : 'border-border text-muted-foreground'}`}>
                {imp}
              </button>
            )
          })}
        </div>
      </div>
      <div>
        <label className={lblCls}>Por qué importa / qué te mueve</label>
        <input value={draft.whyMatters ?? ''} onChange={(e) => set('whyMatters', e.target.value)} placeholder="ej. me hace quedar bien en K2 y acerca a Francisco y Alex" className={inputCls} />
      </div>
      <div>
        <label className={lblCls}>Te acerca a (tu lado — Francisco, Alex…)</label>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {(draft.internalStakeholders ?? []).map((id) => {
            const nm = people.find((p) => p.id === id)?.name ?? id
            return (
              <span key={id} className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-xs text-foreground">
                {nm.split(' ')[0]}
                <button type="button" onClick={() => set('internalStakeholders', (draft.internalStakeholders ?? []).filter((x) => x !== id))} className="text-muted-foreground hover:text-foreground">×</button>
              </span>
            )
          })}
        </div>
        <input value={skQuery} onChange={(e) => setSkQuery(e.target.value)} placeholder="Buscar persona…" className={inputCls} />
        {skQuery.trim().length > 1 && (
          <div className="mt-1 max-h-40 overflow-auto rounded-md border border-border bg-card">
            {people
              .filter((p) => p.name.toLowerCase().includes(skQuery.toLowerCase()) && !(draft.internalStakeholders ?? []).includes(p.id))
              .slice(0, 8)
              .map((p) => (
                <button key={p.id} type="button" onClick={() => { set('internalStakeholders', [...(draft.internalStakeholders ?? []), p.id]); setSkQuery('') }}
                  className="block w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-secondary">
                  {p.name}
                </button>
              ))}
          </div>
        )}
      </div>
      <div>
        <label className={lblCls}>Notas / dossier</label>
        <textarea value={draft.notes ?? ''} onChange={(e) => set('notes', e.target.value)} rows={4} className={inputCls} />
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onSave} disabled={saving || !(draft.title ?? '').trim()} className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-sm text-brand-foreground disabled:opacity-50">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Guardar
        </button>
        <button type="button" onClick={onCancel} disabled={saving} className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground">Cancelar</button>
        {draft.clientOrgSlug && <Link href={`/empresas/${draft.clientOrgSlug}`} className="ml-auto inline-flex items-center gap-1 text-xs text-[#14b8a6] hover:underline"><Building2 size={12} /> ver empresa</Link>}
        {draft.contactPersonId && <Link href={`/relaciones`} className="inline-flex items-center gap-1 text-xs text-[#14b8a6] hover:underline"><User size={12} /> contacto</Link>}
      </div>
    </div>
  )
}
