import { describe, it, expect } from 'vitest'
import { deflateRawSync } from 'node:zlib'

import { extractChatTxtFromZip, ZipExtractError } from './zip'

// ─── Builder mínimo de ZIP para los tests (sin dependencias) ─────────
// CRC=0 a propósito: nuestro lector usa el directorio central y NO verifica CRC.

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
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(f.method),
      u16(0),
      u16(0),
      u32(0),
      u32(comp.length),
      u32(raw.length),
      u16(nameBuf.length),
      u16(0),
      nameBuf,
      comp,
    ])

    const cdfh = Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(f.method),
      u16(0),
      u16(0),
      u32(0),
      u32(comp.length),
      u32(raw.length),
      u16(nameBuf.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBuf,
    ])

    locals.push(lfh)
    centrals.push(cdfh)
    offset += lfh.length
  }

  const localsBuf = Buffer.concat(locals)
  const cd = Buffer.concat(centrals)
  const eocd = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(cd.length),
    u32(localsBuf.length),
    u16(0),
  ])

  return Buffer.concat([localsBuf, cd, eocd])
}

const CHAT = `[12/05/24, 21:03:11] Ana Pérez: Hola, ¿cómo estás?
[12/05/24, 21:04:02] Yo: Todo bien!`

describe('extractChatTxtFromZip', () => {
  it('extrae _chat.txt almacenado (método 0)', () => {
    const zip = buildZip([{ name: '_chat.txt', data: CHAT, method: 0 }])
    expect(extractChatTxtFromZip(new Uint8Array(zip))).toBe(CHAT)
  })

  it('extrae _chat.txt comprimido con deflate (método 8)', () => {
    const zip = buildZip([{ name: '_chat.txt', data: CHAT, method: 8 }])
    expect(extractChatTxtFromZip(new Uint8Array(zip))).toBe(CHAT)
  })

  it('ignora los archivos de media y elige el chat', () => {
    const zip = buildZip([
      { name: '00000042-PHOTO.jpg', data: 'binario-falso-de-imagen', method: 0 },
      { name: '_chat.txt', data: CHAT, method: 8 },
      { name: '00000043-AUDIO.opus', data: 'audio-falso', method: 0 },
    ])
    expect(extractChatTxtFromZip(new Uint8Array(zip))).toBe(CHAT)
  })

  it('cae a cualquier .txt si no hay _chat.txt', () => {
    const zip = buildZip([{ name: 'WhatsApp Chat con Ana.txt', data: CHAT, method: 8 }])
    expect(extractChatTxtFromZip(new Uint8Array(zip))).toBe(CHAT)
  })

  it('lanza ZipExtractError si no hay ningún texto', () => {
    const zip = buildZip([{ name: 'foto.jpg', data: 'xxx', method: 0 }])
    expect(() => extractChatTxtFromZip(new Uint8Array(zip))).toThrow(ZipExtractError)
  })

  it('lanza ZipExtractError si no es un zip', () => {
    expect(() => extractChatTxtFromZip(new Uint8Array([1, 2, 3, 4]))).toThrow(ZipExtractError)
  })
})
