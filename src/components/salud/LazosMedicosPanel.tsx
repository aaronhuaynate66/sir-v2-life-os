// SIR V2 — Lazos médicos abiertos, en la pantalla de Salud.
//
// ═══ POR QUÉ ═════════════════════════════════════════════════════════════════
//
// Aaron, 4-ago-2026: *"conversamos bastante pero nada quedó tangibilizado. Sobre
// todo para darle seguimiento, que es lo que más me preocupa"*. Y después,
// buscando dónde había quedado cada cosa: *"ya perdí el rastro de todo"*.
//
// Lo médico estaba partido en tres pantallas: `/medicacion` tenía las recetas,
// `/objetivos` tenía el expediente con el cruce de exámenes, y `/salud` tenía los
// exámenes y los patrones. Tres sitios para una sola pregunta — "¿cómo voy?".
//
// Este panel es la pieza que faltaba acá: QUÉ HILO ESTÁ ABIERTO, con su fecha y
// con el camino al objetivo donde vive su expediente.
//
// ═══ Y POR QUÉ TRAE SU PROPIA DATA ═══════════════════════════════════════════
//
// La primera versión leía `useGoalStore` + `useObjectiveStepStore`, que es el
// patrón de casi toda la app. Al verificarlo con el navegador NO SE VEÍA: en una
// sesión sin `localStorage` previo esos stores están vacíos y el panel devolvía
// null sin que nada fallara. Habría funcionado solo en un navegador que ya hubiera
// abierto la app antes. Ahora pide `/api/salud/lazos`, igual que
// `TratamientosPanel`.
'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { HeartPulse, ArrowRight, AlertTriangle } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'

interface Paso { id: string; title: string; targetDate: string | null; dueTime: string | null }
interface Lazo { id: string; title: string; targetDate: string | null; pasos: Paso[] }

/** Días entre hoy y una fecha 'YYYY-MM-DD'. */
function diasHasta(fecha: string, hoyYmd: string): number {
  const a = Date.parse(`${fecha}T12:00:00Z`)
  const b = Date.parse(`${hoyYmd}T12:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN
  return Math.round((a - b) / 86_400_000)
}

function cuando(dias: number): { txt: string; cls: string } {
  if (Number.isNaN(dias)) return { txt: 'sin fecha', cls: 'text-muted-foreground' }
  if (dias < 0) return { txt: `vencido hace ${Math.abs(dias)} d`, cls: 'text-bad' }
  if (dias === 0) return { txt: 'hoy', cls: 'text-bad' }
  if (dias === 1) return { txt: 'mañana', cls: 'text-warn' }
  if (dias <= 7) return { txt: `en ${dias} d`, cls: 'text-warn' }
  return { txt: `en ${dias} d`, cls: 'text-muted-foreground' }
}

export function LazosMedicosPanel() {
  const [lazos, setLazos] = useState<Lazo[] | null>(null)

  const cargar = useCallback(async () => {
    try {
      const r = await fetch('/api/salud/lazos')
      if (!r.ok) { setLazos([]); return }
      const j = (await r.json()) as { lazos?: Lazo[] }
      setLazos(j.lazos ?? [])
    } catch { setLazos([]) }
  }, [])
  useEffect(() => { void cargar() }, [cargar])

  // La hora de Lima con offset explícito: `toISOString()` daría UTC, y entre las
  // 19:00 y la medianoche eso corre el día entero. Es el error que ya costó decir
  // que una reunión había pasado.
  const hoyYmd = new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10)

  if (!lazos || lazos.length === 0) return null

  const vencidos = lazos
    .flatMap((l) => l.pasos)
    .filter((s) => s.targetDate && diasHasta(s.targetDate, hoyYmd) < 0).length

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <HeartPulse size={17} className="text-brand" aria-hidden="true" />
            {/* Nivel SECCIÓN: es de lo poco que uno viene a ver acá. Antes era una
                etiqueta gris de 11 px, idéntica a las otras veinte de la pantalla. */}
            <h2 className="text-base font-semibold tracking-tight">Lazos médicos abiertos</h2>
          </div>
          {vencidos > 0 && (
            <span className="flex items-center gap-1 text-[12px] text-bad">
              <AlertTriangle size={13} aria-hidden="true" />
              {vencidos} vencido{vencidos > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {lazos.map((l) => (
          <div key={l.id} className="mb-4 last:mb-0">
            <Link
              href={`/objetivos/${l.id}`}
              className="group inline-flex items-center gap-1.5 text-sm font-medium hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {l.title}
              <ArrowRight size={13} className="opacity-50 group-hover:opacity-100" aria-hidden="true" />
            </Link>
            {/* Se dice DÓNDE está el expediente, en vez de dejar que se busque de
                pantalla en pantalla — que es de lo que él se quejó. */}
            <p className="text-[12px] text-muted-foreground mt-0.5">
              El expediente y los documentos están en la ficha del objetivo.
            </p>
            <ul className="mt-2 space-y-1.5">
              {l.pasos.map((s) => {
                const c = s.targetDate ? cuando(diasHasta(s.targetDate, hoyYmd)) : cuando(NaN)
                return (
                  <li key={s.id} className="flex items-start justify-between gap-3 text-[13px]">
                    <span className="text-foreground">{s.title}</span>
                    <span className={`shrink-0 tabular-nums text-[12px] ${c.cls}`}>
                      {c.txt}{s.dueTime ? ` · ${String(s.dueTime).slice(0, 5)}` : ''}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
