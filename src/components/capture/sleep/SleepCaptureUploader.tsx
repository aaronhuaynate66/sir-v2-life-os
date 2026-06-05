'use client'
// SIR V2 — Subir/elegir imagen del panel de sueño. File picker + drag&drop.

import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { Upload, ImageIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB pre-compresión

interface SleepCaptureUploaderProps {
  onFile: (file: File) => void
  disabled?: boolean
}

export function SleepCaptureUploader({ onFile, disabled }: SleepCaptureUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleFile(file: File) {
    setError(null)
    if (!file.type.startsWith('image/')) {
      setError('El archivo no es una imagen.')
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      setError('La imagen es demasiado grande (máx 10 MB).')
      return
    }
    onFile(file)
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = '' // permite re-seleccionar el mismo archivo
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    if (disabled) return
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    if (!disabled) setDragging(true)
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
  }

  return (
    <Card className="shadow-none">
      <CardContent className="p-4 sm:p-6">
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={cn(
            'border-2 border-dashed rounded-lg p-8 sm:p-12 text-center transition-colors cursor-pointer',
            dragging ? 'border-primary bg-primary/5' : 'border-border bg-muted/30 hover:border-primary/50',
            disabled && 'opacity-50 cursor-not-allowed',
          )}
          onClick={() => !disabled && inputRef.current?.click()}
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label="Seleccionar imagen del panel de sueño"
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
              e.preventDefault()
              inputRef.current?.click()
            }
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            onChange={handleInputChange}
            disabled={disabled}
            className="hidden"
          />
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Upload size={20} strokeWidth={1.75} className="text-primary" aria-hidden="true" />
            </div>
            <div>
              <div className="text-sm font-medium text-foreground">
                Arrastrá una foto o tocá para elegir
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Acepta JPG, PNG, WebP (máx 10 MB)
              </div>
            </div>
            <Button type="button" variant="outline" size="sm" disabled={disabled} className="mt-2">
              <ImageIcon size={14} strokeWidth={1.75} className="mr-1.5" />
              Elegir archivo
            </Button>
          </div>
        </div>

        {error && (
          <div className="mt-3 text-xs text-bad text-center" role="alert">
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
