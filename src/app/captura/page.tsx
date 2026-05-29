'use client'
// SIR V2 — /captura (Sesion 1 — test page del detector universal)
//
// Pagina minima para validar end-to-end que POST /api/capture funciona:
// file picker -> compresion -> detector Vision -> render del DetectorResult.
//
// NO consume tabla observations todavia (eso es Sesion 2).
// NO sube imagen a Storage todavia.
// NO llama extractor especifico todavia.
//
// Coexiste con /captura/whatsapp y /captura/bascula sin tocarlos.

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Camera, Loader2 } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { RouteSkeleton } from '@/components/skeletons/RouteSkeleton'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { detectCaptureType, DetectorError } from '@/lib/capture/detector/client'
import type { DetectResult } from '@/lib/capture/detector/client'

export default function CapturaIndexPage() {
  const hydrated = useHasHydrated()
  if (!hydrated) return <RouteSkeleton cards={1} />
  return <CapturaIndexContent />
}

function CapturaIndexContent() {
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<DetectResult | null>(null)
  const [error, setError] = useState<{ status: number; message: string; detail?: string } | null>(null)
  const [loading, setLoading] = useState(false)

  const onFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    setFile(f)
    setResult(null)
    setError(null)
  }, [])

  const onDetect = useCallback(async () => {
    if (!file) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const r = await detectCaptureType(file)
      setResult(r)
    } catch (e) {
      if (e instanceof DetectorError) {
        setError({ status: e.status, message: e.message, detail: e.detail })
      } else {
        const msg = e instanceof Error ? e.message : String(e)
        setError({ status: 0, message: msg })
      }
    } finally {
      setLoading(false)
    }
  }, [file])

  return (
    <AppShell>
      <Link
        href="/yo"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4"
      >
        <ArrowLeft size={13} strokeWidth={1.75} aria-hidden="true" />
        Volver a Self
      </Link>

      <header className="mb-6 sm:mb-8">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-sans mb-1">
          SIR V2 &mdash; Captura universal (Sesión 1 / test)
        </div>
        <div className="flex items-center gap-3">
          <Camera size={20} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Detector de captura</h1>
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground mt-2 max-w-2xl leading-relaxed">
          Subí cualquier screenshot. Claude Sonnet 4.5 identifica si es{' '}
          <span className="font-medium text-foreground">WhatsApp chat/info</span>,{' '}
          <span className="font-medium text-foreground">Instagram</span>,{' '}
          <span className="font-medium text-foreground">LinkedIn</span> o desconocido. Esta vista es
          un test del endpoint <code className="font-mono text-[11px]">POST /api/capture</code> —
          todavía no persiste nada.
        </p>
      </header>

      <Card className="shadow-none">
        <CardContent className="p-4 sm:p-6 space-y-4">
          <div>
            <label className="text-xs uppercase tracking-widest text-muted-foreground/70 font-sans block mb-2">
              Imagen
            </label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={onFile}
              disabled={loading}
              className="text-sm w-full file:mr-3 file:rounded file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-medium hover:file:bg-accent/10"
            />
            {file && (
              <div className="mt-2 text-xs text-muted-foreground font-mono">
                {file.name} · {(file.size / 1024).toFixed(0)} KB · {file.type}
              </div>
            )}
          </div>

          <div>
            <Button onClick={onDetect} disabled={!file || loading} size="sm">
              {loading ? (
                <>
                  <Loader2 size={14} className="mr-2 animate-spin" />
                  Detectando…
                </>
              ) : (
                'Detectar tipo'
              )}
            </Button>
          </div>

          {error && (
            <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-xs space-y-1">
              <div className="font-medium text-red-400">
                Error HTTP {error.status}: {error.message}
              </div>
              {error.detail && <div className="text-muted-foreground">{error.detail}</div>}
            </div>
          )}

          {result && (
            <div className="rounded-md border border-border bg-muted/20 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] font-mono uppercase tracking-wider">
                  Detectado
                </Badge>
                <span className="text-sm font-medium font-mono">{result.detected.type}</span>
                <Badge variant="secondary" className="text-[10px] font-mono">
                  conf. {result.detected.confidence}
                </Badge>
              </div>

              <div className="text-xs text-muted-foreground">
                <div>
                  <span className="font-medium text-foreground">Razonamiento:</span>{' '}
                  {result.detected.reasoning}
                </div>
                {result.detected.suggestedPersonName && (
                  <div className="mt-1">
                    <span className="font-medium text-foreground">Sugerencia persona:</span>{' '}
                    {result.detected.suggestedPersonName}
                  </div>
                )}
                <div className="mt-2 font-mono text-[10px] text-muted-foreground/70">
                  {(result.originalBytes / 1024).toFixed(0)} KB →{' '}
                  {(result.compressedBytes / 1024).toFixed(0)} KB (compresion WebP)
                </div>
              </div>

              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground/70 hover:text-foreground">
                  Raw output
                </summary>
                <pre className="mt-2 p-2 bg-background rounded text-[10px] overflow-x-auto font-mono whitespace-pre-wrap break-all">
                  {result.raw}
                </pre>
              </details>
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  )
}
