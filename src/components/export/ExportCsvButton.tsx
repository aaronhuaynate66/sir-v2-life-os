'use client'
// SIR V2 — ExportCsvButton (Export / data ownership).
//
// Botón genérico que genera un CSV client-side (callback que devuelve el
// string) y dispara la descarga. Sin red, sin libs. Se deshabilita si no
// hay filas para exportar.

import { useCallback } from 'react'
import { Download } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { downloadCsv, csvFilename } from '@/lib/export/csv'

export interface ExportCsvButtonProps {
  /** Prefijo del archivo (se le agrega _YYYY-MM-DD.csv). */
  filenamePrefix: string
  /** Genera el contenido CSV en el momento del click. */
  buildCsv: () => string
  /** Cantidad de filas disponibles (0 → botón deshabilitado). */
  count: number
  /** Texto del botón. Default "Exportar CSV". */
  label?: string
  className?: string
}

export function ExportCsvButton({
  filenamePrefix,
  buildCsv,
  count,
  label = 'Exportar CSV',
  className,
}: ExportCsvButtonProps) {
  const onClick = useCallback(() => {
    if (count <= 0) return
    downloadCsv(csvFilename(filenamePrefix), buildCsv())
  }, [filenamePrefix, buildCsv, count])

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={count <= 0}
      className={className}
      title={count <= 0 ? 'No hay datos para exportar' : undefined}
    >
      <Download size={13} strokeWidth={2} aria-hidden="true" />
      {label}
      {count > 0 && <span className="text-[10px] font-mono text-muted-foreground/60">({count})</span>}
    </Button>
  )
}
