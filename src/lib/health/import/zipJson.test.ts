// SIR V2 — Tests de extracción de .json de Apple Health desde un .zip.
//
// Construimos zips mínimos (sin dependencias) y le inyectamos el inflador de
// node (inflateRawSync) — el mismo contrato que en el browser usa
// DecompressionStream. Cubre stored (0), deflate (8), multi-json y casos malos.

import { describe, it, expect } from 'vitest'
import { deflateRawSync, inflateRawSync } from 'node:zlib'

import { extractJsonTextsFromZip, locateJsonEntries, ZipExtractError } from './zipJson'
import { readCentralDirectory } from '@/lib/capture/whatsapp/export/zipCore'

// ─── Builder mínimo de ZIP (espejo del de whatsapp/export/zip.test.ts) ──

interface ZipFile {
  name: string
  data: string
  method: 0 | 8
}

function u16(n: number): Buffer {
  const b = Buffer.alloc(2)
  b.writeUInt16LE(n)
  return b
}
function u32(n: number): Buffer {
  const b = Buffer.alloc(4)
  b.writeUInt32LE(n)
  return b
}

function buildZip(files: ZipFile[]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0

  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'utf8')
    const raw = Buffer.from(f.data, 'utf8')
    const comp = f.method === 8 ? deflateRawSync(raw) : raw

    const lfh = Buffer.concat([
      u32(0x04034b50), u16(20), u16(0), u16(f.method), u16(0), u16(0), u32(0),
      u32(comp.length), u32(raw.length), u16(nameBuf.length), u16(0), nameBuf, comp,
    ])
    const cdfh = Buffer.concat([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(f.method), u16(0), u16(0), u32(0),
      u32(comp.length), u32(raw.length), u16(nameBuf.length), u16(0), u16(0), u16(0), u16(0),
      u32(0), u32(offset), nameBuf,
    ])
    locals.push(lfh)
    centrals.push(cdfh)
    offset += lfh.length
  }

  const localsBuf = Buffer.concat(locals)
  const cd = Buffer.concat(centrals)
  const eocd = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(cd.length), u32(localsBuf.length), u16(0),
  ])
  return Buffer.concat([localsBuf, cd, eocd])
}

const inflate = (data: Uint8Array) => new Uint8Array(inflateRawSync(Buffer.from(data)))
const JSON_A = '{"data":{"metrics":[{"name":"weight_body_mass","data":[]}]}}'
const JSON_B = '{"data":{"metrics":[{"name":"step_count","data":[]}]}}'

describe('locateJsonEntries', () => {
  it('toma sólo los .json e ignora basura __MACOSX y AppleDouble', () => {
    const zip = buildZip([
      { name: 'HealthAutoExport.json', data: JSON_A, method: 0 },
      { name: '__MACOSX/._HealthAutoExport.json', data: 'x', method: 0 },
      { name: 'folder/._otro.json', data: 'x', method: 0 },
      { name: 'readme.txt', data: 'x', method: 0 },
    ])
    const names = locateJsonEntries(readCentralDirectory(new Uint8Array(zip))).map((e) => e.fileName)
    expect(names).toEqual(['HealthAutoExport.json'])
  })
})

describe('extractJsonTextsFromZip', () => {
  it('extrae un .json almacenado (método 0)', async () => {
    const zip = buildZip([{ name: 'HealthAutoExport.json', data: JSON_A, method: 0 }])
    const texts = await extractJsonTextsFromZip(new Uint8Array(zip), inflate)
    expect(texts).toEqual([JSON_A])
  })

  it('extrae un .json comprimido con deflate (método 8)', async () => {
    const zip = buildZip([{ name: 'HealthAutoExport.json', data: JSON_A, method: 8 }])
    const texts = await extractJsonTextsFromZip(new Uint8Array(zip), inflate)
    expect(texts).toEqual([JSON_A])
  })

  it('extrae varios .json del mismo zip', async () => {
    const zip = buildZip([
      { name: 'a.json', data: JSON_A, method: 8 },
      { name: 'b.json', data: JSON_B, method: 0 },
    ])
    const texts = await extractJsonTextsFromZip(new Uint8Array(zip), inflate)
    expect(texts).toEqual([JSON_A, JSON_B])
  })

  it('lanza ZipExtractError si no hay ningún .json', async () => {
    const zip = buildZip([{ name: 'foto.jpg', data: 'xxx', method: 0 }])
    await expect(extractJsonTextsFromZip(new Uint8Array(zip), inflate)).rejects.toThrow(ZipExtractError)
  })

  it('lanza ZipExtractError si no es un zip', async () => {
    await expect(extractJsonTextsFromZip(new Uint8Array([1, 2, 3, 4]), inflate)).rejects.toThrow(ZipExtractError)
  })
})
