'use client'
// SIR V2 — "Antes de contactar": la cabecera discreta que te deja listo para
// escribirle a la persona, ensamblada de señales que YA existen (sin IA, sin
// inventar). Se monta JUSTO ARRIBA de la franja de resumen (ResumenPersona) y la
// COMPLEMENTA: el strip cubre estado/score/próxima fecha/última interacción; acá
// agregamos lo que falta para el "momento justo":
//
//   - ACTIVIDAD RECIENTE: lo último concreto que pasó (tags de las memorias
//     derivadas: "comercial, jhodaal · hace 4d"). Determinístico (buildContactBrief).
//   - NOTAS PRIVADAS: si la persona tiene private_notes (person_sensitive_data),
//     las mostramos acá DISCRETAMENTE, verbatim, con candado. Es el único momento
//     en que tiene sentido recordártelas.
//
// PRIVACIDAD CRÍTICA: las notas privadas se leen client-side (getSensitiveData)
// y se renderizan verbatim. NUNCA entran a un prompt de IA — y esta superficie es
// 100% client-side + determinística, así que no hay payload de IA en absoluto. El
// ensamblado (buildContactBrief) ni siquiera recibe las notas: su única entrada
// son las memorias (datos públicos). Ver contactBrief.test.ts.
//
// MOUNT-SAFE (fix #418): la actividad reciente depende de "ahora" (ventana de
// recencia, tiempo relativo). Render nada en server + primer render cliente; el
// contenido real se computa tras montar. Degradá con gracia: sin actividad ni
// notas, no renderiza nada (no abruma con placeholders vacíos).

import { useEffect, useMemo, useState } from 'react'
import { Eye, Lock, ChevronDown, Activity } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useMounted } from '@/hooks/useMounted'
import { cn } from '@/lib/utils'
import { buildContactBrief } from '@/lib/people/contactBrief'
import { getSensitiveData } from '@/lib/person-sensitive/client'
import type { Memory } from '@/types'

export interface AntesDeContactarProps {
  personId: string
  /** Memorias de la persona (ya scoped + is_obsolete=false). Datos públicos:
   *  son la única fuente de la actividad reciente. */
  memories: Memory[]
}

export function AntesDeContactar({ personId, memories }: AntesDeContactarProps) {
  const mounted = useMounted()
  const [open, setOpen] = useState(true)
  // undefined = aún cargando; null/'' = sin notas; string = nota privada presente.
  const [privateNotes, setPrivateNotes] = useState<string | null | undefined>(undefined)

  // Carga lazy y tolerante de las notas privadas (RLS server-side). Si la tabla
  // o la columna aún no existen en prod, getSensitiveData devuelve {} → sin notas.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const d = await getSensitiveData(personId)
        if (!cancelled) setPrivateNotes(d.privateNotes ?? null)
      } catch {
        if (!cancelled) setPrivateNotes(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [personId])

  const brief = useMemo(
    () => (mounted ? buildContactBrief({ memories }, new Date()) : null),
    [mounted, memories],
  )

  // Pre-montaje: nada (server + primer render cliente coinciden → sin mismatch).
  if (!mounted || !brief) return null

  const hasActivity = brief.recentActivity.length > 0
  const notes = privateNotes?.trim()
  const hasNotes = !!notes

  // Degradá con gracia: si no hay nada que aportar por encima del strip, no
  // renderices la sección (evita ruido). Mientras las notas cargan, si tampoco
  // hay actividad, esperamos (no mostramos un cascarón vacío).
  if (!hasActivity && !hasNotes) return null

  return (
    <Card className="shadow-none mb-4 border-brand/15">
      <CardContent className="p-4 sm:p-5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-2 group"
          aria-expanded={open}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Eye size={13} strokeWidth={1.75} className="text-brand/70 shrink-0" aria-hidden="true" />
            <span className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">
              Antes de contactar
            </span>
            {!open && (
              <span className="text-[11px] text-muted-foreground truncate">
                · {[hasActivity && 'actividad reciente', hasNotes && 'nota privada'].filter(Boolean).join(' · ')}
              </span>
            )}
          </div>
          <ChevronDown
            size={16}
            strokeWidth={1.75}
            className={cn(
              'text-muted-foreground/60 transition-transform group-hover:text-foreground shrink-0',
              open && 'rotate-180',
            )}
            aria-hidden="true"
          />
        </button>

        {open && (
          <div className="mt-3 space-y-3">
            {/* Actividad reciente: lo último concreto que pasó. */}
            {hasActivity && (
              <div className="space-y-1.5">
                {brief.recentActivity.map((sig, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <Activity
                      size={13}
                      strokeWidth={1.75}
                      className="text-text-tertiary mt-0.5 shrink-0"
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
                      {sig.tags.length > 0 ? (
                        <span className="flex flex-wrap gap-1">
                          {sig.tags.map((t) => (
                            <Badge key={t} variant="outline" className="text-[10px] font-normal">
                              {t}
                            </Badge>
                          ))}
                        </span>
                      ) : (
                        <span className="text-foreground italic">{sig.snippet}</span>
                      )}
                      <span className="text-[11px] text-muted-foreground">· {sig.relative}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Notas privadas: verbatim, discretas. El "momento justo" para
                recordártelas. NUNCA viajan a IA (se leen client-side aparte). */}
            {hasNotes && (
              <div className="rounded-md border border-warn/20 bg-warn-soft p-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Lock size={12} strokeWidth={1.75} className="text-warn/80 shrink-0" aria-hidden="true" />
                  <span className="text-[10px] uppercase tracking-[0.06em] text-warn/80">
                    Notas privadas
                  </span>
                  <span className="text-[10px] text-muted-foreground/80">· solo vos lo ves · nunca a IA</span>
                </div>
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{notes}</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
