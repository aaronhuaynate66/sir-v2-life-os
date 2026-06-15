'use client'
// SIR V2 — /scores · "Cómo se calcula". Página educativa autocontenida: explica
// las fórmulas REALES de los scores (relationalScore.ts + biological engine).
// No lee datos; es de referencia. Pedida por Aaron "para un futuro fixture".

import Link from 'next/link'
import { ArrowLeft, Calculator, Heart, Activity } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'

function Formula({ children }: { children: React.ReactNode }) {
  return (
    <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-black/30 px-3 py-2 text-[12px] leading-relaxed text-foreground/90 whitespace-pre-wrap font-mono">
      {children}
    </pre>
  )
}

function Section({ title, accent, children }: { title: string; accent?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-[15px] font-semibold" style={accent ? { color: accent } : undefined}>{title}</h3>
      <div className="text-[14px] leading-relaxed text-foreground/85">{children}</div>
    </div>
  )
}

export default function ScoresPage() {
  return (
    <AppShell>
      <main className="mx-auto max-w-2xl px-4 py-6 space-y-6">
        <Link href="/panel" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={14} /> Mission Control
        </Link>

        <header className="space-y-1">
          <div className="flex items-center gap-2">
            <Calculator size={20} className="text-[#14b8a6]" />
            <h1 className="text-2xl font-semibold tracking-tight">Cómo se calcula</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Qué hay detrás de cada número de SIR. Nada es magia ni IA: son fórmulas simples y predecibles
            sobre lo que vos registrás. Acá están, tal cual las usa el sistema.
          </p>
        </header>

        {/* ─── SCORE RELACIONAL ─── */}
        <Card>
          <CardContent className="p-4 sm:p-6 space-y-5">
            <div className="flex items-center gap-2">
              <Heart size={16} className="text-[#14b8a6]" />
              <h2 className="text-lg font-semibold">Salud del vínculo (relacional)</h2>
            </div>
            <p className="text-[14px] leading-relaxed text-foreground/85">
              Cada persona tiene un <strong>Global</strong> (0-100) que es el promedio de tres ejes. Todos
              van de 0 a 100.
            </p>

            <Section title="Fuerza" accent="#14b8a6">
              Cuánto pesa la persona en tu vida, ajustado por qué tan reciente fue el último contacto.
              <Formula>{`Fuerza = importancia (1-10) × 10
        + 10  si el último contacto fue hace < 14 días
         0    entre 14 y 60 días
        − 10  si > 60 días, o si no hay contacto registrado
(recortado a 0–100)`}</Formula>
            </Section>

            <Section title="Reciprocidad" accent="#14b8a6">
              El tono acumulado de tus interacciones. Arranca neutra (50) y se mueve con cada interacción que
              registrás (a mano o que SIR infiere de una captura). Si nunca registraste ninguna, queda
              <em> sin dato</em> (no inventa un número).
              <Formula>{`Por cada interacción (calidad 1-5):
  calidad 1 → −5     calidad 4 → +3
  calidad 2 → −2     calidad 5 → +6
  calidad 3 →  0
Cada paso se suma como round(delta × 0.6) sobre 50 (recortado 0–100).`}</Formula>
              Romper confianza es más rápido que reconstruirla: una mala interacción baja más de lo que una
              buena sube.
            </Section>

            <Section title="Confianza" accent="#14b8a6">
              Cuánto confiás en la persona. Es directo, sin ajustes.
              <Formula>{`Confianza = confianza (1-10) × 10`}</Formula>
            </Section>

            <Section title="Global" accent="#14b8a6">
              <Formula>{`Global = promedio de (Fuerza, Confianza, y Reciprocidad si tiene dato)`}</Formula>
              Si la Reciprocidad está sin dato, el Global promedia solo Fuerza y Confianza.
            </Section>

            <Section title="Bandas de color">
              <div className="mt-1 flex flex-col gap-1.5 text-[13px]">
                <span className="flex items-center gap-2"><Dot c="#2dd4a7" /> <strong>Sólido</strong> · 70 o más</span>
                <span className="flex items-center gap-2"><Dot c="#e0a93b" /> <strong>A cuidar</strong> · entre 40 y 69</span>
                <span className="flex items-center gap-2"><Dot c="#e5564c" /> <strong>En riesgo</strong> · menos de 40</span>
              </div>
            </Section>
          </CardContent>
        </Card>

        {/* ─── SALUD / RECUPERACIÓN ─── */}
        <Card>
          <CardContent className="p-4 sm:p-6 space-y-5">
            <div className="flex items-center gap-2">
              <Activity size={16} className="text-[#14b8a6]" />
              <h2 className="text-lg font-semibold">Recuperación (biológico)</h2>
            </div>

            <Section title="Score de recuperación (0-10)">
              Combina tu energía, tu estrés y tu sueño de los últimos días.
              <Formula>{`Recuperación = energía × 0.35
             + (10 − estrés) × 0.30
             + min(sueño_promedio / 8 × 10, 10) × 0.35`}</Formula>
              La energía es el promedio de tus últimos 3 registros (si no hay, asume 6).
            </Section>

            <Section title="Deuda de sueño">
              Cuántas horas te faltaron respecto de 7.5 h por noche, en los últimos 7 registros.
              <Formula>{`Deuda = máx(0, (7.5 − sueño_promedio) × noches_registradas)`}</Formula>
            </Section>

            <Section title="Alertas de FC elevada">
              No es un score: es un conteo de los días en que tu reloj marcó FC elevada sostenida (~10 min en
              reposo). Las ves en el panel de Salud. Señal de activación —probablemente estrés, no exclusivamente.
            </Section>
          </CardContent>
        </Card>

        <p className="text-[12px] text-muted-foreground">
          Estas fórmulas pueden afinarse con el tiempo. Si un número no te cuadra, casi siempre es porque
          falta registrar algo (una interacción, el último contacto, una noche de sueño).
        </p>
      </main>
    </AppShell>
  )
}

function Dot({ c }: { c: string }) {
  return <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: c }} />
}
