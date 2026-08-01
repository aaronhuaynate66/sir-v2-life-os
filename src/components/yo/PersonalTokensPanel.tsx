'use client'
// SIR V2 — PersonalTokensPanel: gestión de Personal Access Tokens.
//
// Aaron pidió (02-jul-2026) poder contarme cosas por chat y que yo llene
// SIR directo. Este panel es la Fase 1: generar tokens que un cliente
// externo (Claude, script, curl) usa como `Authorization: Bearer sirp_<token>`.
//
// Reglas:
//   - El token PLANO se muestra UNA vez tras crearlo. Aaron lo copia y ya.
//   - Después solo se ve el prefix (ej. "sirp_9x2K…") + últimos usos.
//   - "Revocar" es soft (setea revoked_at) — nunca se reusa el hash.
//
// El panel es CERRADO POR DEFAULT — es una sección técnica y no quiero que
// grite en /yo. Se abre con click.

import { useCallback, useEffect, useState } from 'react'
import { Key, Plus, Trash2, Copy, Loader2, AlertCircle, ChevronDown, Eye, EyeOff, CheckCircle2 } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatRelative } from '@/lib/auth/tokensFormat'

interface TokenDto {
  id: string
  label: string
  prefix: string
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}
interface FreshToken extends TokenDto { plain: string }

export function PersonalTokensPanel() {
  const [open, setOpen] = useState(false)
  const [tokens, setTokens] = useState<TokenDto[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [label, setLabel] = useState('Claude Code')
  const [justCreated, setJustCreated] = useState<FreshToken | null>(null)
  const [reveal, setReveal] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/tokens', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const j = (await res.json()) as { tokens: TokenDto[] }
      setTokens(j.tokens ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { if (open) void load() }, [open, load])

  async function createToken() {
    setCreating(true); setError(null)
    try {
      const res = await fetch('/api/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label.trim() || 'Token' }),
      })
      const j = (await res.json()) as { token?: FreshToken; error?: string }
      if (!res.ok || !j.token) { setError(j.error ?? 'error'); return }
      setJustCreated(j.token)
      setReveal(true); setCopied(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error')
    } finally { setCreating(false) }
  }

  async function revokeToken(id: string) {
    if (!confirm('¿Revocar este token? Cualquier cliente que lo use dejará de autenticar.')) return
    try {
      const res = await fetch(`/api/tokens?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error')
    }
  }

  async function copyPlain() {
    if (!justCreated) return
    try {
      await navigator.clipboard.writeText(justCreated.plain)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* silent */ }
  }

  const active = tokens.filter((t) => !t.revokedAt)
  const revoked = tokens.filter((t) => t.revokedAt)

  return (
    <Card className="shadow-none">
      <CardContent className="p-4 sm:p-5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-2"
          aria-expanded={open}
        >
          <div className="flex items-center gap-2">
            <Key size={14} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
            <span className="text-[10px] uppercase tracking-widest text-text-tertiary font-sans">Acceso por API (tokens)</span>
            {active.length > 0 && (
              <Badge variant="outline" className="text-[10px] font-mono">{active.length} activo{active.length === 1 ? '' : 's'}</Badge>
            )}
          </div>
          <ChevronDown size={14} strokeWidth={1.75} className={cn('text-muted-foreground/60 transition-transform', open && 'rotate-180')} aria-hidden="true" />
        </button>

        {open && (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Genera un token para que un cliente externo (Claude Code, un script) hable con SIR como si
              fueras tú. Los tokens se muestran UNA vez al crearlos — cópialos ahí. Después solo verás
              el prefijo y puedes revocarlos.
            </p>

            {/* Recién creado — mostrar plano una vez. */}
            {justCreated && (
              <div className="rounded-md border border-ok/40 bg-ok-soft p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={13} strokeWidth={1.75} className="text-ok" aria-hidden="true" />
                  <span className="text-xs font-medium text-foreground">Token creado — cópialo AHORA</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  No vas a poder verlo de nuevo. Si lo pierdes, revócalo y genera otro.
                </p>
                <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5">
                  <code className="flex-1 min-w-0 text-[11px] font-mono text-foreground break-all">
                    {reveal ? justCreated.plain : justCreated.plain.slice(0, 12) + '…'.padEnd(24, '•')}
                  </code>
                  <button
                    type="button"
                    onClick={() => setReveal((v) => !v)}
                    className="text-muted-foreground hover:text-foreground p-1"
                    aria-label={reveal ? 'Ocultar' : 'Mostrar'}
                  >
                    {reveal ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyPlain()}
                    className="text-muted-foreground hover:text-foreground p-1"
                    aria-label="Copiar"
                  >
                    <Copy size={13} />
                  </button>
                </div>
                {copied && <p className="text-[10px] text-ok">Copiado ✓</p>}
                <div className="rounded-md border border-border bg-background/60 p-2 mt-1">
                  <p className="text-[10px] text-muted-foreground mb-1">Con esto, cuéntale a SIR desde afuera (Claude, un atajo del cel, un script) y se llena solo:</p>
                  <code className="block text-[10px] font-mono text-foreground/80 whitespace-pre-wrap break-all leading-relaxed">
{`curl -X POST ${typeof window !== 'undefined' ? window.location.origin : ''}/api/relato/ingest \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"text":"Hoy almorcé con Alex y hablamos del aumento","apply":true}'`}
                  </code>
                </div>
                <div className="flex justify-end">
                  <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => { setJustCreated(null); setReveal(false) }}>
                    Listo, lo copié
                  </Button>
                </div>
              </div>
            )}

            {/* Form de creación */}
            {!justCreated && (
              <div className="flex items-end gap-2 flex-wrap">
                <div className="flex-1 min-w-0">
                  <label className="text-[10px] uppercase tracking-widest text-text-tertiary font-sans block mb-1">
                    Etiqueta
                  </label>
                  <Input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="Claude Code · sesión actual"
                    className="h-8 text-xs"
                    disabled={creating}
                  />
                </div>
                <Button size="sm" onClick={() => void createToken()} disabled={creating}>
                  {creating ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Plus size={13} className="mr-1.5" />}
                  Generar token
                </Button>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-md border border-bad/30 bg-bad-soft p-2">
                <AlertCircle size={12} strokeWidth={1.75} className="text-bad mt-0.5 flex-shrink-0" />
                <span className="text-[11px] text-bad leading-relaxed">{error}</span>
              </div>
            )}

            {/* Lista */}
            {loading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 size={12} className="animate-spin" /> Cargando…
              </div>
            )}

            {active.length > 0 && (
              <ul className="divide-y divide-border/40 rounded-md border border-border/60">
                {active.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-foreground truncate flex items-center gap-2">
                        {t.label}
                        <code className="text-[10px] font-mono text-muted-foreground/80">{t.prefix}…</code>
                      </div>
                      <div className="text-[10px] text-muted-foreground/70">
                        Creado {formatRelative(t.createdAt)} · último uso {formatRelative(t.lastUsedAt)}
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-bad"
                      onClick={() => void revokeToken(t.id)}
                      aria-label="Revocar token"
                    >
                      <Trash2 size={13} strokeWidth={1.75} />
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {revoked.length > 0 && (
              <details className="text-[11px]">
                <summary className="cursor-pointer text-muted-foreground/70 hover:text-foreground">
                  {revoked.length} token{revoked.length === 1 ? '' : 's'} revocado{revoked.length === 1 ? '' : 's'}
                </summary>
                <ul className="mt-1 space-y-1 pl-3 text-muted-foreground/60">
                  {revoked.map((t) => (
                    <li key={t.id} className="truncate">
                      {t.label} · <code className="font-mono">{t.prefix}…</code> · revocado {formatRelative(t.revokedAt)}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
