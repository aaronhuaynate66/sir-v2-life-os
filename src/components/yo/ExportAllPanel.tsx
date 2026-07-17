'use client'
// SIR V2 — ExportAllPanel: botón "Descargar todo" en /yo.
//
// Trigger de GET /api/export/all → descarga un .zip con todos los CSVs de tu
// data. Data ownership seria: si SIR desaparece, tienes todo en Excel-friendly.
// La descarga puede tardar unos segundos si tienes muchos observations —
// mostramos un spinner mientras.

import { useState } from 'react'
import { Download, Loader2, AlertCircle } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export function ExportAllPanel() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function download() {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/export/all')
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const cd = res.headers.get('Content-Disposition') ?? ''
      const m = cd.match(/filename="([^"]+)"/)
      a.download = m ? m[1] : 'sir-export.zip'
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }

  return (
    <Card className="shadow-none">
      <CardContent className="p-4 sm:p-5 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Download size={14} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
          <span className="text-[10px] uppercase tracking-widest text-text-tertiary font-sans">
            Descargar todo
          </span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Un <code className="text-[11px] font-mono">.zip</code> con todos tus datos como CSVs (personas,
          moments, memorias, logs, objetivos, ciclos, briefings…). Abre con Excel/Sheets. Data ownership real:
          si SIR desaparece, sigues teniendo todo.
        </p>
        <div className="flex items-center gap-2 flex-wrap pt-1">
          <Button size="sm" onClick={() => void download()} disabled={busy}>
            {busy ? <><Loader2 size={11} className="mr-1.5 animate-spin" /> Generando…</> : <><Download size={11} className="mr-1.5" /> Descargar backup</>}
          </Button>
          <span className="text-[10px] text-muted-foreground/60">Excluye tokens y notas privadas.</span>
        </div>
        {error && (
          <div className="flex items-start gap-1.5 text-[11px] text-bad pt-1">
            <AlertCircle size={11} className="mt-0.5" /> {error}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
