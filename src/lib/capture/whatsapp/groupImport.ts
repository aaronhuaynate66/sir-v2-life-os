// SIR V2 — runGroupImport: importa un chat GRUPAL atribuyendo POR AUTOR a cada
// miembro conocido, sin contaminar fichas. Lee el archivo y procesa la media UNA
// vez; luego corre la interpretación POR MIEMBRO (interpretChunk con el nombre
// de ese miembro → extrae hechos/tono/fechas de ESE miembro, marca lo de otros
// como tercero). El owner (Aaron) no es persona en su grafo → se excluye solo.
// NO postea huella de chat (chat_identities es 1:1; un grupo no debe rutear a
// una sola persona). v1: procesa el chat completo (sin incremental por miembro).
import {
  readExportText, interpretChunk, persistWhatsAppExport, archiveConversation,
} from './export/client'
import { parseWhatsAppExport, isWhatsAppExport } from './export/parse'
import { transcribeExportAudios } from './export/audioClient'
import { triageExportImages } from './export/imageClient'
import { tagExportStickers } from './export/stickerClient'
import { chunkConversation } from './export/chunk'
import { consolidateInterpretations, buildExportObservationData } from './export/consolidate'
import type { ChunkInterpretation, ParsedExport } from './export/types'
import { createPersonLog } from '@/components/relaciones/person-logs/client'
import type { RunImportOpts } from './runImport'

export interface GroupMember { id: string; name: string }
export interface GroupProgress { phase: 'reading' | 'media' | 'member'; member?: string; done?: number; total?: number; label?: string }
export interface GroupMemberResult { id: string; name: string; ok: boolean; messageCount?: number; blocks?: number; error?: string }
export interface GroupImportResult { ok: boolean; perMember: GroupMemberResult[]; error?: string }

async function runPool<T>(items: T[], limit: number, worker: (item: T, i: number) => Promise<void>): Promise<void> {
  let i = 0
  const workers = Array.from({ length: Math.min(limit, items.length) || 1 }, async () => {
    while (i < items.length) { const idx = i++; await worker(items[idx], idx) }
  })
  await Promise.all(workers)
}

export async function runGroupImport(
  file: File,
  members: GroupMember[],
  opts: RunImportOpts = {},
  onProgress?: (p: GroupProgress) => void,
): Promise<GroupImportResult> {
  if (members.length === 0) return { ok: false, perMember: [], error: 'Sin miembros para atribuir.' }
  try {
    onProgress?.({ phase: 'reading' })
    let text = await readExportText(file)
    const isZip = /\.zip$/i.test(file.name)
    if (opts.transcribeAudios && isZip) {
      onProgress?.({ phase: 'media', label: 'audios' })
      try { const r = await transcribeExportAudios(file, text, { cap: 25, sinceISO: null, onProgress: (d, t) => onProgress?.({ phase: 'media', label: 'audios', done: d, total: t }) }); text = r.text } catch { /* */ }
    }
    if (opts.readImages && isZip) {
      onProgress?.({ phase: 'media', label: 'fotos' })
      try { const r = await triageExportImages(file, text, { cap: 15, sinceISO: null, onProgress: (d, t) => onProgress?.({ phase: 'media', label: 'fotos', done: d, total: t }) }); text = r.text } catch { /* */ }
    }
    if (opts.readStickers && isZip) {
      onProgress?.({ phase: 'media', label: 'stickers' })
      try { const r = await tagExportStickers(file, text, { cap: 20, sinceISO: null, onProgress: (d, t) => onProgress?.({ phase: 'media', label: 'stickers', done: d, total: t }) }); text = r.text } catch { /* */ }
    }

    const parsed: ParsedExport = parseWhatsAppExport(text)
    if (!isWhatsAppExport(text) || parsed.messages.length === 0) return { ok: false, perMember: [], error: 'No parece un export de WhatsApp legible.' }

    const chunks = chunkConversation(parsed.messages)
    const perMember: GroupMemberResult[] = []

    for (const m of members) {
      onProgress?.({ phase: 'member', member: m.name, done: 0, total: chunks.length })
      // Archivar el crudo bajo cada miembro (source grupal) → bitácora + Paso 3.
      void archiveConversation({ personId: m.id, rawText: text, dateFirst: parsed.firstISO, dateLast: parsed.lastISO, messageCount: parsed.messages.length, source: 'whatsapp_group' })

      const parts: (ChunkInterpretation | null)[] = new Array(chunks.length).fill(null)
      let done = 0
      await runPool(chunks, 3, async (chunk, idx) => {
        try { parts[idx] = await interpretChunk({ chunkText: chunk.text, personName: m.name, index: idx, total: chunks.length }) }
        catch { parts[idx] = null }
        finally { done += 1; onProgress?.({ phase: 'member', member: m.name, done, total: chunks.length }) }
      })
      const valid = parts.filter((p): p is ChunkInterpretation => p !== null)
      if (valid.length === 0) { perMember.push({ id: m.id, name: m.name, ok: false, error: 'no se pudo interpretar' }); continue }

      const consolidated = consolidateInterpretations(valid)
      const exportData = buildExportObservationData(parsed, consolidated, m.name)
      try {
        await persistWhatsAppExport({ personId: m.id, data: exportData })
        const q = consolidated.interactionQuality
        if (typeof q === 'number' && q >= 1 && q <= 5) {
          try { await createPersonLog({ personId: m.id, kind: 'interaction', value: q, note: `Importado de un chat GRUPAL · ${parsed.messages.length} mensajes` }) } catch { /* */ }
        }
        perMember.push({ id: m.id, name: m.name, ok: true, messageCount: parsed.messages.length, blocks: valid.length })
      } catch (e) { perMember.push({ id: m.id, name: m.name, ok: false, error: String(e).slice(0, 100) }) }
    }
    return { ok: perMember.some((r) => r.ok), perMember }
  } catch (e) {
    return { ok: false, perMember: [], error: String(e).slice(0, 140) }
  }
}
