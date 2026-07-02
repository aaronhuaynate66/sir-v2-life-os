// SIR V2 — Extraer TEXTO de un PDF client-side (para el chat de /relato/ingest).
//
// A diferencia de pdfToImages (que rasteriza para Vision), acá sacamos el
// texto NATIVO del PDF (si lo tiene). Para PDFs generados desde Word/Google
// Docs/exports estructurados esto es 100x más barato que Vision. Si el PDF
// es un scan (solo imágenes), textContent devuelve poco o nada — el caller
// puede fall-back a pdfToImages en ese caso.

const DEFAULT_MAX_PAGES = 10

export interface PdfTextResult {
  text: string
  totalPages: number
  pagesRead: number
  /** true si parece que el PDF no tenía texto extraíble (scan de imágenes). */
  looksLikeScan: boolean
  error?: string
}

export async function pdfFileToText(
  file: File,
  opts: { maxPages?: number } = {},
): Promise<PdfTextResult> {
  const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES
  if (typeof window === 'undefined') {
    return { text: '', totalPages: 0, pagesRead: 0, looksLikeScan: false, error: 'PDF solo se lee en el browser' }
  }
  const pdfjs = await import('pdfjs-dist')
  try {
    const opts2 = (pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions
    if (opts2) opts2.workerSrc = '/pdfjs-worker.min.mjs'
  } catch { /* */ }

  const arr = await file.arrayBuffer()
  let doc: Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(arr) }).promise
  } catch (e) {
    return { text: '', totalPages: 0, pagesRead: 0, looksLikeScan: false, error: `No pude abrir el PDF: ${e instanceof Error ? e.message : 'formato inválido'}` }
  }

  const totalPages = doc.numPages
  const pages = Math.min(totalPages, maxPages)
  const chunks: string[] = []
  let charCount = 0

  for (let i = 1; i <= pages; i++) {
    try {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      const items = (content as unknown as { items: Array<{ str?: string }> }).items ?? []
      const pageText = items.map((it) => (it.str ?? '')).join(' ').replace(/\s+/g, ' ').trim()
      if (pageText.length > 0) {
        chunks.push(`--- Página ${i} ---\n${pageText}`)
        charCount += pageText.length
      }
    } catch { /* saltar */ }
  }

  // Heurística: <60 chars por página en promedio → probablemente scan.
  const looksLikeScan = pages > 0 && charCount / pages < 60
  return {
    text: chunks.join('\n\n'),
    totalPages,
    pagesRead: pages,
    looksLikeScan,
  }
}
