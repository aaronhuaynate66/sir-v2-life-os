// SIR V2 — /api/capturas-telegram
//   GET → las fotos que Aaron mandó por Telegram y todavía nadie clasificó.
//
// POR QUÉ EXISTE — y es un error mío, no del sistema:
//
// El 2-ago-2026 arreglé que una foto de Telegram que SIR no entiende ya no se
// descarte (`lib/capture/guardarFotoTelegram`). Se sube al bucket y se crea una
// observación. Pero el mapeo posterior de la app mostró que **nadie lee esas
// filas**: los únicos lectores de `source_image_path` son el avatar automático y
// las notas de voz. Las salvé del vacío para meterlas en otro vacío.
//
// Esta ruta las saca a la luz: devuelve la imagen firmada + el texto que se le
// pudo extraer, para que él pueda decir qué son.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 20

/** Una hora: igual que el resto de las URLs firmadas del repo. */
const TTL = 3600
const LIMITE = 30

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data, error } = await supabase
    .from('observations')
    .select('id, capture_type, data, confidence, needs_review, captured_at, source_image_path, storage_bucket, person_id')
    .eq('user_id', user.id)
    .not('source_image_path', 'is', null)
    .order('captured_at', { ascending: false })
    .limit(200)
  // PostgREST no lanza: sin esto una columna mal escrita diría "no hay capturas"
  // en vez de "no pude preguntar" — el bug que llevo dos días persiguiendo.
  if (error) return NextResponse.json({ error: 'No se pudieron leer', detail: error.message }, { status: 500 })

  // Solo las que entraron por Telegram: el resto (DNI, exámenes) ya tiene su panel.
  const deTelegram = (data ?? []).filter((r) => {
    const d = (r.data ?? {}) as Record<string, unknown>
    return d.via === 'telegram'
  }).slice(0, LIMITE)

  const out = []
  for (const r of deTelegram) {
    const d = (r.data ?? {}) as Record<string, unknown>
    let url: string | null = null
    if (r.storage_bucket && r.source_image_path) {
      const { data: signed } = await supabase.storage
        .from(String(r.storage_bucket))
        .createSignedUrl(String(r.source_image_path), TTL)
      url = signed?.signedUrl ?? null
    }
    out.push({
      id: r.id,
      captureType: r.capture_type,
      texto: typeof d.text === 'string' ? d.text : '',
      resumen: typeof d.resumen === 'string' ? d.resumen : '',
      needsReview: r.needs_review === true,
      capturedAt: r.captured_at,
      personId: r.person_id ?? null,
      imagenUrl: url,
    })
  }
  return NextResponse.json({ capturas: out })
}
