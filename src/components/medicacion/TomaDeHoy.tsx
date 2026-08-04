// SIR V2 — "¿Qué tomo AHORA y por qué?" — la respuesta antes del detalle.
//
// ═══ POR QUÉ ═════════════════════════════════════════════════════════════════
//
// Aaron, 4-ago-2026, después de entrar a `/salud` en producción: *"ha quedado
// horroroso, cero UX UI y orden, no se entiende para nada lo que tomo ni para qué
// ni por qué"*.
//
// Y la data estaba completa. Lo auditado ese día:
//
// · La HORA de la toma (`schedule`, "22:00") existe en la tabla desde #1087 y el
//   endpoint **nunca la seleccionaba**, así que la pantalla solo podía decir "cada
//   24 h". A las 21:55 no había una sola hora de reloj en pantalla.
// · El `diagnosis` ("G43.0 — Migraña sin aura") llegaba al navegador y no se
//   pintaba nunca.
// · Las recetas se ordenaban solo por fecha de inicio, así que una suspendida podía
//   salir antes que una activa, en una lista plana.
// · Los avisos de cruce entre medicamentos vivían como prosa de 11 px dentro de UNA
//   tarjeta — y el medicamento con el que chocan está en OTRA receta, sin nada que
//   las relacione.
//
// Este componente NO agrega una tarjeta más a una pantalla que ya tenía ~38: es lo
// que va ARRIBA, y responde en el orden en que se pregunta —
//   1. qué me toca y a qué hora
//   2. por qué lo tomo
//   3. cuánto me falta
//   4. qué choca con qué
// El detalle por receta queda debajo, en `TratamientosPanel`.
'use client'

import { AlertTriangle, Clock, Pill } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import {
  bloquesDeToma, aDemanda, porQueLoTomo, faltaHoy,
  type ItemDeToma, type AvisoDeCruce,
} from '@/lib/meds/tomaDeHoy'

export interface TomaDeHoyProps {
  items: ItemDeToma[]
  avisos: AvisoDeCruce[]
  /** HH:MM de Lima. Se inyecta para que el render sea puro de reloj. */
  ahora: string
}

export function TomaDeHoy({ items, avisos, ahora }: TomaDeHoyProps) {
  const bloques = bloquesDeToma(items, ahora)
  const demanda = aDemanda(items)
  if (bloques.length === 0 && demanda.length === 0 && avisos.length === 0) return null

  return (
    <Card className="border-brand/30">
      <CardContent className="p-4 space-y-4">
        {/* El único h2 de verdad de la pantalla médica: acá empieza la jerarquía que
            no existía (20 encabezados compartían la misma clase gris de 11 px). */}
        <div className="flex items-center gap-2">
          <Pill size={17} className="text-brand" aria-hidden="true" />
          <h2 className="text-base font-semibold tracking-tight">Tu medicación de hoy</h2>
        </div>

        {/* ── 1, 2 y 3: la hora, el por qué y lo que falta, por bloque ── */}
        {bloques.map((b) => (
          <div
            key={b.hora}
            className={`rounded-lg border p-3 ${
              b.proxima ? 'border-brand/50 bg-brand/[0.06]' : 'border-border/60'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5">
                <Clock size={14} className={b.proxima ? 'text-brand' : 'text-muted-foreground'} aria-hidden="true" />
                <span className={`text-sm font-semibold tabular-nums ${b.proxima ? 'text-brand' : ''}`}>
                  {b.hora}
                </span>
                <span className="text-[12px] text-muted-foreground">
                  {b.meds.length} {b.meds.length === 1 ? 'medicamento' : 'medicamentos'}
                </span>
              </div>
              {b.proxima && (
                <span className="text-[11px] font-semibold uppercase tracking-wide text-brand">La próxima</span>
              )}
              {!b.proxima && b.pasada && (
                <span className="text-[11px] text-muted-foreground">ya pasó</span>
              )}
            </div>
            <ul className="space-y-2">
              {b.meds.map((m) => {
                const pq = porQueLoTomo(m)
                const falta = faltaHoy(m)
                return (
                  <li key={m.itemId} className="text-[13.5px]">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-medium">
                        {m.medName}
                        {m.dose && <span className="text-muted-foreground font-normal"> {m.dose}</span>}
                      </span>
                      <span className={`shrink-0 text-[12px] ${falta ? 'text-warn' : 'text-ok'}`}>
                        {falta ? 'falta hoy' : 'registrada'}
                      </span>
                    </div>
                    {pq && <div className="text-[12.5px] text-muted-foreground leading-snug">{pq}</div>}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}

        {/* ── 4. LAS NOTAS, DESPUÉS Y CON SU NOMBRE REAL ──────────────────────
               La primera versión de esto ponía las notas ARRIBA, etiquetadas
               "Cruces a tener en cuenta". Verificado en el navegador: eran TRES
               párrafos de 300+ caracteres antes de llegar a la medicación, y la
               mitad no eran cruces de fármacos sino apuntes de procedencia del dato
               ("la fecha de inicio de esta fila es la de REGISTRO, no la del inicio
               real"). O sea: reproduje el muro de texto que este cambio venía a
               arreglar, y encima le puse una etiqueta que no era verdad.
               `note` es prosa libre con contenido mezclado. No se puede fingir que
               es una alerta estructurada: van después de la respuesta, con su nombre
               honesto, y recortadas con `line-clamp` para que se puedan barrer. */}
        {avisos.length > 0 && (
          <details className="rounded-lg border border-border/60">
            <summary className="flex cursor-pointer items-center gap-1.5 p-3 text-[12px] font-medium text-warn">
              <AlertTriangle size={13} aria-hidden="true" />
              Notas de tus recetas ({avisos.length}) — incluye cruces entre medicamentos
            </summary>
            <div className="space-y-2 border-t border-border/60 p-3">
              {avisos.map((a, i) => (
                <p key={i} className="text-[12.5px] text-foreground/85 leading-snug">
                  {a.receta && <span className="font-medium">{a.receta}: </span>}
                  {a.texto}
                </p>
              ))}
            </div>
          </details>
        )}

        {/* A demanda: sin hora inventada. Un rescate no tiene horario. */}
        {demanda.length > 0 && (
          <div className="rounded-lg border border-border/60 p-3">
            <div className="text-[12px] uppercase tracking-[0.07em] text-text-tertiary mb-2">
              A demanda · sin hora fija
            </div>
            <ul className="space-y-2">
              {demanda.map((m) => (
                <li key={m.itemId} className="text-[13.5px]">
                  <span className="font-medium">
                    {m.medName}
                    {m.dose && <span className="text-muted-foreground font-normal"> {m.dose}</span>}
                  </span>
                  {m.indication && (
                    <div className="text-[12.5px] text-muted-foreground leading-snug">{m.indication}</div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
