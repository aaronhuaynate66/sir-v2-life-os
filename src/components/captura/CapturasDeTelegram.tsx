'use client'

// SIR V2 — Las fotos que Aaron mandó por Telegram, ahora visibles.
//
// POR QUÉ, y es un error mío: el 2-ago arreglé que una foto que SIR no entiende
// ya no se descarte. Se guarda en el bucket y se crea la observación. Pero nadie
// leía esas filas — las salvé del vacío para meterlas en otro vacío.
//
// Este panel las muestra con su imagen y el texto que se les pudo extraer. Lo que
// importa no es solo verlas: es que las que quedaron SIN CLASIFICAR se distingan,
// porque son las que necesitan que él diga qué son.

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ImageIcon, AlertCircle } from 'lucide-react'

interface Captura {
  id: string
  captureType: string
  texto: string
  resumen: string
  needsReview: boolean
  capturedAt: string
  imagenUrl: string | null
}

const ETIQUETA: Record<string, string> = {
  scale: 'Báscula',
  sleep_panel: 'Sueño',
  heart_rate_panel: 'Frecuencia cardíaca',
  hrv_panel: 'VFC',
  dm_conversation: 'Conversación',
  manual_note: 'Documento o nota',
  unknown: 'Sin clasificar',
}

export function CapturasDeTelegram() {
  const [capturas, setCapturas] = useState<Captura[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch('/api/capturas-telegram')
        const j = await r.json()
        setCapturas(Array.isArray(j.capturas) ? j.capturas : [])
      } catch { /* se muestra vacío */ }
      setCargando(false)
    })()
  }, [])

  if (cargando || capturas.length === 0) return null
  const sinClasificar = capturas.filter((c) => c.needsReview).length

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-1">
          <ImageIcon size={13} className="text-text-tertiary" strokeWidth={1.75} />
          <span className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">
            Lo que mandaste por Telegram
          </span>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          {sinClasificar > 0
            ? `${capturas.length} capturas · ${sinClasificar} que no supe clasificar. Dime qué son y las anoto bien.`
            : `${capturas.length} capturas guardadas.`}
        </p>

        <div className="space-y-2">
          {capturas.map((c) => (
            <div key={c.id} className="flex gap-3 rounded-lg border border-border p-3">
              {c.imagenUrl && (
                <a href={c.imagenUrl} target="_blank" rel="noreferrer" className="shrink-0">
                  <Image
                    src={c.imagenUrl}
                    alt={c.resumen || 'Captura de Telegram'}
                    width={56}
                    height={56}
                    unoptimized
                    className="h-14 w-14 rounded object-cover border border-border"
                  />
                </a>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant={c.needsReview ? 'default' : 'outline'} className="text-[10px]">
                    {ETIQUETA[c.captureType] ?? c.captureType}
                  </Badge>
                  <span className="text-[10px] text-text-tertiary">
                    {String(c.capturedAt).slice(0, 10)}
                  </span>
                  {c.needsReview && (
                    <span className="flex items-center gap-1 text-[10px] text-warn">
                      <AlertCircle size={10} /> falta clasificar
                    </span>
                  )}
                </div>
                {c.resumen && (
                  <p className="mt-1 text-xs text-foreground">{c.resumen}</p>
                )}
                {c.texto && (
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                    {c.texto}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
