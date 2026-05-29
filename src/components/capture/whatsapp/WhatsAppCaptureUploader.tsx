'use client'
// SIR V2 — Step 1: subir/elegir screenshot de WhatsApp + toggle Nivel C.
// File picker + drag&drop. Toggle persistido en localStorage. Sin deps.

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { Upload, ImageIcon, Sparkles } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { getReflection, setReflection } from '@/lib/capture/whatsapp/reflection'
import { cn } from '@/lib/utils'

const MAX_FILE_BYTES = 10 * 1024 * 1024

interface WhatsAppCaptureUploaderProps {
  onFile: (file: File, reflection: boolean) => void
  disabled?: boolean
}

export function WhatsAppCaptureUploader({ onFile, disabled }: WhatsAppCaptureUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Toggle hidratado al montar para evitar mismatch SSR/CSR.
  const [reflection, setReflectionState] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setReflectionState(getReflection())
    setHydrated(true)
  }, [])

  function handleReflectionChange(next: boolean) {
    setReflectionState(next)
    setReflection(next)
  }

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
    onFile(file, reflection)
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
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
      <CardContent className="p-4 sm:p-6 space-y-4">
        {/* Toggle Nivel C */}
        <div className="flex items-start gap-3 p-3 border border-border rounded-lg bg-muted/30">
          <Sparkles
            size={16}
            strokeWidth={1.75}
            className="text-primary mt-0.5 flex-shrink-0"
            aria-hidden="true"
          />
          <div className="flex-1 min-w-0">
            <Label
              htmlFor="reflection-toggle"
              className="flex items-center gap-2 cursor-pointer text-sm font-medium"
            >
              <input
                id="reflection-toggle"
                type="checkbox"
                checked={hydrated && reflection}
                disabled={disabled || !hydrated}
                onChange={(e) => handleReflectionChange(e.target.checked)}
                className="rounded border-border accent-primary"
              />
              Pedir preguntas reflexivas
            </Label>
            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
              Claude genera 3 preguntas observacionales sobre la conversación.
              Costo extra ~$0.005. Default OFF.
            </p>
          </div>
        </div>

        {/* Dropzone */}
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
          aria-label="Seleccionar screenshot de WhatsApp"
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
                Arrastrá un screenshot o tocá para elegir
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
          <div className="text-xs text-red-400 text-center" role="alert">
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
