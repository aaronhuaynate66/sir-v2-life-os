'use client'

// SIR V2 — Panel de ENTREGABLES de una persona o de un objetivo.
//
// POR QUÉ: Aaron, 2-ago-2026, *"así solo acá no me sirve"*. SIR le armaba un
// informe o una cotización y terminaban en `docs/*.md`, donde él no entra. No
// había ninguna pantalla en la app que mostrara un documento.
//
// DECISIONES DE DISEÑO, y el porqué de cada una:
//
//  · **El cuerpo se muestra COMPLETO, sin `line-clamp`.** Es el error que hace
//    inútiles a los otros campos del sistema: `deals.notes` dice "dossier
//    completo" y la UI lo corta a 160 chars; `/memoria` recorta a 2 líneas sin
//    detalle. Un documento a medias no se puede usar. Va plegado por defecto y se
//    abre entero.
//  · **Copiar es la acción principal**, no editar. Lo que él hace con esto es
//    pegarlo en WhatsApp o en un correo.
//  · **La nota interna va separada y marcada.** El informe tiene contexto que NO
//    debe viajar al destinatario; si estuviera mezclado en el cuerpo, se manda
//    por accidente.
//  · **Marcar "enviado" es un botón**, porque un entregable listo y sin enviar es
//    un pendiente que el brief reclama. Sin ese botón, el reclamo no se apaga
//    nunca y se vuelve ruido.

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { FileText, Copy, Check, ChevronDown, ChevronRight, Send } from 'lucide-react'
import {
  ETIQUETA_TIPO, ETIQUETA_ESTADO, resumenDeCuerpo, diasSinEnviar,
  type Documento,
} from '@/lib/documentos/tipos'

interface Props {
  personId?: string
  objectiveId?: string
}

export function DocumentosPanel({ personId, objectiveId }: Props) {
  const [docs, setDocs] = useState<Documento[]>([])
  const [cargando, setCargando] = useState(true)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [copiado, setCopiado] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const qs = new URLSearchParams()
    if (personId) qs.set('personId', personId)
    if (objectiveId) qs.set('objectiveId', objectiveId)
    try {
      const r = await fetch(`/api/documents?${qs}`)
      const j = await r.json()
      setDocs(Array.isArray(j.documents) ? j.documents : [])
    } catch { /* se muestra vacío; no romper la ficha por esto */ }
    setCargando(false)
  }, [personId, objectiveId])

  useEffect(() => { void cargar() }, [cargar])

  const copiar = async (d: Documento) => {
    try {
      await navigator.clipboard.writeText(d.body)
      setCopiado(d.id)
      toast.success('Copiado — listo para pegar')
      setTimeout(() => setCopiado(null), 2000)
    } catch {
      toast.error('No pude copiarlo. Selecciónalo a mano.')
    }
  }

  const marcarEnviado = async (d: Documento) => {
    const r = await fetch('/api/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...d, status: 'enviado' }),
    })
    if (!r.ok) { toast.error('No pude marcarlo'); return }
    toast.success('Marcado como enviado')
    void cargar()
  }

  // Se auto-oculta si no hay nada: una tarjeta vacía en cada ficha es ruido.
  if (cargando || docs.length === 0) return null

  const hoy = new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10)

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-3">
          <FileText size={13} className="text-text-tertiary" strokeWidth={1.75} />
          <span className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">
            Entregables
          </span>
        </div>

        <div className="space-y-2">
          {docs.map((d) => {
            const esperando = diasSinEnviar(d, hoy)
            const open = abierto === d.id
            return (
              <div key={d.id} className="rounded-lg border border-border">
                <button
                  type="button"
                  onClick={() => setAbierto(open ? null : d.id)}
                  className="w-full flex items-start gap-2 p-3 text-left"
                  aria-expanded={open}
                >
                  {open
                    ? <ChevronDown size={14} className="mt-0.5 shrink-0 text-text-tertiary" />
                    : <ChevronRight size={14} className="mt-0.5 shrink-0 text-text-tertiary" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium text-foreground">{d.title}</span>
                      <Badge variant="outline" className="text-[10px]">{ETIQUETA_TIPO[d.kind]}</Badge>
                      <Badge
                        variant={d.status === 'enviado' ? 'outline' : 'default'}
                        className="text-[10px]"
                      >
                        {ETIQUETA_ESTADO[d.status]}
                      </Badge>
                      {esperando !== null && esperando >= 2 && (
                        <span className="text-[10px] text-warn">
                          esperando {esperando} d
                        </span>
                      )}
                    </div>
                    {!open && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {resumenDeCuerpo(d.body)}
                      </p>
                    )}
                  </div>
                </button>

                {open && (
                  <div className="px-3 pb-3">
                    {/* COMPLETO y con los saltos de línea respetados: un documento
                        recortado no se puede usar, que es lo que lo mataba antes. */}
                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap border-t border-border pt-3">
                      {d.body}
                    </p>

                    {d.internalNote && (
                      <div className="mt-3 rounded-md bg-muted/50 p-3">
                        <div className="text-[10px] uppercase tracking-[0.07em] text-text-tertiary mb-1">
                          Solo para ti — no va en el envío
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                          {d.internalNote}
                        </p>
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" onClick={() => void copiar(d)}>
                        {copiado === d.id
                          ? <><Check size={13} className="mr-1.5" /> Copiado</>
                          : <><Copy size={13} className="mr-1.5" /> Copiar para enviar</>}
                      </Button>
                      {d.status !== 'enviado' && (
                        <Button size="sm" variant="outline" onClick={() => void marcarEnviado(d)}>
                          <Send size={13} className="mr-1.5" /> Ya lo mandé
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
