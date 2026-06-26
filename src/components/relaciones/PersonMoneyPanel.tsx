'use client'
// SIR V2 — Registro de plata por persona. Préstamos/transferencias/saldos con
// fecha, hora, concepto y dirección — lo que el chat no captura. Neto = lo que
// le pasaste menos lo que te devolvió.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Wallet, Plus, X, ArrowUpRight, ArrowDownLeft } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SectionTitle } from '@/components/ui/section-title'
import { summarizeMoney, type MoneyEntry, type MoneyDirection } from '@/lib/money/types'

function fmtD(iso: string | null): string {
  if (!iso) return '—'
  try { return new Date(`${iso}T12:00:00Z`).toLocaleDateString('es', { day: '2-digit', month: 'short', timeZone: 'UTC' }) } catch { return iso }
}

export function PersonMoneyPanel({ personId }: { personId: string }) {
  const [entries, setEntries] = useState<MoneyEntry[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [show, setShow] = useState(false)
  const [f, setF] = useState({ direction: 'out' as MoneyDirection, amount: '', concept: '', occurred_on: '', occurred_time: '' })

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/people/money?person_id=${encodeURIComponent(personId)}`)
      if (r.ok) { const j = (await r.json()) as { entries: MoneyEntry[] }; setEntries(j.entries ?? []) }
    } catch { /* */ } finally { setLoaded(true) }
  }, [personId])
  useEffect(() => { void load() }, [load])

  const sum = useMemo(() => summarizeMoney(entries), [entries])

  const add = useCallback(async () => {
    if (!f.amount || busy) return; setBusy(true)
    try {
      await fetch('/api/people/money', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_id: personId, direction: f.direction, amount: Number(f.amount), concept: f.concept || undefined, occurred_on: f.occurred_on || undefined, occurred_time: f.occurred_time || undefined }) })
      setF({ direction: 'out', amount: '', concept: '', occurred_on: '', occurred_time: '' }); setShow(false); await load()
    } finally { setBusy(false) }
  }, [f, busy, personId, load])

  const del = useCallback(async (id: string) => {
    setEntries((p) => p.filter((x) => x.id !== id))
    try { await fetch(`/api/people/money?id=${encodeURIComponent(id)}`, { method: 'DELETE' }) } catch { void load() }
  }, [load])

  if (!loaded) return null

  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <SectionTitle icon={Wallet} label="Plata" />
          <button type="button" onClick={() => setShow((v) => !v)} className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"><Plus size={13} /> registrar</button>
        </div>

        {entries.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-4 text-[13px]">
            <span className="text-muted-foreground">Le pasaste <span className="font-semibold text-foreground">S/ {sum.out.toFixed(2)}</span></span>
            <span className="text-muted-foreground">Te devolvió <span className="font-semibold text-foreground">S/ {sum.in.toFixed(2)}</span></span>
            <span className="text-muted-foreground">Neto <span className="font-semibold" style={{ color: sum.net > 0 ? '#e0a93b' : '#2dd4a7' }}>S/ {sum.net.toFixed(2)}</span>{sum.net > 0 ? ' (te debe)' : ''}</span>
          </div>
        )}

        {show && (
          <div className="mt-3 space-y-2 rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex gap-2">
              <button type="button" onClick={() => setF((x) => ({ ...x, direction: 'out' }))} className={`flex-1 rounded-md border px-2 py-1 text-[12px] ${f.direction === 'out' ? 'border-brand bg-brand text-brand-foreground' : 'border-border text-muted-foreground'}`}>Le pasé</button>
              <button type="button" onClick={() => setF((x) => ({ ...x, direction: 'in' }))} className={`flex-1 rounded-md border px-2 py-1 text-[12px] ${f.direction === 'in' ? 'border-brand bg-brand text-brand-foreground' : 'border-border text-muted-foreground'}`}>Me devolvió</button>
            </div>
            <div className="flex gap-2">
              <Input type="number" placeholder="Monto" value={f.amount} onChange={(e) => setF((x) => ({ ...x, amount: e.target.value }))} className="w-28 text-[13px]" />
              <Input type="date" value={f.occurred_on} onChange={(e) => setF((x) => ({ ...x, occurred_on: e.target.value }))} className="text-[13px]" />
              <Input placeholder="hora" value={f.occurred_time} onChange={(e) => setF((x) => ({ ...x, occurred_time: e.target.value }))} className="w-24 text-[13px]" />
            </div>
            <Input placeholder="Concepto (ej. endoscopia)" value={f.concept} onChange={(e) => setF((x) => ({ ...x, concept: e.target.value }))} className="text-[13px]" />
            <Button size="sm" disabled={busy || !f.amount} onClick={add}>Guardar</Button>
          </div>
        )}

        {entries.length > 0 && (
          <ul className="mt-3 divide-y divide-border">
            {entries.map((e) => (
              <li key={e.id} className="flex items-center gap-2 py-1.5 text-[13px]">
                {e.direction === 'out' ? <ArrowUpRight size={14} style={{ color: '#e0a93b' }} /> : <ArrowDownLeft size={14} style={{ color: '#2dd4a7' }} />}
                <span className="font-mono tabular-nums w-20">{e.currency} {e.amount.toFixed(2)}</span>
                <span className="text-muted-foreground">{fmtD(e.occurredOn)}{e.occurredTime ? ` ${e.occurredTime}` : ''}</span>
                {e.concept && <span className="text-foreground/80">· {e.concept}</span>}
                {e.kind === 'loan' && <span className="text-[10px] rounded bg-amber-500/15 px-1.5 text-amber-500">préstamo</span>}
                <button type="button" onClick={() => del(e.id)} className="ml-auto text-muted-foreground hover:text-foreground"><X size={13} /></button>
              </li>
            ))}
          </ul>
        )}
        {entries.length === 0 && !show && <p className="mt-2 text-[13px] text-muted-foreground">Sin movimientos. Registrá préstamos o transferencias para llevar el neto.</p>}
      </CardContent>
    </Card>
  )
}
