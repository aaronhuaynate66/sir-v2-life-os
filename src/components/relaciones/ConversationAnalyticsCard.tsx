'use client'

// SIR V2 — "Pulso de la conversación" (Capa 0: estadística temporal pura).
//
// Lee la analítica temporal de la conversación con esta persona (POST, sin efecto
// secundario más allá del log de evento): tendencia de volumen, cadencia + próximo
// contacto, balance, latencia, tono y temas que suben. Cero LLM. Honesto: si hay
// pocos mensajes, lo dice.

import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, Minus, MessageSquare } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import type { ConversationAnalytics, Direction } from '@/lib/conversation-analytics/analyze'
import { initiationInsight } from '@/lib/conversation-analytics/insight'

export interface ConversationAnalyticsCardProps {
  personId: string
  personName: string
}

function DirIcon({ dir }: { dir: Direction }) {
  if (dir === 'creciendo') return <TrendingUp size={15} strokeWidth={1.75} style={{ color: 'hsl(var(--success))' }} aria-hidden="true" />
  if (dir === 'enfriándose') return <TrendingDown size={15} strokeWidth={1.75} style={{ color: 'hsl(var(--destructive))' }} aria-hidden="true" />
  return <Minus size={15} strokeWidth={1.75} className="text-muted-foreground" aria-hidden="true" />
}

function days(n: number | null): string {
  if (n == null) return '—'
  if (n < 1) return 'hoy'
  if (n < 2) return 'ayer'
  return `hace ${Math.round(n)} d`
}

function whenFromNow(at: number | null): string {
  if (at == null) return '—'
  const d = (at - Date.now()) / 86_400_000
  if (d < 0) return 'ya pasado'
  if (d < 1) return 'en el día'
  return `en ~${Math.round(d)} d`
}

function fmtDate(at: number): string {
  try { return new Date(at).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' }) } catch { return '' }
}

export function ConversationAnalyticsCard({ personId, personName }: ConversationAnalyticsCardProps) {
  const [a, setA] = useState<ConversationAnalytics | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/conversation-analytics', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ personId }),
        })
        if (!res.ok) return
        const data = (await res.json()) as { analytics?: ConversationAnalytics }
        if (!cancelled && data.analytics) setA(data.analytics)
      } catch {
        // best-effort: el panel es opcional.
      } finally {
        if (!cancelled) setLoaded(true)
      }
    })()
    return () => { cancelled = true }
  }, [personId])

  if (!loaded && !a) return null
  if (!a || a.total < 6) {
    if (!a) return null
    return (
      <Card className="shadow-none">
        <CardContent className="p-4 sm:p-5">
          <Header />
          <p className="text-sm text-muted-foreground py-1">
            Todavía hay pocas conversaciones con {personName} para leer el ritmo. Se irá completando con cada chat capturado. 🌱
          </p>
        </CardContent>
      </Card>
    )
  }

  const mePct = a.myShare != null ? Math.round(a.myShare * 100) : null
  const insight = initiationInsight(a, personName.split(' ')[0])

  return (
    <Card className="shadow-none">
      <CardContent className="p-4 sm:p-5 space-y-3">
        <Header />

        {insight && (
          <p className="rounded-md border border-brand/25 bg-brand-soft/60 px-3 py-2 text-[13px] leading-relaxed text-foreground">
            {insight}
          </p>
        )}

        {a.volume && (
          <div className="flex items-center gap-2 text-sm">
            <DirIcon dir={a.volume.direction} />
            <span className="text-foreground">
              {a.volume.direction === 'creciendo' ? 'Vienen hablando más' : a.volume.direction === 'enfriándose' ? 'Se viene enfriando' : 'Ritmo estable'}
            </span>
            <span className="font-mono tabular-nums text-muted-foreground text-xs">
              {a.volume.slopePerWeek > 0 ? '+' : ''}{a.volume.slopePerWeek} msgs/sem
            </span>
          </div>
        )}

        {a.volume?.changePoint && (
          <div className="text-[13px] text-muted-foreground -mt-1">
            Quiebre: <span className="text-foreground">{a.volume.changePoint.direction}</span> alrededor del {fmtDate(a.volume.changePoint.at)}
          </div>
        )}

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
          <Stat label="Mensajes" value={`${a.total}`} sub={mePct != null ? `vos ${mePct}% / ${personName.split(' ')[0]} ${100 - mePct}%` : undefined} />
          <Stat label="Última vez" value={days(a.lastContactDaysAgo)} />
          {a.cadence && <Stat label="Se hablan cada" value={`~${a.cadence.medianGapDays} d`} sub={a.cadence.nextContactAt ? `próximo ${whenFromNow(a.cadence.nextContactAt)}` : undefined} />}
          {a.latency?.myMedianMinutes != null && <Stat label="Respondés en" value={`~${a.latency.myMedianMinutes} min`} />}
          {a.myInitiationShare != null && <Stat label="Iniciás vos" value={`${Math.round(a.myInitiationShare * 100)}%`} sub="de las charlas" />}
          {a.tone && <Stat label="Tono" value={a.tone.index > 0.05 ? 'positivo' : a.tone.index < -0.05 ? 'tenso' : 'neutro'} sub={a.tone.direction !== 'estable' ? a.tone.direction : undefined} />}
        </div>

        {a.topics && a.topics.rising.length > 0 && (
          <div className="pt-1">
            <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary mb-1.5">Temas que suben</div>
            <div className="flex flex-wrap gap-1.5">
              {a.topics.rising.map((t) => (
                <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-muted text-foreground/80">{t}</span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Header() {
  return (
    <div className="flex items-center gap-2 mb-1">
      <MessageSquare size={13} strokeWidth={1.75} className="text-text-tertiary" aria-hidden="true" />
      <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Pulso de la conversación</div>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-[11px] text-text-tertiary">{label}</div>
      <div className="text-foreground font-medium tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  )
}
