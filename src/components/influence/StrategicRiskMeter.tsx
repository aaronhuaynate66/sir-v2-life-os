'use client'

import { AlertTriangle, Ban, CheckCircle2, Gauge, ShieldAlert } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { EthicsCheck, EthicsLine, EthicsVerdict } from '@/engines/ethics'

const VERDICT_META: Record<EthicsVerdict, { label: string; tone: string; bar: string; icon: typeof CheckCircle2 }> = {
  ok: {
    label: 'Estrategia limpia',
    tone: 'border-good/30 bg-good-soft text-good',
    bar: 'bg-good',
    icon: CheckCircle2,
  },
  caution: {
    label: 'Zona gris util',
    tone: 'border-warn/30 bg-warn-soft text-warn',
    bar: 'bg-warn',
    icon: Gauge,
  },
  high_risk: {
    label: 'Cerca de cruzar linea',
    tone: 'border-orange-400/40 bg-orange-500/10 text-orange-600',
    bar: 'bg-orange-500',
    icon: AlertTriangle,
  },
  blocked: {
    label: 'Linea cruzada',
    tone: 'border-bad/30 bg-bad-soft text-bad',
    bar: 'bg-bad',
    icon: Ban,
  },
}

const LINE_LABEL: Record<EthicsLine, string> = {
  truth: 'Verdad',
  pressure: 'Presion',
  vulnerability: 'Vulnerabilidad',
  privacy: 'Privacidad',
  autonomy: 'Autonomia',
  legal: 'Legal',
  reputation: 'Reputacion',
  critical: 'Decision critica',
}

export function StrategicRiskMeter({ ethics }: { ethics?: EthicsCheck | null }) {
  if (!ethics || ethics.verdict === 'ok') return null
  const meta = VERDICT_META[ethics.verdict]
  const Icon = meta.icon
  const score = Math.max(0, Math.min(100, ethics.score ?? ethics.riskScore ?? 0))

  return (
    <Card className={cn('shadow-none overflow-hidden', meta.tone)}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <Icon size={20} strokeWidth={1.75} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-semibold">Termometro de jugada</div>
              <Badge variant="outline" className="text-[10px] bg-background/60">
                {meta.label}
              </Badge>
              <Badge variant="outline" className="text-[10px] bg-background/60">
                {score}/100
              </Badge>
            </div>

            <div className="mt-3 h-2 rounded-full bg-background/70 overflow-hidden" aria-label={`Riesgo ${score} de 100`}>
              <div className={cn('h-full rounded-full', meta.bar)} style={{ width: `${score}%` }} />
            </div>

            {ethics.lines.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {ethics.lines.map((line) => (
                  <Badge key={line} variant="outline" className="text-[10px] bg-background/60">
                    {LINE_LABEL[line]}
                  </Badge>
                ))}
              </div>
            )}

            {ethics.flags.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {ethics.flags.slice(0, 3).map((flag) => (
                  <p key={`${flag.category}-${flag.evidence.join('|')}`} className="text-[12px] leading-relaxed text-foreground/85">
                    <span className="font-medium">{flag.label}:</span> {flag.evidence.length > 0 ? `"${flag.evidence.join('", "')}"` : flag.reason}
                  </p>
                ))}
              </div>
            )}

            {ethics.whyItMatters && (
              <p className="mt-3 text-[12px] leading-relaxed text-foreground/80">
                <span className="font-medium">Sustento:</span> {ethics.whyItMatters}
              </p>
            )}

            {ethics.safeAggressiveReframe && (
              <div className="mt-3 rounded-md border border-current/15 bg-background/60 p-2.5">
                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.07em] font-sans">
                  <ShieldAlert size={13} strokeWidth={1.75} aria-hidden="true" />
                  Version segura/agresiva
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-foreground/90">{ethics.safeAggressiveReframe}</p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
