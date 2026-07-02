// SIR V2 — Convertir un PDF a N imágenes (una por página) en el cliente.
//
// Aaron pega/exporta PDFs de perfiles de Instagram/LinkedIn/etc. y quiere que
// SIR los procese igual que las imágenes. En vez de agregar un nuevo pipeline,
// convertimos el PDF → PNGs y las metemos por el mismo camino multi-imagen
// que ya existe (AgregarCapturaPanel, /captura). Cada página es una imagen.
//
// Pdfjs es ~1MB minificado → import DINÁMICO para no meterlo al First Load JS
// de rutas que no lo necesitan. Solo entra al bundle cuando se llama a este
// helper (es decir, cuando el usuario arrastra un PDF de verdad).

const DEFAULT_MAX_PAGES = 8
const DEFAULT_SCALE = 1.8 // Suficiente para que la Vision lea texto pequeño

export interface PdfConvertResult {
  files: File[]
  totalPages: number
  droppedPages: number
  /** null si no hubo problema; string humano si algo pasó (ej. PDF cifrado). */
  error?: string | null
}

/** Extrae el nombre base del archivo sin la extensión .pdf. */
function baseName(name: string): string {
  return name.replace(/\.pdf$/i, '').slice(0, 60) || 'pdf'
}

/** Convierte un File PDF a un array de Files PNG (uno por página, hasta
 *  `maxPages`). Devuelve estructura con info de páginas descartadas para
 *  poder avisar en la UI. */
export async function pdfFileToImages(
  file: File,
  opts: { maxPages?: number; scale?: number } = {},
): Promise<PdfConvertResult> {
  const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES
  const scale = opts.scale ?? DEFAULT_SCALE
  if (typeof window === 'undefined') {
    return { files: [], totalPages: 0, droppedPages: 0, error: 'PDF solo se convierte en el browser' }
  }

  // Import dinámico → sale del First Load JS.
  const pdfjs = await import('pdfjs-dist')
  // Worker: en el browser, apuntamos al worker vendorizado en /public. Si no
  // existe, pdfjs cae a modo sin worker (más lento pero funciona).
  try {
    const opts = (pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions
    if (opts) opts.workerSrc = '/pdfjs-worker.min.mjs'
  } catch {
    /* no-op */
  }

  const arr = await file.arrayBuffer()
  let doc: Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(arr) }).promise
  } catch (e) {
    return { files: [], totalPages: 0, droppedPages: 0, error: `No pude abrir el PDF: ${e instanceof Error ? e.message : 'formato inválido'}` }
  }

  const totalPages = doc.numPages
  const pages = Math.min(totalPages, maxPages)
  const droppedPages = Math.max(0, totalPages - pages)
  const out: File[] = []
  const base = baseName(file.name)
  const now = Date.now()

  for (let i = 1; i <= pages; i++) {
    try {
      const page = await doc.getPage(i)
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('sin canvas 2d')
      await page.render({ canvasContext: ctx, viewport, canvas }).promise
      // Blob PNG. La calidad es full — Vision hace su propio downscale.
      const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/png'))
      if (!blob) throw new Error('canvas → blob falló')
      out.push(new File([blob], `${base}-p${i}-${now}.png`, { type: 'image/png' }))
    } catch (e) {
      // Página individual falla → seguimos con las otras.
      // eslint-disable-next-line no-console
      console.warn(`[pdf] falló página ${i}:`, e instanceof Error ? e.message : e)
    }
  }

  return {
    files: out,
    totalPages,
    droppedPages,
    error: out.length === 0 ? 'No pude renderizar ninguna página del PDF' : null,
  }
}

/** Recibe un array de File (algunos pueden ser PDF), y devuelve un array
 *  donde los PDFs se expandieron a sus páginas. Ideal para plug-in directo
 *  en handlers de upload: `const imgs = await expandPdfsInFiles(input)`. */
export async function expandPdfsInFiles(
  input: File[],
  opts: { maxPagesPerPdf?: number } = {},
): Promise<{ files: File[]; expandedCount: number; warnings: string[] }> {
  const out: File[] = []
  const warnings: string[] = []
  let expandedCount = 0
  for (const f of input) {
    const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name)
    if (!isPdf) { out.push(f); continue }
    const r = await pdfFileToImages(f, { maxPages: opts.maxPagesPerPdf ?? DEFAULT_MAX_PAGES })
    if (r.error) warnings.push(`${f.name}: ${r.error}`)
    if (r.droppedPages > 0) {
      warnings.push(`${f.name}: solo se procesaron las primeras ${r.files.length} de ${r.totalPages} páginas.`)
    }
    out.push(...r.files)
    if (r.files.length > 0) expandedCount++
  }
  return { files: out, expandedCount, warnings }
}
