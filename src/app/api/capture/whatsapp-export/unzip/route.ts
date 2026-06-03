// SIR V2 — POST /api/capture/whatsapp-export/unzip
//
// FALLBACK server-side: recibe el .zip del export de WhatsApp y devuelve el
// texto de `_chat.txt` (ignorando los archivos de media). El camino primario es
// client-side (DecompressionStream, sin subir media); este endpoint cubre
// browsers sin soporte. Por eso hay un tope de tamaño conservador: si el zip
// trae mucha media, el cliente debe extraerlo localmente.
//
// Auth requerida. No persiste nada — solo extrae texto.

import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { extractChatTxtFromZip, ZipExtractError } from '@/lib/capture/whatsapp/export/zip'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Tope conservador del fallback (el cliente maneja los grandes sin subir media).
const MAX_ZIP_BYTES = 8 * 1024 * 1024

interface ErrorBody {
  error: string
  detail?: string
}

function errorJson(status: number, error: string, detail?: string): NextResponse<ErrorBody> {
  return NextResponse.json({ error, detail }, { status })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return errorJson(400, 'FormData inválido en el body')
  }

  const file = formData.get('file')
  if (!(file instanceof Blob)) {
    return errorJson(400, 'Body inválido', 'Se esperaba un campo "file" con el .zip.')
  }
  if (file.size > MAX_ZIP_BYTES) {
    return errorJson(
      413,
      'El .zip es demasiado grande para procesar en el servidor',
      `Máx ${MAX_ZIP_BYTES / 1024 / 1024} MB. Exportá la conversación SIN archivos (.txt) o usá un navegador con soporte de descompresión.`,
    )
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const text = extractChatTxtFromZip(bytes)
    return NextResponse.json({ text }, { status: 200 })
  } catch (e) {
    if (e instanceof ZipExtractError) {
      return errorJson(422, 'No se pudo extraer el chat del .zip', e.message)
    }
    const msg = e instanceof Error ? e.message : String(e)
    return errorJson(500, 'Falló la extracción del .zip', msg.slice(0, 200))
  }
}
