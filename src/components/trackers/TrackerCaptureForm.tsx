'use client'
// SIR V2 — TrackerCaptureForm: ingesta de puntos a un tracker.
//   - MULTI-PANTALLAZO: subir varias imágenes a la vez → Vision por imagen
//     (concurrencia 3) → una lectura {valor, fecha} por captura.
//   - TEXTO PEGADO: parser puro (sin Vision), una lectura.
// Las lecturas se consolidan (buildPoints, dedup por fecha) y se agregan a la
// serie vía el store (addPoints, que recalcula el último valor del tracker).

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { ImagePlus, ClipboardPaste, Loader2, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { SectionTitle } from '@/components/ui/section-title'
import { useTrackerStore } from '@/stores/useTrackerStore'
import { ingestImages, ingestText } from '@/lib/trackers/extract/client'
import { buildPoints } from '@/lib/trackers/points'
import { formatTrackerValue } from '@/lib/trackers/evaluate'
import type { Tracker } from '@/types'
import { cn } from '@/lib/utils'

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export interface TrackerCaptureFormProps {
  tracker: Tracker
  className?: string
}

export function TrackerCaptureForm({ tracker, className }: TrackerCaptureFormProps) {
  const addPoints = useTrackerStore((s) => s.addPoints)
  const inputRef = useRef<HTMLInputElement>(null)

  const [files, setFiles] = useState<File[]>([])
  const [text, setText] = useState('')
  const [fallbackDate, setFallbackDate] = useState(todayIso())
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith('image/'))
    if (picked.length > 0) setFiles((prev) => [...prev, ...picked])
    if (inputRef.current) inputRef.current.value = ''
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  const hint = { label: tracker.label, unit: tracker.unit }

  async function processImages() {
    if (files.length === 0) return
    setBusy(true)
    setProgress({ done: 0, total: files.length })
    try {
      const { readings, skipped } = await ingestImages(files, hint, fallbackDate, (done, total) =>
        setProgress({ done, total }),
      )
      if (readings.length === 0) {
        toast.error('No se leyó ningún valor', {
          description: 'Ninguna captura tenía un número legible. Probá con texto pegado.',
        })
        return
      }
      const pts = buildPoints(tracker.id, readings, `pt_${Date.now()}`)
      addPoints(tracker.id, pts)
      setFiles([])
      toast.success(`${pts.length} punto(s) agregado(s)`, {
        description: skipped > 0 ? `${skipped} captura(s) sin valor legible se omitieron.` : undefined,
      })
    } catch (e) {
      toast.error('Falló la extracción', { description: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  function processText() {
    const reading = ingestText(text, fallbackDate)
    if (!reading) {
      toast.error('No se detectó un valor', { description: 'Pegá un texto con un número (ej. "PEN 5,075").' })
      return
    }
    const pts = buildPoints(tracker.id, [reading], `pt_${Date.now()}`)
    addPoints(tracker.id, pts)
    setText('')
    toast.success('Punto agregado', {
      description: `${formatTrackerValue(reading.value, tracker.unit)} · ${reading.date}`,
    })
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div>
        <SectionTitle icon={ImagePlus} label="Subir capturas" />
        <p className="text-xs text-muted-foreground mb-2">
          Varias a la vez (ej. el mail de Google Flights). Una llamada de visión por imagen.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={onPick}
          disabled={busy}
          className="block w-full text-xs file:mr-3 file:rounded-md file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-xs file:text-foreground hover:file:border-border-strong"
        />
        {files.length > 0 && (
          <ul className="mt-2 space-y-1">
            {files.map((f, i) => (
              <li key={`${f.name}:${i}`} className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="truncate flex-1">{f.name}</span>
                {!busy && (
                  <button onClick={() => removeFile(i)} aria-label="Quitar" className="hover:text-bad">
                    <X size={13} strokeWidth={1.75} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-end">
        <label className="text-xs text-muted-foreground">
          Fecha si falta en la captura
          <Input type="date" value={fallbackDate} onChange={(e) => setFallbackDate(e.target.value)} className="mt-1" />
        </label>
        <Button onClick={processImages} disabled={busy || files.length === 0} variant="outline" size="sm">
          {busy ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              {progress ? `${progress.done}/${progress.total}` : 'Procesando'}
            </>
          ) : (
            <>Extraer de {files.length || ''} imagen(es)</>
          )}
        </Button>
      </div>

      <div className="border-t border-border pt-3">
        <SectionTitle icon={ClipboardPaste} label="O pegar texto" />
        <Textarea
          placeholder='Ej. "Lima → Dammam ida/vuelta desde PEN 5,075 · sale 6 jul 2026"'
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          className="mt-2"
          disabled={busy}
        />
        <Button onClick={processText} disabled={busy || !text.trim()} variant="outline" size="sm" className="mt-2">
          Agregar punto desde texto
        </Button>
      </div>
    </div>
  )
}
