'use client'
// SIR V2 — /consumo (#125). Dashboard del consumo PROPIO de IA de SIR (últimos
// 30 días): total + costo estimado, por feature y por día. La API de Anthropic
// NO expone saldo restante; esto es lo gastado POR SIR, para anticipar recargas.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Gauge } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'

interface Usage {
  total: { inputTokens: number; outputTokens: number; tokens: number; costUSD: number; calls: number }
  byFeature: { feature: string; input: number; output: number; cost: number; calls: number }[]
  byDay: { day: string; cost: number; tokens: number }[]
}
const FEATURE_LABEL: Record<string, string> = {
  import_whatsapp: 'Importar chats (WhatsApp)',
}
const fmtUSD = (n: number) => `US$ ${n.toFixed(n < 1 ? 3 : 2)}`
const fmtN = (n: number) => n.toLocaleString('es')

export default function ConsumoPage() {
  const [u, setU] = useState<Usage | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    void (async () => {
      try { const r = await fetch('/api/ai/usage'); if (r.ok) setU(await r.json()) } catch { /* */ } finally { setLoading(false) }
    })()
  }, [])

  return (
    <AppShell>
      <main className="mx-auto max-w-2xl px-4 py-6 space-y-6">
        <Link href="/panel" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={14} /> Mission Control
        </Link>
        <header className="space-y-1">
          <div className="flex items-center gap-2">
            <Gauge size={20} className="text-[#14b8a6]" />
            <h1 className="text-2xl font-semibold tracking-tight">Consumo de IA</h1>
          </div>
          <p className="text-sm text-muted-foreground">Lo que SIR gastó en IA los últimos 30 días. Costo <span className="font-medium">estimado</span> (la API no expone tu saldo; activá auto-reload en la consola de Anthropic para no quedarte sin créditos).</p>
        </header>

        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : !u || u.total.calls === 0 ? (
          <Card><CardContent className="p-5 text-sm text-muted-foreground">Todavía no hay consumo registrado. Se irá poblando a medida que SIR use IA (empezando por las importaciones).</CardContent></Card>
        ) : (
          <>
            <Card>
              <CardContent className="p-5">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-semibold">{fmtUSD(u.total.costUSD)}</div>
                    <div className="text-[11px] text-muted-foreground">costo estimado · 30 días</div>
                  </div>
                  <div>
                    <div className="text-2xl font-semibold">{fmtN(u.total.tokens)}</div>
                    <div className="text-[11px] text-muted-foreground">tokens ({fmtN(u.total.inputTokens)} in / {fmtN(u.total.outputTokens)} out)</div>
                  </div>
                  <div>
                    <div className="text-2xl font-semibold">{fmtN(u.total.calls)}</div>
                    <div className="text-[11px] text-muted-foreground">llamadas</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <h3 className="text-base font-semibold mb-3">Por función</h3>
                <ul className="space-y-2">
                  {u.byFeature.map((f) => (
                    <li key={f.feature} className="flex items-center justify-between text-sm">
                      <span>{FEATURE_LABEL[f.feature] ?? f.feature}</span>
                      <span className="text-muted-foreground">{fmtUSD(f.cost)} · {fmtN(f.input + f.output)} tok · {f.calls} llam.</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {u.byDay.length > 0 && (
              <Card>
                <CardContent className="p-5">
                  <h3 className="text-base font-semibold mb-3">Por día (últimos 14)</h3>
                  <ul className="space-y-1.5">
                    {u.byDay.map((d) => (
                      <li key={d.day} className="flex items-center justify-between text-[13px]">
                        <span className="text-muted-foreground">{d.day}</span>
                        <span>{fmtUSD(d.cost)} · {fmtN(d.tokens)} tok</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
            <p className="text-[11px] text-muted-foreground">Nota: por ahora se mide el gasto de la <span className="font-medium">importación de chats</span> (el grueso). Otras funciones se irán sumando al medidor.</p>
          </>
        )}
      </main>
    </AppShell>
  )
}
