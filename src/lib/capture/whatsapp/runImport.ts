// SIR V2 — runWhatsappImport: motor HEADLESS del import de un chat de WhatsApp.
// Orquesta las MISMAS funciones de lib que usa AgregarCapturaPanel (parse →
// media opcional → incremental → bloques → consolidar → persistir + interacción
// + llamadas + huella + archivo), pero SIN UI ni revisión — para el intake
// masivo (#91), donde se procesa una cola de chats. NO auto-agrega fechas
// especiales (eso queda para el import de a uno con revisión).
import {
  readExportText, interpretChunk, persistWhatsAppExport, getLastImportedISO, archiveConversation,
} from './export/client'
import { parseWhatsAppExport, isWhatsAppExport } from './export/parse'
import { transcribeExportAudios } from './export/audioClient'
import { triageExportImages } from './export/imageClient'
import { tagExportStickers } from './export/stickerClient'
import { sliceParsedSince, incrementalSummary } from './export/incremental'
import { extractCalls, callLabel } from './export/calls'
import { chatFingerprint } from './export/fingerprint'
import { chunkConversation } from './export/chunk'
import { consolidateInterpretations, buildExportObservationData } from './export/consolidate'
import type { ChunkInterpretation } from './export/types'
import { createPersonLog } from '@/components/relaciones/person-logs/client'

export interface RunImportOpts { transcribeAudios?: boolean; readImages?: boolean; readStickers?: boolean }
export type RunPhase = 'reading' | 'media' | 'interpreting' | 'persisting'
export interface RunImportProgress { phase: RunPhase; done?: number; total?: number; label?: string }
export interface RunImportResult {
  ok: boolean; alreadyImported?: boolean; messageCount?: number; blocks?: number; calls?: number; error?: string
}

async function runPool<T>(items: T[], limit: number, worker: (item: T, i: number) => Promise<void>): Promise<void> {
  let i = 0
  const workers = Array.from({ length: Math.min(limit, items.length) || 1 }, async () => {
    while (i < items.length) { const idx = i++; await worker(items[idx], idx) }
  })
  await Promise.all(workers)
}

export async function runWhatsappImport(
  file: File,
  personId: string,
  personName: string,
  opts: RunImportOpts = {},
  onProgress?: (p: RunImportProgress) => void,
): Promise<RunImportResult> {
  try {
    onProgress?.({ phase: 'reading' })
    let text = await readExportText(file)
    const lastImportedISO = await getLastImportedISO(personId)
    const isZip = /\.zip$/i.test(file.name)

    if (opts.transcribeAudios && isZip) {
      onProgress?.({ phase: 'media', label: 'audios' })
      try { const r = await transcribeExportAudios(file, text, { cap: 25, sinceISO: lastImportedISO, onProgress: (d, t) => onProgress?.({ phase: 'media', label: 'audios', done: d, total: t }) }); text = r.text } catch { /* */ }
    }
    if (opts.readImages && isZip) {
      onProgress?.({ phase: 'media', label: 'fotos' })
      try { const r = await triageExportImages(file, text, { cap: 15, sinceISO: lastImportedISO, onProgress: (d, t) => onProgress?.({ phase: 'media', label: 'fotos', done: d, total: t }) }); text = r.text } catch { /* */ }
    }
    if (opts.readStickers && isZip) {
      onProgress?.({ phase: 'media', label: 'stickers' })
      try { const r = await tagExportStickers(file, text, { cap: 20, sinceISO: lastImportedISO, onProgress: (d, t) => onProgress?.({ phase: 'media', label: 'stickers', done: d, total: t }) }); text = r.text } catch { /* */ }
    }

    const parsed = parseWhatsAppExport(text)
    if (!isWhatsAppExport(text) || parsed.messages.length === 0) {
      return { ok: false, error: 'No parece un export de WhatsApp legible.' }
    }

    void archiveConversation({ personId, rawText: text, dateFirst: parsed.firstISO, dateLast: parsed.lastISO, messageCount: parsed.messages.length })

    const incr = incrementalSummary(parsed, lastImportedISO)
    if (incr.isDuplicate) return { ok: true, alreadyImported: true, messageCount: 0 }

    const fresh = sliceParsedSince(parsed, lastImportedISO)
    const chunks = chunkConversation(fresh.messages)
    onProgress?.({ phase: 'interpreting', done: 0, total: chunks.length })
    const parts: (ChunkInterpretation | null)[] = new Array(chunks.length).fill(null)
    let done = 0
    await runPool(chunks, 3, async (chunk, idx) => {
      try { parts[idx] = await interpretChunk({ chunkText: chunk.text, personName, index: idx, total: chunks.length }) }
      catch { parts[idx] = null }
      finally { done += 1; onProgress?.({ phase: 'interpreting', done, total: chunks.length }) }
    })
    const valid = parts.filter((p): p is ChunkInterpretation => p !== null)
    if (valid.length === 0) return { ok: false, error: 'Ningún bloque se pudo interpretar.' }

    const consolidated = consolidateInterpretations(valid)
    const exportData = buildExportObservationData(fresh, consolidated, personName)

    onProgress?.({ phase: 'persisting' })
    await persistWhatsAppExport({ personId, data: exportData })

    const quality = consolidated.interactionQuality
    if (typeof quality === 'number' && quality >= 1 && quality <= 5) {
      try { await createPersonLog({ personId, kind: 'interaction', value: quality, note: `Importado del export de WhatsApp · ${fresh.messages.length} mensajes` }) } catch { /* */ }
    }
    const calls = extractCalls(text, lastImportedISO)
    for (const c of calls.slice(0, 30)) {
      try { await createPersonLog({ personId, kind: 'interaction', value: 3, note: `${callLabel(c)}${c.time ? ` · ${c.time}` : ''}`, ...(c.iso ? { loggedAt: c.iso } : {}) }) } catch { /* */ }
    }
    const fingerprint = chatFingerprint(parsed.participants)
    if (fingerprint) {
      try { await fetch('/api/chat-identities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fingerprint, person_id: personId }) }) } catch { /* */ }
    }
    return { ok: true, messageCount: fresh.messages.length, blocks: valid.length, calls: calls.length }
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 140) }
  }
}

/** Nombre de contacto de WhatsApp desde el filename del export.
 *  "WhatsApp Chat - Papa.zip" -> "Papa". */
export function waNameFromFile(fileName: string): string {
  let s = (fileName || '').replace(/\.(zip|txt)$/i, '')
  s = s.replace(/^.*?whatsapp chat\s*-\s*/i, '')
  s = s.replace(/^chat de whatsapp\s*(con|de)?\s*/i, '')
  s = s.replace(/\s*\(\d+\)\s*$/, '')
  return s.trim()
}
