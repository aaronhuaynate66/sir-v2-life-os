'use client'
// SIR V2 — /captura/pegar: pegar una conversación (Teams, Slack, cualquier chat)
// y que SIR la lea. El camino SIMPLE del Reader — sin extensión. Consume
// POST /api/reader/paste (parsea + pipeline de conversación, idempotente).

import { useState } from 'react'
import Link from 'next/link'
import { ClipboardPaste, ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react'

import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const PLATFORMS = [
  { value: 'teams', label: 'Microsoft Teams' },
  { value: 'slack', label: 'Slack' },
  { value: 'other', label: 'Otro chat' },
]

interface Result { ingested: number; personMatched?: boolean; reason?: string }

export default function PegarConversacionPage() {
  const [platform, setPlatform] = useState('teams')
  const [threadName, setThreadName] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)

  async function importar() {
    if (busy || !threadName.trim() || !text.trim()) return
    setBusy(true); setErr(null); setResult(null)
    try {
      const res = await fetch('/api/reader/paste', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, threadName, text }),
      })
      const j = await res.json()
      if (!res.ok) { setErr(j.error ?? 'No pude importar'); return }
      setResult(j as Result)
      if ((j as Result).ingested > 0) setText('')
    } catch { setErr('No pude importar') } finally { setBusy(false) }
  }

  return (
    <AppShell>
      <div className="mb-6">
        <Link href="/captura" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeft size={14} strokeWidth={1.75} /> Captura
        </Link>
        <div className="flex items-center gap-3">
          <ClipboardPaste size={26} strokeWidth={1.5} className="text-muted-foreground" aria-hidden="true" />
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Pegar conversación</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
          Copia un hilo de Teams (o cualquier chat) y pégalo aquí. SIR lo lee y lo suma al contexto de esa persona.
          Puedes pegar de nuevo cuando quieras: solo se agrega lo nuevo.
        </p>
      </div>

      <Card className="mb-4">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1">
              <label htmlFor="thread-name" className="text-xs text-muted-foreground">¿Con quién es la conversación?</label>
              <Input id="thread-name" value={threadName} onChange={(e) => setThreadName(e.target.value)} placeholder="Nombre de la persona (para ligarlo a su ficha)" className="mt-1" />
            </div>
            <div className="sm:w-48">
              <label htmlFor="platform" className="text-xs text-muted-foreground">Plataforma</label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger id="platform" className="mt-1" aria-label="Plataforma"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label htmlFor="conv" className="text-xs text-muted-foreground">La conversación</label>
            <textarea
              id="conv" value={text} onChange={(e) => setText(e.target.value)}
              rows={12} placeholder="Pega aquí el texto del hilo (Ctrl+A en el chat → Ctrl+C → Ctrl+V aquí)…"
              className="mt-1 w-full resize-y rounded-md border border-border bg-background p-3 font-mono text-[12px] leading-relaxed"
            />
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <Button onClick={() => void importar()} disabled={busy || !threadName.trim() || !text.trim()}>
              {busy ? <Loader2 size={15} className="mr-2 animate-spin" /> : <ClipboardPaste size={15} className="mr-2" />} Importar
            </Button>
            {err && <span className="text-xs text-bad">{err}</span>}
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card className="border-ok/30">
          <CardContent className="p-4 flex items-start gap-2">
            <CheckCircle2 size={16} strokeWidth={1.75} className="text-ok mt-0.5 flex-shrink-0" aria-hidden="true" />
            <div className="text-sm">
              {result.ingested > 0 ? (
                <>
                  <span className="font-medium text-foreground">{result.ingested} mensaje{result.ingested === 1 ? '' : 's'} nuevo{result.ingested === 1 ? '' : 's'}</span> importado{result.ingested === 1 ? '' : 's'}.
                  {result.personMatched ? ' Ligado a la ficha de la persona.' : ' No encontré a esa persona por el nombre — quedó sin ligar (revisa el nombre o crea la ficha).'}
                </>
              ) : (
                <>Nada nuevo para importar — ya tenías esta conversación.</>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </AppShell>
  )
}
