'use client'
// SIR V2 — Historial médico / Chequeos (#salud, mig 0149).
//
// Registro de chequeos médicos anuales (aparte de la serie diaria): resumen,
// hallazgos CIE10, valores clave (resaltando los fuera de rango) y link al PDF
// original. Client-side + fail-soft: si la tabla aún no propagó, no renderiza.

import { useCallback, useEffect, useState } from 'react'
import { ClipboardList, FileText, ChevronDown, AlertTriangle, CheckCircle2 } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { outOfRangeCount, type HealthExam, type ExamValue } from '@/lib/health-exams/types'

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
function fmtDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? ''} ${m[1]}`
}

export function ChequeosPanel() {
  const [exams, setExams] = useState<HealthExam[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

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

  return (
    <Card className="shadow-none">
      <CardContent className="p-4 sm:p-6 space-y-3">
        <div className="flex items-center gap-2">
          <ClipboardList size={14} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
          <span className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Historial médico · chequeos</span>
          <Badge variant="outline" className="text-[10px] font-mono">{exams.length}</Badge>
        </div>

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
      </CardContent>
    </Card>
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
