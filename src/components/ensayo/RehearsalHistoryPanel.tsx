'use client'

// SIR V2 — Histórico de la Sala de Ensayo. Lista las simulaciones pasadas (más
// nuevas primero), expandibles para releer la lectura + escenarios. Cierra el loop
// "tener un histórico de las simulaciones": ver cómo evolucionaron tus ensayos con
// una persona. Se recarga cuando termina un ensayo nuevo (reloadKey).

import { useEffect, useState } from 'react'
import { History, ChevronDown } from 'lucide-react'

import type { RehearseResult } from '@/lib/influence/rehearsePrompt'

interface Session {
  id: string
  personName: string | null
  objective: string
  result: RehearseResult
  contextUsed: Record<string, unknown>
  createdAt: string
}

const LIKELIHOOD_LABEL: Record<string, string> = { plausible: 'plausible', optimista: 'optimista', dificil: 'difícil' }

export function RehearsalHistoryPanel({ personId, reloadKey }: { personId?: string; reloadKey?: number }) {
  const [sessions, setSessions] = useState<Session[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const url = `/api/influence/rehearse/history${personId ? `?person_id=${encodeURIComponent(personId)}` : ''}`
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { sessions?: Array<Record<string, unknown>> } | null) => {
        if (cancelled || !j?.sessions) return
        setSessions(
          j.sessions.map((s) => ({
            id: String(s.id),
            personName: (s.person_name as string) ?? null,
            objective: String(s.objective ?? ''),
            result: s.result as RehearseResult,
            contextUsed: (s.context_used as Record<string, unknown>) ?? {},
            createdAt: String(s.created_at ?? ''),
          })),
        )
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [personId, reloadKey])

  if (!sessions || sessions.length === 0) return null

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 mb-3">
        <History size={14} strokeWidth={1.75} className="text-text-tertiary" aria-hidden="true" />
        <h2 className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Ensayos anteriores</h2>
        <span className="text-[10px] text-muted-foreground/60 font-mono">{sessions.length}</span>
      </div>
      <ul className="space-y-2">
        {sessions.map((s) => {
          const open = openId === s.id
          const ctxBits = [
            s.contextUsed.cycle ? 'ciclo' : null,
            s.contextUsed.pulse ? 'pulso' : null,
            s.contextUsed.selfState ? 'tu estado' : null,
            s.contextUsed.conversation ? 'chat' : null,
          ].filter(Boolean)
          return (
            <li key={s.id} className="rounded-md border border-border/50">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : s.id)}
                className="w-full flex items-start justify-between gap-3 p-3 text-left hover:bg-foreground/[0.02]"
              >
                <div className="min-w-0">
                  <div className="text-sm text-foreground truncate">{s.objective}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {s.personName ?? 'alguien'} · {new Date(s.createdAt).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })}
                    {ctxBits.length > 0 && <span className="text-muted-foreground/60"> · con {ctxBits.join(', ')}</span>}
                  </div>
                </div>
                <ChevronDown size={14} className={`shrink-0 mt-0.5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
              {open && (
                <div className="border-t border-border/40 p-3 space-y-2 text-xs">
                  {s.result.read && <p className="text-muted-foreground leading-relaxed">{s.result.read}</p>}
                  {s.result.scenarios?.length > 0 && (
                    <ul className="space-y-1">
                      {s.result.scenarios.map((sc, i) => (
                        <li key={i} className="text-foreground/90">
                          <span className="font-medium">{sc.title}</span>
                          <span className="ml-1 text-[10px] text-muted-foreground uppercase tracking-wide">
                            {LIKELIHOOD_LABEL[sc.likelihood] ?? sc.likelihood}
                          </span>
                          <div className="text-muted-foreground">{sc.path}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                  {s.result.opener && <p className="text-brand-soft-foreground">Apertura: {s.result.opener}</p>}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
