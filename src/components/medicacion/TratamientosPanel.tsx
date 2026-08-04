// SIR V2 — Panel de TRATAMIENTOS (recetas) en /medicacion.
//
// ═══ POR QUÉ ═════════════════════════════════════════════════════════════════
//
// Aaron, 3-ago-2026: *"ahí debería aparecer todas las medicinas que tome en algún
// momento… ordenado con fecha y hora… y a raíz de qué"*.
//
// La página tenía botones de "tomé X" y un gráfico de 14 días, pero nada respondía
// **por qué** toma algo ni **cuánto le falta**. Este panel es esa respuesta: el motivo,
// quién lo recetó, la indicación LITERAL del médico y el progreso del curso.
//
// Se pinta el conteo aunque el curso ya haya terminado: el histórico es el objetivo,
// no solo lo activo.
'use client'

import { useCallback, useEffect, useState } from 'react'
import { Pill, Stethoscope, CalendarDays, AlertCircle } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ApiErrorNotice } from '@/components/ui/api-error-notice'
import type { ApiError } from '@/lib/api/errors'

interface ItemAPI {
  itemId: string
  medName: string
  dose: string | null
  esperadas: number | null
  tomadas: number
  esperadasHoy: number | null
  atrasadas: number | null
  diaActual: number | null
  terminado: boolean
  indication: string | null
  everyHours: number | null
  durationDays: number | null
}
interface PrescAPI {
  id: string
  reason: string | null
  diagnosis: string | null
  prescribedBy: string | null
  provider: string | null
  source: string
  startedOn: string
  endsOn: string | null
  status: string
  note: string | null
  items: ItemAPI[]
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic']
function fechaCorta(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd
  return `${ymd.slice(8, 10)}-${MESES[Number(ymd.slice(5, 7)) - 1]}-${ymd.slice(2, 4)}`
}

/** "1 cada 24 h por 7 días" a partir de la pauta estructurada. */
function pauta(i: ItemAPI): string {
  const partes: string[] = []
  if (i.everyHours) partes.push(`cada ${i.everyHours} h`)
  if (i.durationDays) partes.push(`por ${i.durationDays} días`)
  return partes.join(' · ')
}

const ESTADO: Record<string, { label: string; clase: string }> = {
  activa: { label: 'En curso', clase: 'border-ok/40 text-ok' },
  completada: { label: 'Terminada', clase: 'text-muted-foreground' },
  suspendida: { label: 'Suspendida', clase: 'border-bad/40 text-bad' },
}

export function TratamientosPanel() {
  const [data, setData] = useState<PrescAPI[] | null>(null)
  const [error, setError] = useState<ApiError | null>(null)

  const cargar = useCallback(async () => {
    setError(null)
    try {
      const r = await fetch('/api/meds/prescriptions', { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) {
        // Se muestra el error en vez de un panel vacío: un "no tienes tratamientos"
        // falso es peor que decir que la consulta falló.
        setError({ message: j?.error ?? `HTTP ${r.status}`, detail: j?.detail, status: r.status })
        return
      }
      setData(j.prescriptions ?? [])
    } catch (e) {
      // status 0 = no hubo respuesta HTTP (red caída), distinto de un error del server.
      setError({ message: 'No se pudo conectar', detail: e instanceof Error ? e.message : undefined, status: 0 })
    }
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  if (error) {
    return (
      <Card className="shadow-none mb-4">
        <CardContent className="p-4">
          <ApiErrorNotice error={error} title="No se pudieron leer tus tratamientos">
            <Button variant="outline" size="sm" className="mt-2 min-h-11" onClick={() => void cargar()}>
              Reintentar
            </Button>
          </ApiErrorNotice>
        </CardContent>
      </Card>
    )
  }
  if (!data || data.length === 0) return null

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-1">
          <Stethoscope size={16} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-tight">Tus tratamientos</h2>
        </div>
        <p className="mb-4 text-xs text-muted-foreground leading-relaxed">
          Qué tomas, desde cuándo y <span className="text-foreground/80">a raíz de qué</span>. La indicación es la
          del médico, textual.
        </p>

        <div className="space-y-4">
          {data.map((p) => {
            const est = ESTADO[p.status] ?? ESTADO.activa
            return (
              <div key={p.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <Badge variant="outline" className={`text-[11px] ${est.clase}`}>{est.label}</Badge>
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <CalendarDays size={11} />
                    {fechaCorta(p.startedOn)}{p.endsOn ? ` → ${fechaCorta(p.endsOn)}` : ' · sin fin definido'}
                  </span>
                </div>

                {p.reason && <p className="text-sm text-foreground/90 leading-snug mb-1">{p.reason}</p>}
                {(p.prescribedBy || p.provider) && (
                  <p className="text-[11px] text-muted-foreground mb-2">
                    {[p.prescribedBy, p.provider].filter(Boolean).join(' · ')}
                  </p>
                )}

                <div className="space-y-2">
                  {p.items.map((i) => (
                    <div key={i.itemId} className="border-t border-border/40 pt-2">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                          <Pill size={13} className="text-muted-foreground" />
                          {i.medName}
                        </span>
                        {i.dose && <span className="text-xs text-muted-foreground">{i.dose}</span>}
                        {pauta(i) && <span className="text-[11px] text-muted-foreground/80">{pauta(i)}</span>}
                      </div>

                      {i.indication && (
                        <p className="mt-0.5 text-[11px] italic text-muted-foreground/90">«{i.indication}»</p>
                      )}

                      {/* El conteo. `esperadas` null = pauta crónica sin duración: se
                          muestra lo tomado y no se inventa un total. */}
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                        <span className="text-muted-foreground">
                          {i.esperadas !== null
                            ? <>llevas <span className="text-foreground font-medium">{i.tomadas} de {i.esperadas}</span></>
                            : <>llevas <span className="text-foreground font-medium">{i.tomadas}</span> tomas registradas</>}
                        </span>
                        {i.diaActual !== null && !i.terminado && (
                          <span className="text-muted-foreground/70">
                            día {i.diaActual}{i.durationDays ? ` de ${i.durationDays}` : ''}
                          </span>
                        )}
                        {i.atrasadas !== null && i.atrasadas > 0 && (
                          <span className="inline-flex items-center gap-1 text-bad">
                            <AlertCircle size={11} />
                            {i.atrasadas === 1 ? 'falta 1' : `faltan ${i.atrasadas}`}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {p.note && (
                  <p className="mt-2 border-t border-border/40 pt-2 text-[11px] text-muted-foreground leading-snug">
                    {p.note}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
