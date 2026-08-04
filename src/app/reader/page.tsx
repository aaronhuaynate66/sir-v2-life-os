'use client'
// SIR V2 — /reader · Estado de ingesta del SIR Reader.
//
// Mata la ceguera: muestra qué está entrando desde la extensión (WhatsApp/Teams/
// Outlook de otra PC), cuándo fue la última vez, cuántos mensajes, y si se cruzó
// con una persona. Si un hilo no matchea a nadie o hace mucho que no llega nada,
// se ve en rojo/ámbar.

import { useEffect, useState } from 'react'
import { RefreshCw, CheckCircle2, AlertTriangle, Radio } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'

interface Thread { platform: string; threadName: string; lastIngestAt: string | null; lastMessageAt: string | null }
interface Recent { observedAt: string | null; platform: string; threadName: string; messageCount: number; matched: boolean }
interface PlatformAgg { threads: number; observations: number; messages: number; matched: number; lastIngestAt: string | null }
/** El estado REAL de un canal: el veredicto que usa el brief, más el diagnóstico
 *  del lector (que existía escrito y no se leía en ninguna parte). */
interface Canal {
  channel: string
  lastBeatAt: string | null
  lastDataAt: string | null
  status: string | null
  detail: string | null
  extVersion: string | null
  sentCount: number | null
  lastError: string | null
  kind: 'ok' | 'caido' | 'deslogueado' | 'sin_datos' | 'sin_latido' | 'nunca_visto'
  hoursSinceHeartbeat: number | null
  daysSinceData: number | null
  /** true = leyendo · false = abierto pero NO leyendo · null = no sé. */
  lectorVivo: boolean | null
  probeLine: string | null
  /** false = este canal no puede autodiagnosticarse (lector pasivo, sin probe). */
  tieneDiagnostico: boolean
}
interface Status {
  canales?: Canal[]
  threads: Thread[]
  byPlatform: Record<string, PlatformAgg>
  recent: Recent[]
  totals: { threads: number; readerObservations: number; readerChatMessages: number }
}

/** Veredicto en palabras, con el color que le corresponde. */
const VEREDICTO: Record<Canal['kind'], { label: string; cls: string }> = {
  ok: { label: 'Andando', cls: 'text-good' },
  sin_latido: { label: 'Trae datos, sin latido', cls: 'text-warn' },
  sin_datos: { label: 'Late, no trae nada', cls: 'text-warn' },
  deslogueado: { label: 'Deslogueado — escanear QR', cls: 'text-bad' },
  caido: { label: 'Caído', cls: 'text-bad' },
  nunca_visto: { label: 'Nunca trajo nada', cls: 'text-muted-foreground' },
}

function hoursSince(iso: string | null): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  return (Date.now() - t) / 3_600_000
}

function freshness(iso: string | null): { cls: string; label: string } {
  const h = hoursSince(iso)
  if (h == null) return { cls: 'text-muted-foreground', label: 'nunca' }
  if (h < 24) return { cls: 'text-good', label: relTime(h) }
  if (h < 24 * 7) return { cls: 'text-warn', label: relTime(h) }
  return { cls: 'text-bad', label: relTime(h) }
}

function relTime(h: number): string {
  if (h < 1) return `hace ${Math.max(1, Math.round(h * 60))} min`
  if (h < 48) return `hace ${Math.round(h)} h`
  return `hace ${Math.round(h / 24)} d`
}

export default function ReaderStatusPage() {
  const [data, setData] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true); setError(null)
    try {
      const r = await fetch('/api/reader/status')
      if (!r.ok) { setError('No se pudo cargar el estado'); return }
      setData((await r.json()) as Status)
    } catch { setError('Error de red') } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  const platforms = data ? Object.entries(data.byPlatform).sort((a, b) => b[1].messages - a[1].messages) : []
  const unmatched = data ? data.recent.filter((r) => !r.matched).length : 0

  return (
    <AppShell>
      <main className="mx-auto max-w-3xl px-4 py-6 space-y-5">
        <header className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Radio size={20} className="text-brand" aria-hidden="true" />
            <h1 className="text-2xl font-semibold tracking-tight">Estado de ingesta</h1>
          </div>
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualizar
          </button>
        </header>
        <p className="text-sm text-muted-foreground">
          Qué está leyendo el SIR Reader (extensión de otra PC) de tus chats, cuándo llegó, y si se cruzó con una persona.
        </p>

        {error && <div className="text-sm text-bad">{error}</div>}
        {loading && !data && <div className="text-sm text-muted-foreground">Cargando…</div>}

        {data && (
          <>
            {/* Salud global */}
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Hilos seguidos" value={data.totals.threads} />
              <Stat label="Observaciones" value={data.totals.readerObservations} />
              <Stat label="Mensajes al hilo" value={data.totals.readerChatMessages} />
            </div>

            {data.totals.threads === 0 && (
              <Card><CardContent className="p-4 text-sm text-muted-foreground">
                Todavía no llegó nada del reader. Verifica que la extensión esté instalada en la otra PC, con el token correcto, y con un chat REAL abierto (no el panel de perfil).
              </CardContent></Card>
            )}

            {unmatched > 0 && (
              <Card className="border-warn/40 bg-warn-soft/30"><CardContent className="p-3 text-sm text-foreground flex items-start gap-2">
                <AlertTriangle size={16} className="text-warn mt-0.5 shrink-0" />
                <span><b>{unmatched}</b> de las ingestas recientes no se cruzaron con ninguna persona (el nombre del hilo no matchea un contacto cargado). Esa data queda como observación suelta, sin alimentar la ficha de nadie.</span>
              </CardContent></Card>
            )}

            {/* ═══ ESTADO DE LOS CANALES ═══════════════════════════════════════
                Aaron pidió esto el 4-ago-2026: *"se me ocurre crear una sección de
                estatus en SIR que se sincronice con la extensión"*. Casi todo estaba
                escrito y huérfano — `lectorVivo`/`probeLine` solo vivían en sus tests
                y la columna `probe` se escribía sin que nadie la leyera. Y esta página
                no consultaba `reader_heartbeats`, así que contaba una historia
                distinta a la del brief. Ahora los dos usan `diagnoseChannel`. */}
            {(data.canales?.length ?? 0) > 0 && (
              <Card><CardContent className="p-4 space-y-3">
                <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Estado de los canales</div>
                {data.canales!.map((c) => {
                  const v = VEREDICTO[c.kind] ?? VEREDICTO.nunca_visto
                  return (
                    <div key={c.channel} className="border-b border-border/40 last:border-0 pb-3 last:pb-0 space-y-1">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium capitalize text-sm">{c.channel}</span>
                        <span className={`text-[12px] font-medium ${v.cls}`}>{v.label}</span>
                      </div>
                      <div className="text-[12px] text-muted-foreground tabular-nums">
                        latido {freshness(c.lastBeatAt).label} · data {freshness(c.lastDataAt).label}
                        {c.extVersion ? ` · v${c.extVersion}` : ''}
                        {c.sentCount != null ? ` · ${c.sentCount.toLocaleString('es')} enviados` : ''}
                      </div>

                      {/* ¿Está LEYENDO, no solo abierto? Esta es la distinción que el
                          latido no puede hacer: `status:'ok'` significa "hay una pestaña
                          abierta", no "el lector produce". */}
                      {c.probeLine && (
                        <div className={`text-[12px] ${c.lectorVivo === true ? 'text-good' : c.lectorVivo === false ? 'text-bad' : 'text-muted-foreground'}`}>
                          {c.probeLine}
                        </div>
                      )}

                      {/* La verdad incómoda, dicha en vez de insinuada. */}
                      {!c.tieneDiagnostico && (
                        <div className="text-[12px] text-warn flex items-start gap-1.5">
                          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                          <span>
                            Este canal <b>no puede autodiagnosticarse</b>: su lector es pasivo (captura solo cuando
                            navegas {c.channel} en esa PC) y no tiene probe de salud. Si no trae nada, no se puede
                            saber si es falta de uso o que se rompió.
                          </span>
                        </div>
                      )}

                      {c.lastError && (
                        <div className="text-[12px] text-bad">último error: {c.lastError}</div>
                      )}
                    </div>
                  )
                })}
              </CardContent></Card>
            )}

            {/* Por plataforma */}
            {platforms.length > 0 && (
              <Card><CardContent className="p-4 space-y-2">
                <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary mb-1">Por plataforma</div>
                {platforms.map(([plat, p]) => {
                  const f = freshness(p.lastIngestAt)
                  return (
                    <div key={plat} className="flex items-center justify-between gap-3 text-sm border-b border-border/40 last:border-0 py-1.5">
                      <span className="font-medium capitalize">{plat}</span>
                      <span className="text-muted-foreground text-[13px]">{p.threads} hilos · {p.messages} msgs · {p.matched}/{p.observations} cruzados</span>
                      <span className={`text-[12px] tabular-nums ${f.cls}`}>{f.label}</span>
                    </div>
                  )
                })}
              </CardContent></Card>
            )}

            {/* Hilos */}
            {data.threads.length > 0 && (
              <Card><CardContent className="p-4">
                <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary mb-2">Hilos seguidos</div>
                <ul className="space-y-1.5">
                  {data.threads.map((t, i) => {
                    const f = freshness(t.lastIngestAt)
                    return (
                      <li key={i} className="flex items-center justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate"><span className="text-muted-foreground text-[11px] capitalize mr-1.5">{t.platform}</span>{t.threadName}</span>
                        <span className={`text-[12px] tabular-nums shrink-0 ${f.cls}`}>{f.label}</span>
                      </li>
                    )
                  })}
                </ul>
              </CardContent></Card>
            )}

            {/* Ingestas recientes */}
            {data.recent.length > 0 && (
              <Card><CardContent className="p-4">
                <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary mb-2">Ingestas recientes</div>
                <ul className="space-y-1.5">
                  {data.recent.map((r, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 text-[13px]">
                      <span className="min-w-0 truncate flex items-center gap-1.5">
                        {r.matched
                          ? <CheckCircle2 size={13} className="text-good shrink-0" aria-label="cruzado con persona" />
                          : <AlertTriangle size={13} className="text-warn shrink-0" aria-label="sin cruzar" />}
                        {r.threadName}
                      </span>
                      <span className="text-muted-foreground shrink-0 tabular-nums">{r.messageCount} msgs · {r.observedAt?.slice(0, 16).replace('T', ' ')}</span>
                    </li>
                  ))}
                </ul>
              </CardContent></Card>
            )}
          </>
        )}
      </main>
    </AppShell>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card><CardContent className="p-3">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </CardContent></Card>
  )
}
