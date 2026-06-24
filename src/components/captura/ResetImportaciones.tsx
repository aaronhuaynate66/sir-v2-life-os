'use client'
// SIR V2 — ResetImportaciones: borra SOLO lo derivado de imports (por alcance)
// para re-importar limpio. Conserva lo manual (personas, vínculos, episodios,
// objetivos, salud, deals). Acción irreversible → requiere confirmación.

import { useState } from 'react'
import { Trash2, Loader2, AlertTriangle, Check } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

type Scope = 'conversations' | 'archives' | 'interactions' | 'memories' | 'dates' | 'identities'
const SCOPES: { id: Scope; label: string; hint: string; danger?: boolean }[] = [
  { id: 'conversations', label: 'Conversaciones importadas', hint: 'Las observaciones de chats de WhatsApp.' },
  { id: 'archives', label: 'Archivos crudos', hint: 'El texto completo guardado de cada chat.' },
  { id: 'interactions', label: 'Interacciones de import', hint: 'Tono inferido, llamadas y notas "Importado de…".' },
  { id: 'memories', label: 'Memorias derivadas de chats', hint: 'Las memorias extraídas de conversaciones.' },
  { id: 'dates', label: 'Fechas importantes (todas las personas)', hint: 'OJO: borra también fechas que cargaste a mano.', danger: true },
  { id: 'identities', label: 'Identidades/alias por red + huellas', hint: 'Se re-aprenden al re-importar.', danger: true },
]

export function ResetImportaciones() {
  const [sel, setSel] = useState<Record<Scope, boolean>>({ conversations: true, archives: true, interactions: true, memories: true, dates: false, identities: false })
  const [confirm, setConfirm] = useState(false)
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState<Record<string, number | string> | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const scopes = (Object.keys(sel) as Scope[]).filter((k) => sel[k])

  async function run() {
    if (running || !confirm || scopes.length === 0) return
    setRunning(true); setErr(null); setDone(null)
    try {
      const r = await fetch('/api/reset-imports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scopes, confirm: true }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(j.detail || j.error || 'Falló el reset.'); return }
      setDone(j.done ?? {}); setConfirm(false)
    } catch { setErr('Falló el reset.') } finally { setRunning(false) }
  }

  return (
    <Card className="mb-6 border-bad/40 shadow-none">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle size={16} className="text-bad" aria-hidden="true" />
          <div className="text-[11px] uppercase tracking-[0.07em] text-bad">Reset de importaciones</div>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          Borra <span className="font-medium">solo lo derivado de imports</span> para re-importar limpio. Conserva personas, vínculos, episodios, objetivos, salud y deals. <span className="text-bad">Es irreversible.</span>
        </p>

        <div className="space-y-1.5 mb-3">
          {SCOPES.map((s) => (
            <label key={s.id} className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={sel[s.id]} disabled={running} onChange={(e) => setSel((p) => ({ ...p, [s.id]: e.target.checked }))} className="mt-0.5" />
              <span>
                <span className={s.danger ? 'text-bad' : 'text-foreground'}>{s.label}</span>
                <span className="block text-[11px] text-muted-foreground">{s.hint}</span>
              </span>
            </label>
          ))}
        </div>

        {done ? (
          <div className="rounded-lg border border-good/40 bg-good/10 p-2.5 text-xs text-foreground">
            ✓ Listo. {Object.entries(done).map(([k, v]) => `${k}: ${v}`).join(' · ')}
          </div>
        ) : (
          <>
            <label className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <input type="checkbox" checked={confirm} disabled={running} onChange={(e) => setConfirm(e.target.checked)} />
              Entiendo que es irreversible y que tendré que re-importar.
            </label>
            {err && <div className="text-xs text-bad mb-2">{err}</div>}
            <Button size="sm" variant="destructive" onClick={() => void run()} disabled={running || !confirm || scopes.length === 0}>
              {running ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Trash2 size={14} className="mr-2" />} Borrar lo seleccionado
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
