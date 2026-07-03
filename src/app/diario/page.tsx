'use client'
// SIR V2 — /diario: journal íntimo.
//
// Input libre arriba (grande, sin obligación de estructurar).
// Timeline abajo por fecha desc, con búsqueda y filtro por tag.
// Chips clicables para deep-link a personas mencionadas.

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { BookHeart, Send, Loader2, Search, X, Trash2, AlertCircle, User } from 'lucide-react'

import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface Entry {
  id: string
  content: string
  mood: number | null
  tags: string[]
  mentioned_person_ids: string[]
  mentioned_persons: Array<{ id: string; name: string; slug: string | null }>
  entry_date: string
  created_at: string
  updated_at: string
}

const MOOD_EMOJI = ['', '😞', '😔', '😐', '🙂', '😄']

const ABS_DATE = new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const DAY_ABS = new Intl.DateTimeFormat('es', { weekday: 'long', day: '2-digit', month: 'short' })

function ymdOf(iso: string): string {
  return iso.slice(0, 10)
}

export default function DiarioPage() {
  const [draft, setDraft] = useState('')
  const [mood, setMood] = useState<number | null>(null)
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const params = new URLSearchParams()
      if (search.trim().length >= 2) params.set('q', search.trim())
      if (activeTag) params.set('tag', activeTag)
      params.set('limit', '100')
      const r = await fetch(`/api/diario?${params.toString()}`, { cache: 'no-store' })
      if (!r.ok) { setEntries([]); return }
      const j = (await r.json()) as { entries?: Entry[] }
      setEntries(j.entries ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setEntries([])
    }
  }, [search, activeTag])

  useEffect(() => { void load() }, [load])

  async function submit() {
    const content = draft.trim()
    if (!content) return
    setBusy(true); setError(null)
    try {
      const r = await fetch('/api/diario', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, mood }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({})) as { error?: string }
        setError(j.error ?? `HTTP ${r.status}`)
        return
      }
      setDraft(''); setMood(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }

  async function remove(id: string) {
    if (!confirm('¿Borrar esta entrada?')) return
    setEntries((prev) => prev?.filter((e) => e.id !== id) ?? [])
    try { await fetch(`/api/diario?id=${encodeURIComponent(id)}`, { method: 'DELETE' }) } catch { /* */ }
  }

  const tagsInFeed = useMemo(() => {
    const s = new Set<string>()
    for (const e of entries ?? []) for (const t of e.tags) s.add(t)
    return [...s].slice(0, 12)
  }, [entries])

  // Agrupar por día para header con fecha.
  const groupedByDay = useMemo(() => {
    if (!entries) return []
    const groups = new Map<string, Entry[]>()
    for (const e of entries) {
      const day = ymdOf(e.entry_date)
      const arr = groups.get(day) ?? []
      arr.push(e)
      groups.set(day, arr)
    }
    return [...groups.entries()].map(([day, items]) => ({ day, items }))
  }, [entries])

  return (
    <AppShell>
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <BookHeart size={26} strokeWidth={1.5} className="text-muted-foreground" />
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Diario</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
          Escribí lo que quieras. Sin estructura, sin obligación. Si mencionás a alguien conocido,
          se linkea a su ficha. Los hashtags <code className="text-[11px] font-mono">#así</code> se
          indexan para filtrar.
        </p>
      </div>

      {/* Input de nueva entrada */}
      <Card className="shadow-none mb-4">
        <CardContent className="p-4 sm:p-5 space-y-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submit() }
            }}
            placeholder="¿Qué pasó hoy? ¿Qué estás pensando? Podés usar #tags."
            rows={4}
            className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground/30 min-h-[100px] max-h-[400px]"
            disabled={busy}
          />
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <span>Cómo estás:</span>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setMood((v) => v === n ? null : n)}
                  disabled={busy}
                  className={cn(
                    'text-base rounded transition-transform hover:scale-110',
                    mood === n && 'scale-125',
                    mood !== null && mood !== n && 'opacity-40',
                  )}
                  title={`Mood ${n}/5`}
                >
                  {MOOD_EMOJI[n]}
                </button>
              ))}
            </div>
            <Button size="sm" onClick={() => void submit()} disabled={!draft.trim() || busy} className="ml-auto">
              {busy ? <><Loader2 size={13} className="mr-1.5 animate-spin" /> Guardando…</> : <><Send size={13} className="mr-1.5" /> Guardar (Ctrl+Enter)</>}
            </Button>
          </div>
          {error && (
            <div className="flex items-start gap-1.5 text-[11px] text-bad">
              <AlertCircle size={11} className="mt-0.5" /> {error}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Búsqueda + tags */}
      <div className="mb-4 space-y-2">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar en tus entradas… (2+ caracteres)"
            className="pl-9 h-9 text-sm"
          />
        </div>
        {tagsInFeed.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {activeTag && (
              <button
                type="button"
                onClick={() => setActiveTag(null)}
                className="inline-flex items-center gap-1 text-[10px] text-brand hover:underline"
              >
                <X size={9} /> quitar filtro
              </button>
            )}
            {tagsInFeed.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setActiveTag((v) => v === t ? null : t)}
                className={cn(
                  'text-[10px] px-2 py-0.5 rounded-full border font-mono',
                  activeTag === t
                    ? 'bg-brand text-primary-foreground border-brand'
                    : 'bg-muted/30 text-muted-foreground border-border hover:text-foreground',
                )}
              >
                #{t}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Timeline por día */}
      {entries == null && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
          <Loader2 size={12} className="animate-spin" /> Cargando entradas…
        </div>
      )}
      {entries && entries.length === 0 && (
        <Card className="shadow-none">
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            {search || activeTag ? 'Sin entradas con ese filtro.' : 'Todavía no escribiste nada. Arriba tenés el input.'}
          </CardContent>
        </Card>
      )}

      <div className="space-y-6">
        <AnimatePresence initial={false}>
          {groupedByDay.map(({ day, items }) => (
            <motion.div
              key={day}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="text-[11px] uppercase tracking-widest text-text-tertiary font-sans mb-2">
                {DAY_ABS.format(new Date(day))}
              </div>
              <div className="space-y-2">
                {items.map((e) => (
                  <Card key={e.id} className="shadow-none">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="text-[10px] font-mono text-muted-foreground/60">
                          {ABS_DATE.format(new Date(e.entry_date))}
                          {e.mood != null && <span className="ml-2 text-base">{MOOD_EMOJI[e.mood]}</span>}
                        </div>
                        <button
                          type="button"
                          onClick={() => void remove(e.id)}
                          className="text-muted-foreground/40 hover:text-bad transition-colors"
                          aria-label="Borrar"
                          title="Borrar"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                      <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{e.content}</p>
                      <div className="flex items-center gap-1.5 flex-wrap pt-1">
                        {e.mentioned_persons.map((mp) => (
                          <Link
                            key={mp.id}
                            href={mp.slug ? `/relaciones/${mp.slug}` : `/relaciones`}
                            className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-brand/10 text-brand border border-brand/30 hover:bg-brand/20"
                          >
                            <User size={9} /> {mp.name.split(' ')[0]}
                          </Link>
                        ))}
                        {e.tags.map((t) => (
                          <Badge key={t} variant="outline" className="text-[9px] font-mono">#{t}</Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </AppShell>
  )
}
