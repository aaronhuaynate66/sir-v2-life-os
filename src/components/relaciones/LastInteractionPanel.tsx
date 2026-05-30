// SIR V2 — LastInteractionPanel (port adaptado de SIR V1).
//
// FUENTE DE DATOS (V1 vs V2):
//   V1 mostraba "Ultima interaccion: hace N dias". V1 venia de un log
//   dedicado de interacciones. V2 no tiene ese log; el analogo correcto
//   es observations con capture_type='whatsapp_chat' — esas SI son
//   conversaciones reales. whatsapp_info / instagram / linkedin son
//   SNAPSHOTS de perfil, NO interacciones; cablear "ultima observation"
//   pintaria un LinkedIn capturado como interaccion, lo cual es falso.
//
// Por eso este componente recibe `lastChat: Observation | null` (ya
// filtrado por capture_type='whatsapp_chat' AND is_obsolete=false por la
// capa de fetch).
//
// REGISTRO MANUAL (Sesion 6+): el usuario también puede loguear una
// "interacción" a mano (person_logs, kind='interaction'). Eso NO es una
// conversación real capturada, pero ES un dato de "cuándo interactué con
// esta persona". Para no mentir ("sin interacciones" cuando acabás de
// registrar una) recibimos también `lastManualInteraction` y mostramos el
// MÁS RECIENTE entre captura y registro manual — el manual SIEMPRE
// etiquetado con badge "registro manual" para preservar la distinción
// captura (conversación real) vs nota tuya. Si ambos son null, empty.

import { MessageCircle } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Observation } from '@/lib/capture/observations/types'
import type { PersonLog } from '@/lib/person-logs/types'

export interface LastInteractionPanelProps {
  /** Ultima observation con capture_type='whatsapp_chat' (ya curada
   *  is_obsolete=false). null si la persona no tiene ninguna registrada. */
  lastChat: Observation | null
  /** Último person_log con kind='interaction' (registro manual). null si
   *  no hay ninguno. Se compara por fecha con lastChat y gana el más
   *  reciente. */
  lastManualInteraction?: PersonLog | null
}

export function LastInteractionPanel({
  lastChat,
  lastManualInteraction = null,
}: LastInteractionPanelProps) {
  // Decidir qué mostrar: el más reciente por fecha. lastChat usa
  // observedAt (timestamp completo); el log manual usa loggedAt (timestamptz).
  // Ambos parsean bien con new Date() — NO son date-only.
  const chatTime = lastChat ? new Date(lastChat.observedAt).getTime() : -Infinity
  const manualTime = lastManualInteraction
    ? new Date(lastManualInteraction.loggedAt).getTime()
    : -Infinity

  let body: React.ReactNode
  if (chatTime === -Infinity && manualTime === -Infinity) {
    body = <EmptyState />
  } else if (manualTime > chatTime) {
    body = <ManualInteractionBody log={lastManualInteraction as PersonLog} />
  } else {
    body = <LastChatBody obs={lastChat as Observation} />
  }

  return (
    <Card className="shadow-none">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-3">
          <MessageCircle
            size={14}
            strokeWidth={1.75}
            className="text-muted-foreground/70"
            aria-hidden="true"
          />
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
            Última interacción
          </div>
        </div>

        {body}
      </CardContent>
    </Card>
  )
}

/** Etiqueta del tono emocional 1-5 (paridad con RegistrarInteraccionPanel). */
const INTERACTION_TONE: Record<number, string> = {
  1: 'Corazón roto',
  2: 'Tenso',
  3: 'Neutral',
  4: 'Cálido',
  5: 'Corazón pleno',
}

function ManualInteractionBody({ log }: { log: PersonLog }) {
  const loggedAt = new Date(log.loggedAt)
  const ago = formatTimeAgo(loggedAt)
  const absoluteDate = formatAbsoluteDate(loggedAt)
  const toneLabel = INTERACTION_TONE[log.value] ?? null
  const note = typeof log.note === 'string' && log.note.trim().length > 0 ? log.note.trim() : null

  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-2xl font-semibold tracking-tight">{ago.headline}</span>
        <span className="text-xs text-muted-foreground font-mono">· {absoluteDate}</span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="secondary" className="text-[10px] font-mono uppercase tracking-wider">
          registro manual
        </Badge>
        {toneLabel && (
          <Badge variant="outline" className="text-[10px] font-mono">
            {toneLabel} · {log.value}/5
          </Badge>
        )}
      </div>

      {note && <p className="text-sm text-foreground leading-relaxed">{note}</p>}
    </div>
  )
}

function LastChatBody({ obs }: { obs: Observation }) {
  const observedAt = new Date(obs.observedAt)
  const ago = formatTimeAgo(observedAt)
  const absoluteDate = formatAbsoluteDate(observedAt)

  // El extractor whatsapp_chat sanitiza `summary` (max ~280 chars en español).
  const summary =
    typeof obs.data?.summary === 'string' && (obs.data.summary as string).trim().length > 0
      ? (obs.data.summary as string).trim()
      : null

  // Topics + emotional states son arrays/objetos del extractor.
  const topics = Array.isArray(obs.data?.topics)
    ? (obs.data.topics as unknown[]).filter((t): t is string => typeof t === 'string')
    : []

  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-2xl font-semibold tracking-tight">{ago.headline}</span>
        <span className="text-xs text-muted-foreground font-mono">· {absoluteDate}</span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="text-[10px] font-mono uppercase tracking-wider">
          whatsapp_chat
        </Badge>
        {obs.confidence && (
          <Badge variant="secondary" className="text-[10px] font-mono">
            conf. {obs.confidence}
          </Badge>
        )}
        {obs.needsReview && (
          <Badge variant="destructive" className="text-[10px] font-mono">
            needs review
          </Badge>
        )}
      </div>

      {summary && (
        <p className="text-sm text-foreground leading-relaxed">{summary}</p>
      )}

      {topics.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {topics.slice(0, 6).map((t) => (
            <Badge key={t} variant="outline" className="text-[10px] font-mono">
              {t}
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="text-sm text-muted-foreground space-y-1.5">
      <p>Sin interacciones registradas.</p>
      <p className="text-xs leading-relaxed">
        Se alimenta de dos fuentes: una <span className="font-medium">conversación real</span>,
        subiendo screenshots de WhatsApp chat en{' '}
        <span className="font-mono text-foreground/80">/captura</span>, o un{' '}
        <span className="font-medium">registro manual</span> desde el panel
        &quot;Registrar interacción&quot;. Snapshots de perfil (Instagram, LinkedIn, info
        de contacto) NO cuentan como interacción.
      </p>
    </div>
  )
}

/** Headline corto tipo "hace 5 dias" / "hace 2 horas" / "hoy". */
function formatTimeAgo(date: Date): { headline: string } {
  const now = Date.now()
  const diff = now - date.getTime()
  const minutes = Math.floor(diff / 60_000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const weeks = Math.floor(days / 7)
  const months = Math.floor(days / 30)
  const years = Math.floor(days / 365)

  if (diff < 0) return { headline: 'en el futuro' } // safety, observed_at adelantado
  if (minutes < 60) {
    if (minutes < 1) return { headline: 'hace instantes' }
    if (minutes === 1) return { headline: 'hace 1 minuto' }
    return { headline: `hace ${minutes} minutos` }
  }
  if (hours < 24) {
    if (hours === 1) return { headline: 'hace 1 hora' }
    return { headline: `hace ${hours} horas` }
  }
  if (days < 7) {
    if (days === 1) return { headline: 'ayer' }
    return { headline: `hace ${days} días` }
  }
  if (weeks < 4) {
    if (weeks === 1) return { headline: 'hace 1 semana' }
    return { headline: `hace ${weeks} semanas` }
  }
  if (months < 12) {
    if (months === 1) return { headline: 'hace 1 mes' }
    return { headline: `hace ${months} meses` }
  }
  if (years === 1) return { headline: 'hace 1 año' }
  return { headline: `hace ${years} años` }
}

const ABS_FORMATTER = new Intl.DateTimeFormat('es', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

function formatAbsoluteDate(date: Date): string {
  return ABS_FORMATTER.format(date)
}
