'use client'
// SIR V2 — Historial médico / Chequeos (#salud, mig 0149).
//
// Registro de chequeos médicos anuales (aparte de la serie diaria): resumen,
// hallazgos CIE10, valores clave (resaltando los fuera de rango) y link al PDF
// original. Client-side + fail-soft: si la tabla aún no propagó, no renderiza.

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ClipboardList, FileText, ChevronDown, AlertTriangle, CheckCircle2, TrendingUp, TrendingDown, Repeat } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { outOfRangeCount, type HealthExam, type ExamValue } from '@/lib/health-exams/types'
import { buildLabTrends } from '@/lib/health-exams/trend'
import { labPatterns } from '@/lib/health-exams/patterns'

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
function fmtDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? ''} ${m[1]}`
}

export function ChequeosPanel() {
  const [exams, setExams] = useState<HealthExam[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [view, setView] = useState<'exams' | 'trend'>('exams')

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const r = await fetch('/api/salud/exams')
        const j = (await r.json()) as { exams?: HealthExam[] }
        if (alive) {
          const list = Array.isArray(j.exams) ? j.exams : []
          setExams(list)
          if (list.length > 0) setOpenId(list[0].id) // el más reciente abierto
        }
      } catch {
        if (alive) setExams([])
      }
    })()
    return () => { alive = false }
  }, [])

  const toggle = useCallback((id: string) => setOpenId((cur) => (cur === id ? null : id)), [])

  // Pre-carga o sin chequeos → no metemos un cascarón vacío en /salud.
  if (!exams || exams.length === 0) return null
  const patterns = labPatterns(exams)

  return (
    <Card className="shadow-none">
      <CardContent className="p-4 sm:p-6 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <ClipboardList size={14} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
            <span className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Historial médico · chequeos</span>
            <Badge variant="outline" className="text-[10px] font-mono">{exams.length}</Badge>
          </div>
          {exams.length >= 2 && (
            <div className="inline-flex rounded-full border border-border p-0.5 text-[11px]">
              <button type="button" onClick={() => setView('exams')} className={cn('rounded-full px-2.5 py-0.5 transition-colors', view === 'exams' ? 'bg-accent/15 text-foreground' : 'text-muted-foreground')}>Exámenes</button>
              <button type="button" onClick={() => setView('trend')} className={cn('rounded-full px-2.5 py-0.5 transition-colors', view === 'trend' ? 'bg-accent/15 text-foreground' : 'text-muted-foreground')}>Tendencia</button>
            </div>
          )}
        </div>

        {patterns.length > 0 && (
          <div className="space-y-1.5">
            {patterns.map((p, i) => (
              <div key={i} className={cn('flex items-start gap-2 rounded-md border p-2.5 text-[12.5px] leading-snug',
                p.severity === 'alert' ? 'border-warn/30 bg-warn-soft/40 text-foreground' : 'border-accent/25 bg-accent/5 text-muted-foreground')}>
                {p.direction === 'down'
                  ? <TrendingDown size={13} strokeWidth={1.75} className={cn('mt-0.5 shrink-0', p.severity === 'alert' ? 'text-warn' : 'text-accent')} aria-hidden="true" />
                  : <TrendingUp size={13} strokeWidth={1.75} className={cn('mt-0.5 shrink-0', p.severity === 'alert' ? 'text-warn' : 'text-accent')} aria-hidden="true" />}
                <span>{p.message}</span>
              </div>
            ))}
          </div>
        )}

        {view === 'trend' ? <TrendTable exams={exams} /> : (
        <ul className="space-y-2.5">
          {exams.map((ex) => {
            const open = openId === ex.id
            const flagged = outOfRangeCount(ex.values)
            return (
              <li key={ex.id} className="rounded-lg border border-border/60 bg-muted/10">
                <button
                  type="button"
                  onClick={() => toggle(ex.id)}
                  aria-expanded={open}
                  className="flex w-full items-center justify-between gap-2 px-3.5 py-3 text-left"
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">{ex.title}</span>
                      {flagged > 0 ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-warn">
                          <AlertTriangle size={11} strokeWidth={1.75} /> {flagged} fuera de rango
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-ok">
                          <CheckCircle2 size={11} strokeWidth={1.75} /> todo en rango
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground font-mono">
                      {fmtDate(ex.examDate)}{ex.provider ? ` · ${ex.provider}` : ''}
                    </span>
                  </span>
                  <ChevronDown size={16} strokeWidth={1.75} className={cn('shrink-0 text-muted-foreground/60 transition-transform', open && 'rotate-180')} aria-hidden="true" />
                </button>

                {open && (
                  <div className="space-y-3 px-3.5 pb-3.5">
                    {ex.summary && <p className="text-sm text-muted-foreground leading-relaxed">{ex.summary}</p>}

                    {ex.findings.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[10px] uppercase tracking-[0.06em] text-text-tertiary">Hallazgos</div>
                        <div className="flex flex-wrap gap-1.5">
                          {ex.findings.map((f, i) => (
                            <Badge key={i} variant="outline" className="text-[11px] font-normal">
                              <span className="font-mono opacity-60 mr-1">{f.code}</span>{f.label}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {ex.values.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[10px] uppercase tracking-[0.06em] text-text-tertiary">Valores</div>
                        <ul className="space-y-1">
                          {ex.values.map((v, i) => <ValueRow key={i} v={v} />)}
                        </ul>
                      </div>
                    )}

                    {ex.recommendations.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[10px] uppercase tracking-[0.06em] text-text-tertiary">Recomendaciones</div>
                        <ul className="space-y-1">
                          {ex.recommendations.map((r, i) => (
                            <li key={i} className="flex gap-2 text-[13px] text-muted-foreground leading-snug">
                              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" aria-hidden="true" />
                              <span>{r}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {ex.pdfUrl && (
                      <a
                        href={ex.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-[12px] text-accent hover:underline"
                      >
                        <FileText size={12} strokeWidth={1.75} /> Ver informe original (PDF)
                      </a>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
        )}
      </CardContent>
    </Card>
  )
}

function TrendTable({ exams }: { exams: HealthExam[] }) {
  const { dates, byCategory } = buildLabTrends(exams)
  const fmt = (iso: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
    return m ? `${m[3]}/${m[2]}` : iso
  }
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Cada valor a través de tus exámenes. <Repeat size={10} className="inline -mt-0.5" /> = tendencia consistente (3+ mediciones siempre en la misma dirección) — lo que vale la pena vigilar.
      </p>
      <div className="overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full min-w-[420px] text-[12.5px]">
          <thead>
            <tr className="bg-muted/20">
              <th className="text-left font-medium text-muted-foreground px-3 py-2">Analito</th>
              {dates.map((d) => <th key={d} className="text-right font-mono font-normal text-muted-foreground px-2.5 py-2 whitespace-nowrap">{fmt(d)}</th>)}
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {byCategory.map((cat) => (
              <FragmentCat key={cat.category} category={cat.category} span={dates.length + 2}>
                {cat.trends.map((t) => (
                  <tr key={t.name} className="border-t border-border/40">
                    <td className="px-3 py-1.5 text-foreground">
                      {t.name}
                      {t.unit && <span className="text-muted-foreground/60"> · {t.unit}</span>}
                      {t.range && <span className="block text-[10px] text-muted-foreground/50 font-mono">rango {t.range}</span>}
                    </td>
                    {t.points.map((p, i) => (
                      <td key={i} className={cn('px-2.5 py-1.5 text-right font-mono tabular-nums', !p ? 'text-muted-foreground/30' : p.flag === 'high' || p.flag === 'low' ? 'text-warn font-semibold' : 'text-foreground')}>
                        {p ? `${p.value}${p.flag === 'high' ? ' ↑' : p.flag === 'low' ? ' ↓' : ''}` : '·'}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right whitespace-nowrap">
                      {t.consistent && <Repeat size={12} className="inline text-accent" aria-label="tendencia consistente" />}
                      {t.direction === 'up' && <TrendingUp size={12} className="inline text-muted-foreground ml-0.5" aria-label="subiendo" />}
                      {t.direction === 'down' && <TrendingDown size={12} className="inline text-muted-foreground ml-0.5" aria-label="bajando" />}
                    </td>
                  </tr>
                ))}
              </FragmentCat>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function FragmentCat({ category, span, children }: { category: string; span: number; children: ReactNode }) {
  return (
    <>
      <tr><td colSpan={span} className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-[0.06em] text-accent font-semibold">{category}</td></tr>
      {children}
    </>
  )
}

function ValueRow({ v }: { v: ExamValue }) {
  const off = v.flag === 'high' || v.flag === 'low'
  return (
    <li className="flex items-baseline justify-between gap-3 text-[13px]">
      <span className="text-muted-foreground">{v.name}</span>
      <span className="flex items-baseline gap-2 font-mono tabular-nums">
        <span className={cn(off ? 'text-warn font-semibold' : 'text-foreground')}>
          {v.value}{v.unit ? ` ${v.unit}` : ''}
          {v.flag === 'high' ? ' ↑' : v.flag === 'low' ? ' ↓' : ''}
        </span>
        {v.range && <span className="text-[11px] text-muted-foreground/50">({v.range})</span>}
      </span>
    </li>
  )
}
