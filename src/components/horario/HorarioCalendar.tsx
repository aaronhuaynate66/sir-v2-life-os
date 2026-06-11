'use client'

// SIR V2 — HorarioCalendar: la agenda semanal (cockpit visual).
//
// Port fiel del diseño aprobado en Claude Design (artboard "Horario"), adaptado
// a SIR: tokens reales (scopeados bajo .sir-horario en globals.css), reloj en
// vivo propio (tick 1s) y datos reales vía el adapter (lib/horario/calendarBoard).
//
// Tres vistas conmutables:
//   - Semana (board): 7 columnas de agenda, sin horas vacías, ancladas a HOY
//     (ventana rodante hoy..+6) — el feed de calendario es forward-only (60d).
//   - Grilla: 7×24 con eje de tiempo ELÁSTICO (colapsa la madrugada/huecos).
//   - Día (spine): el día como un riel vertical; el tiempo libre es de 1ra clase.
//
// El layout es 1:1 con el prototipo; lo único que cambia es el origen de datos
// y el anclaje rodante. CI no valida render → requiere una mirada en prod.

import { useState, useEffect, useRef, useMemo, type CSSProperties, type ReactNode } from 'react'
import type { BoardEvent, BoardOrigin } from '@/lib/horario/calendarBoard'
import { ORIGIN_LABEL, presentOrigins } from '@/lib/horario/calendarBoard'

/* ── date utils (local, sin sorpresas de TZ) ── */
const DOW = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']
const DOW_FULL = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
const MON = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MON_FULL = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const pad2 = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
const parseYmd = (s: string) => { const [y, m, dd] = s.split('-').map(Number); return new Date(y, m - 1, dd) }
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const dowMon = (d: Date) => (d.getDay() + 6) % 7
const mondayOf = (d: Date) => addDays(d, -dowMon(d))
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const fmtT = (min: number) => `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`
const sameDay = (a: Date, b: Date) => ymd(a) === ymd(b)
const fmtDur = (min: number) => { const h = Math.floor(min / 60), m = min % 60; return `${h ? `${h} h` : ''}${m ? ` ${m} min` : ''}`.trim() }

type Origin = BoardOrigin
type Ev = BoardEvent
const ORIGIN_VAR: Record<Origin, string> = { cal: '--o-cal', date: '--o-date', task: '--o-task', health: '--o-health' }
const ORIGIN_SOFT: Record<Origin, string> = { cal: '--o-cal-soft', date: '--o-date-soft', task: '--o-task-soft', health: '--o-health-soft' }
const ORIGIN_TXT: Record<Origin, string> = { cal: '--o-cal-text', date: '--o-date-text', task: '--o-task-text', health: '--o-health-text' }
const ORIGIN_ICON: Record<Origin, string> = { cal: 'cal', date: 'gift', task: 'task', health: 'pulse' }

/* ── layout constants ── */
const L = { header: 40, gHeader: 18, nnB: 184, gNN: 18, filters: 30, gFilters: 16, calHead: 50, allDay: 60, gutter: 56 }
const MOMENT_MAX = 45
const MOMENT_H = 24
const EV_MIN_H = 26
const RAIL_X = 70
const clamp2: CSSProperties = { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word' }

/* ── icons (lucide-ish) ── */
function Icon({ n, s = 16, sw = 1.6, style }: { n: string; s?: number; sw?: number; style?: CSSProperties }) {
  const p: Record<string, string> = {
    chevL: 'M15 18l-6-6 6-6', chevR: 'M9 18l6-6-6-6',
    arrowR: 'M5 12h14M12 5l7 7-7 7', x: 'M18 6L6 18M6 6l12 12',
    pulse: 'M22 12h-4l-2.5 7-5-16L8 12H2',
  }
  const common = { width: s, height: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: sw, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, style }
  if (n === 'cal') return (<svg {...common}><rect x="3" y="4.5" width="18" height="16" rx="2" /><path d="M3 9h18M8 2.5v4M16 2.5v4" /></svg>)
  if (n === 'gift') return (<svg {...common}><path d="M20 12v9H4v-9M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" /></svg>)
  if (n === 'task') return (<svg {...common}><path d="M9 11l3 3 8-8M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>)
  if (n === 'pulse') return (<svg {...common}><path d={p.pulse} /></svg>)
  if (n === 'clock') return (<svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>)
  if (n === 'pin') return (<svg {...common}><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" /><circle cx="12" cy="10" r="2.6" /></svg>)
  return (<svg {...common}><path d={p[n] || ''} /></svg>)
}

/* ── now / next derivation ── */
interface NextHit { e: Ev; dt: Date }
interface NowState { current: Ev | null; next: NextHit | null; frac: number; nowMin: number; today: string }
function deriveNow(events: Ev[], now: Date): NowState {
  const today = ymd(now)
  const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60
  const timed = events.filter((e) => !e.allDay)
  const todays = timed.filter((e) => e.date === today).sort((a, b) => a.s - b.s)
  const current = todays.find((e) => e.s <= nowMin && nowMin < e.e) || null

  const withDt: NextHit[] = timed.map((e) => {
    const d = parseYmd(e.date)
    return { e, dt: new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(e.s / 60), e.s % 60) }
  }).filter((x) => x.dt.getTime() > now.getTime()).sort((a, b) => a.dt.getTime() - b.dt.getTime())
  const next = withDt[0] || null

  let base: Date
  const finished = todays.filter((e) => e.e <= nowMin)
  if (finished.length) { const last = finished[finished.length - 1]; base = new Date(now); base.setHours(Math.floor(last.e / 60), last.e % 60, 0, 0) }
  else { base = new Date(now); base.setHours(now.getHours() - 1, now.getMinutes(), 0, 0) }
  let frac = 0
  if (next) { const span = next.dt.getTime() - base.getTime(); frac = span > 0 ? Math.min(1, Math.max(0, (now.getTime() - base.getTime()) / span)) : 1 }
  return { current, next, frac, nowMin, today }
}
function fmtCountdown(ms: number) {
  const tot = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(tot / 3600), m = Math.floor((tot % 3600) / 60), s = tot % 60
  return { h, m, s, clock: `${pad2(h)}:${pad2(m)}:${pad2(s)}` }
}
function whenLabel(dt: Date, now: Date) {
  const d0 = new Date(now); d0.setHours(0, 0, 0, 0)
  const diff = Math.round((new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime() - d0.getTime()) / 86400000)
  const t = fmtT(dt.getHours() * 60 + dt.getMinutes())
  if (diff === 0) return `hoy ${t}`
  if (diff === 1) return `mañana ${t}`
  return `${DOW[dowMon(dt)]} ${dt.getDate()} ${MON[dt.getMonth()]} · ${t}`
}

/* ── Now / Próximo block (variant B — "Foco") ── */
function NowNext({ variant, nowState, now }: { variant: 'A' | 'B'; nowState: NowState; now: Date }) {
  const { current, next } = nowState
  const cd = next ? fmtCountdown(next.dt.getTime() - now.getTime()) : null

  const CurrentLine = () => (
    current
      ? (<div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: `var(${ORIGIN_VAR[current.origin]})`, flex: '0 0 auto' }} />
          <span style={{ fontSize: variant === 'B' ? 19 : 16, fontWeight: 500, color: 'var(--fg1)', letterSpacing: -0.2 }}>{current.title}</span>
          <span className="mono" style={{ fontSize: 12.5, color: 'var(--fg3)' }}>{fmtT(current.s)}–{fmtT(current.e)}</span>
        </div>)
      : (<div style={{ fontSize: variant === 'B' ? 19 : 16, fontWeight: 500, color: 'var(--fg2)', letterSpacing: -0.2 }}>Sin bloque activo. Espacio libre.</div>)
  )

  if (variant === 'A') {
    return (
      <div style={{ height: 128, display: 'flex', alignItems: 'stretch', background: 'var(--s1)', border: '.5px solid var(--border)', borderRadius: 'var(--r-card)', overflow: 'hidden' }}>
        <div style={{ flex: '1 1 0', padding: '18px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 9 }}>
          <div className="eyebrow">Ahora</div>
          <CurrentLine />
        </div>
        <div style={{ width: '.5px', background: 'var(--border)' }} />
        <div style={{ flex: '1 1 0', padding: '18px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 9 }}>
          <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>Próximo
            {next && <span className="mono" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--brand-text)' }}>· {whenLabel(next.dt, now)}</span>}
          </div>
          {next && cd ? (
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }}>
              <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--fg1)', letterSpacing: -0.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{next.e.title}</span>
              <span className="mono" style={{ fontSize: 22, fontWeight: 500, color: 'var(--brand)', flex: '0 0 auto' }}>{cd.clock}</span>
            </div>
          ) : <div style={{ fontSize: 16, color: 'var(--fg2)' }}>Nada agendado.</div>}
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: L.nnB, display: 'flex', flexDirection: 'column', background: 'var(--s1)', border: '.5px solid var(--border)', borderRadius: 'var(--r-card)', padding: '20px 24px', gap: 14 }}>
      <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start', flex: 1 }}>
        <div style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div className="eyebrow">Ahora</div>
          <CurrentLine />
          {next && (
            <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 9, color: 'var(--fg2)', fontSize: 13.5 }}>
              <span style={{ width: 7, height: 7, borderRadius: 3, background: `var(${ORIGIN_VAR[next.e.origin]})`, flex: '0 0 auto' }} />
              <span style={{ color: 'var(--fg1)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{next.e.title}</span>
              <span className="mono" style={{ color: 'var(--fg3)' }}>· {whenLabel(next.dt, now)}</span>
            </div>
          )}
        </div>
        <div style={{ flex: '0 0 auto', textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <div className="eyebrow">{next ? 'Empieza en' : 'Agenda'}</div>
          {next && cd
            ? <div className="mono" style={{ fontSize: 44, fontWeight: 500, color: 'var(--brand)', lineHeight: 1, letterSpacing: -1 }}>{cd.clock}</div>
            : <div style={{ fontSize: 22, fontWeight: 500, color: 'var(--fg2)' }}>Libre</div>}
          {next && cd && <div className="mono" style={{ fontSize: 12, color: 'var(--fg3)' }}>{cd.h > 0 ? `${cd.h} h ${pad2(cd.m)} min de aire` : `${cd.m} min ${pad2(cd.s)} s`}</div>}
        </div>
      </div>
      {next && (
        <div style={{ height: 6, borderRadius: 999, background: 'var(--s3)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.round(nowState.frac * 100)}%`, background: 'var(--brand)', borderRadius: 999, transition: 'width 1s linear' }} />
        </div>
      )}
    </div>
  )
}

/* ── event block in the grid ── */
function EventBlock({ ev, top, height, onClick }: { ev: Ev; top: number; height: number; onClick: () => void }) {
  const h = Math.max(height, EV_MIN_H)
  const compact = h < 46
  return (
    <button onClick={onClick} title={`${ev.title} · ${fmtT(ev.s)}–${fmtT(ev.e)}`}
      style={{
        position: 'absolute', left: 3, right: 3, top, height: h,
        textAlign: 'left', border: 'none', cursor: 'pointer', overflow: 'hidden',
        borderRadius: 7, padding: compact ? '0 9px' : '5px 9px',
        background: `var(${ORIGIN_SOFT[ev.origin]})`,
        boxShadow: `inset 2px 0 0 var(${ORIGIN_VAR[ev.origin]})`,
        color: `var(${ORIGIN_TXT[ev.origin]})`,
        display: 'flex', flexDirection: compact ? 'row' : 'column',
        gap: compact ? 8 : 1, alignItems: compact ? 'center' : 'stretch',
        fontFamily: 'var(--sans)', lineHeight: 1.2,
      }}>
      <span style={{ flex: compact ? '1 1 auto' : '0 0 auto', minWidth: 0, fontSize: 12.5, fontWeight: 500, color: 'var(--fg1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.title}</span>
      <span className="mono" style={{ flex: '0 0 auto', fontSize: 11, opacity: .9 }}>{compact ? fmtT(ev.s) : `${fmtT(ev.s)}–${fmtT(ev.e)}`}</span>
    </button>
  )
}

function MomentPill({ ev, top, onClick }: { ev: Ev; top: number; onClick: () => void }) {
  return (
    <button onClick={onClick} title={`${ev.title} · ${fmtT(ev.s)}–${fmtT(ev.e)}`}
      style={{
        position: 'absolute', left: 3, right: 3, top, height: MOMENT_H, zIndex: 3,
        textAlign: 'left', cursor: 'pointer', overflow: 'hidden',
        display: 'flex', alignItems: 'center', gap: 8, padding: '0 9px 0 8px',
        border: '.5px solid var(--border-strong)', borderRadius: 999,
        background: 'var(--s2)', fontFamily: 'var(--sans)',
      }}>
      <span style={{ flex: '0 0 auto', width: 7, height: 7, borderRadius: 4, background: `var(${ORIGIN_VAR[ev.origin]})` }} />
      <span className="mono" style={{ flex: '0 0 auto', fontSize: 11, fontWeight: 500, color: 'var(--fg2)' }}>{fmtT(ev.s)}</span>
      <span style={{ flex: '1 1 auto', minWidth: 0, fontSize: 12.5, fontWeight: 500, color: 'var(--fg1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.title}</span>
    </button>
  )
}

/* ── detail overlay ── */
function Row({ icon, text, mono }: { icon: string; text: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--fg2)' }}>
      <span style={{ color: 'var(--fg3)', flex: '0 0 auto', display: 'flex' }}><Icon n={icon} s={15} sw={1.6} /></span>
      <span className={mono ? 'mono' : ''} style={{ fontSize: 13.5 }}>{text}</span>
    </div>
  )
}
function Detail({ ev, onClose }: { ev: Ev | null; onClose: () => void }) {
  if (!ev) return null
  const d = parseYmd(ev.date)
  const dateLong = `${DOW_FULL[dowMon(d)]} ${d.getDate()} ${MON_FULL[d.getMonth()]}`
  const cta = { cal: ev.loc ? 'Unirse' : 'Ver evento', date: 'Escribíle para saludar', task: 'Abrir tarea', health: 'Ver en Salud' }[ev.origin]
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 380, maxWidth: '100%', background: 'var(--s1)', border: '.5px solid var(--border-strong)', borderRadius: 'var(--r-card)', padding: 22 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 24, padding: '0 9px', borderRadius: 7, fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.06em', background: `var(${ORIGIN_SOFT[ev.origin]})`, color: `var(${ORIGIN_TXT[ev.origin]})` }}>
            <Icon n={ORIGIN_ICON[ev.origin]} s={13} sw={1.7} />{ORIGIN_LABEL[ev.origin]}
          </span>
          <button onClick={onClose} className="btn btn-icon" style={{ width: 30, height: 30, flex: '0 0 auto' }}><Icon n="x" s={15} /></button>
        </div>
        <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--fg1)', letterSpacing: -0.3, marginBottom: 12 }}>{ev.title}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: ev.note ? 16 : 18 }}>
          <Row icon="cal" text={dateLong} />
          <Row icon="clock" text={ev.allDay ? 'Todo el día' : `${fmtT(ev.s)} – ${fmtT(ev.e)}`} mono />
          {ev.loc && <Row icon="pin" text={ev.loc} />}
        </div>
        {ev.note && <div style={{ fontSize: 13.5, color: 'var(--fg2)', lineHeight: 1.55, background: 'var(--s2)', border: '.5px solid var(--border)', borderRadius: 9, padding: '11px 13px', marginBottom: 18 }}>{ev.note}</div>}
        <button className="btn btn-pri" style={{ width: '100%', height: 38 }}>{cta}<Icon n="arrowR" s={15} /></button>
      </div>
    </div>
  )
}

/* ── elastic time axis ── */
interface Seg { type: 'gap' | 'act'; s: number; e: number; collapse: boolean; y0: number; h: number }
interface Scale { mapped: Seg[]; total: number; scale: (min: number) => number; lo: number; hi: number }
function buildScale(events: Ev[], rs: number, re: number, pxMin: number): Scale {
  const lo = rs * 60, hi = re * 60
  const PAD = 30, COLLAPSE = 75, BAND = 46
  const ivs = events.map((e) => [Math.max(lo, e.s - PAD), Math.min(hi, e.e + PAD)] as [number, number])
    .filter((iv) => iv[1] > iv[0]).sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  ivs.forEach((iv) => { const last = merged[merged.length - 1]; if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]); else merged.push([iv[0], iv[1]]) })
  const segs: { type: 'gap' | 'act'; s: number; e: number }[] = []; let cur = lo
  merged.forEach(([a, b]) => { if (a > cur) segs.push({ type: 'gap', s: cur, e: a }); segs.push({ type: 'act', s: a, e: b }); cur = b })
  if (cur < hi) segs.push({ type: 'gap', s: cur, e: hi })
  if (!segs.length) segs.push({ type: 'act', s: lo, e: hi })
  let y = 0; const mapped: Seg[] = []
  segs.forEach((sg) => {
    const collapse = sg.type === 'gap' && (sg.e - sg.s) >= COLLAPSE
    const h = collapse ? BAND : (sg.e - sg.s) * pxMin
    mapped.push({ ...sg, collapse, y0: y, h }); y += h
  })
  const scale = (min: number) => {
    const m = mapped.find((s) => min <= s.e) || mapped[mapped.length - 1]
    if (!m) return 0
    if (min <= m.s) return m.y0
    return m.collapse ? m.y0 + ((min - m.s) / (m.e - m.s)) * m.h : m.y0 + (min - m.s) * pxMin
  }
  return { mapped, total: y, scale, lo, hi }
}

/* ── Día: week strip ── */
function WeekStrip({ selDate, now, visible, onPick }: { selDate: Date; now: Date; visible: Ev[]; onPick: (d: Date) => void }) {
  const ws = mondayOf(selDate)
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i))
  const mins = days.map((d) => visible.filter((e) => !e.allDay && e.date === ymd(d)).reduce((a, e) => a + (e.e - e.s), 0))
  const maxMin = Math.max(...mins, 60)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, marginBottom: 14 }}>
      {days.map((d, i) => {
        const isSel = sameDay(d, selDate), isToday = sameDay(d, now)
        const dots = visible.filter((e) => e.allDay && e.date === ymd(d))
        return (
          <button key={i} onClick={() => onPick(d)}
            style={{
              height: 62, borderRadius: 'var(--r-ctrl)', cursor: 'pointer', fontFamily: 'var(--sans)',
              border: isSel ? '1px solid var(--brand)' : '.5px solid var(--border)',
              background: isSel ? 'var(--brand-soft-20)' : 'var(--s1)',
              boxShadow: isSel ? '0 0 0 2px var(--brand-soft)' : 'none',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
              transition: 'border-color .15s, background .15s',
            }}>
            <span style={{ fontSize: 9.5, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.08em', color: isToday ? 'var(--brand-text)' : 'var(--fg3)' }}>{DOW[dowMon(d)]}</span>
            <span className="mono" style={{ fontSize: 15, fontWeight: 500, color: 'var(--fg1)', lineHeight: 1 }}>{d.getDate()}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, height: 4 }}>
              <span style={{ width: 24, height: 3, borderRadius: 999, background: 'var(--s3)', overflow: 'hidden', display: 'block' }}>
                <span style={{ display: 'block', height: '100%', width: `${Math.round((mins[i] / maxMin) * 100)}%`, background: isSel ? 'var(--brand)' : 'var(--fg3)', borderRadius: 999 }} />
              </span>
              {dots.map((e) => <span key={e.id} style={{ width: 4, height: 4, borderRadius: 2, background: `var(${ORIGIN_VAR[e.origin]})` }} />)}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/* ── Día: spine ── */
function SpineTime({ min, color }: { min: number; color?: string }) {
  return <span className="mono" style={{ position: 'absolute', left: 0, width: RAIL_X - 16, textAlign: 'right', top: '50%', transform: 'translateY(-50%)', fontSize: 11.5, fontWeight: 500, color: color || 'var(--fg3)' }}>{fmtT(min)}</span>
}
function SpineNode({ color, size = 9, pulse }: { color: string; size?: number; pulse?: boolean }) {
  return <span className={pulse ? 'pulse' : ''} style={{ position: 'absolute', left: RAIL_X - size / 2, top: '50%', transform: 'translateY(-50%)', width: size, height: size, borderRadius: size, background: color, zIndex: 2 }} />
}
function NowRow({ nowMin }: { nowMin: number }) {
  return (
    <div style={{ position: 'relative', height: 30, display: 'flex', alignItems: 'center', paddingLeft: RAIL_X + 16 }}>
      <SpineTime min={nowMin} color="var(--bad)" />
      <SpineNode color="var(--bad)" pulse />
      <div style={{ flex: 1, borderTop: '1.5px solid var(--bad)' }} />
      <span style={{ marginLeft: 10, fontSize: 10.5, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--bad)' }}>ahora</span>
    </div>
  )
}
function GapRow({ label, dim, accent }: { label: string; dim?: boolean; accent?: boolean }) {
  return (
    <div style={{ position: 'relative', height: 38, display: 'flex', alignItems: 'center', paddingLeft: RAIL_X + 16, opacity: dim ? .45 : 1 }}>
      <span className="mono" style={{ fontSize: 11, color: accent ? 'var(--brand-text)' : 'var(--fg3)' }}>{label}</span>
    </div>
  )
}
function SpineEvent({ ev, live, past, nowMin, onSelect }: { ev: Ev; live?: boolean; past?: boolean; nowMin: number; onSelect: (e: Ev) => void }) {
  const isMoment = (ev.e - ev.s) < MOMENT_MAX
  if (isMoment) {
    return (
      <div style={{ position: 'relative', padding: `4px 0 4px ${RAIL_X + 16}px`, opacity: past ? .45 : 1 }}>
        <SpineTime min={ev.s} />
        <SpineNode color={`var(${ORIGIN_VAR[ev.origin]})`} size={8} />
        <button onClick={() => onSelect(ev)} title={`${ev.title} · ${fmtT(ev.s)}–${fmtT(ev.e)}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 26, padding: '0 11px', maxWidth: '100%', border: '.5px solid var(--border-strong)', borderRadius: 999, background: 'var(--s2)', cursor: 'pointer', fontFamily: 'var(--sans)' }}>
          <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--fg1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.title}</span>
        </button>
      </div>
    )
  }
  return (
    <div style={{ position: 'relative', padding: `5px 0 5px ${RAIL_X + 16}px`, opacity: past ? .45 : 1 }}>
      <SpineTime min={ev.s} color={live ? 'var(--brand-text)' : undefined} />
      <SpineNode color={`var(${ORIGIN_VAR[ev.origin]})`} size={live ? 11 : 9} />
      <button onClick={() => onSelect(ev)}
        style={{
          width: '100%', maxWidth: 620, textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--sans)',
          background: live ? 'var(--brand-soft)' : 'var(--s2)',
          border: live ? '1px solid var(--brand)' : '.5px solid var(--border)',
          boxShadow: live ? '0 0 0 2px var(--brand-soft)' : 'none',
          borderRadius: 10, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 4,
        }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ flex: '0 1 auto', minWidth: 0, fontSize: 14, fontWeight: 500, color: 'var(--fg1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.title}</span>
          <span className="mono" style={{ flex: '0 0 auto', fontSize: 10.5, padding: '1px 7px', borderRadius: 6, background: `var(${ORIGIN_SOFT[ev.origin]})`, color: `var(${ORIGIN_TXT[ev.origin]})` }}>{fmtDur(ev.e - ev.s)}</span>
          {live && <span className="mono" style={{ flex: '0 0 auto', fontSize: 11, color: 'var(--brand-text)' }}>en curso · quedan {fmtDur(ev.e - nowMin)}</span>}
        </span>
        <span className="mono" style={{ fontSize: 11.5, color: 'var(--fg3)' }}>{fmtT(ev.s)}–{fmtT(ev.e)}{ev.loc ? ` · ${ev.loc}` : ''}</span>
      </button>
    </div>
  )
}
interface Row2 { type: 'gap' | 'ev'; s: number; e: number; ev?: Ev; live?: boolean }
function SpineDay({ date, dayEvents, now, onSelect }: { date: Date; dayEvents: Ev[]; now: Date; onSelect: (e: Ev) => void }) {
  const isToday = sameDay(date, now)
  const dayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const isPastDay = !isToday && date < dayMid
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const allday = dayEvents.filter((e) => e.allDay)
  const timed = dayEvents.filter((e) => !e.allDay).sort((a, b) => a.s - b.s)

  const rows: Row2[] = []
  let prevEnd: number | null = null
  timed.forEach((e) => {
    if (prevEnd != null && e.s - prevEnd >= 20) rows.push({ type: 'gap', s: prevEnd, e: e.s })
    rows.push({ type: 'ev', ev: e, s: e.s, e: e.e })
    prevEnd = prevEnd == null ? e.e : Math.max(prevEnd, e.e)
  })
  let insertAt = -1
  if (isToday) {
    let placed = false
    for (let i = 0; i < rows.length; i++) {
      if (nowMin < rows[i].s) { insertAt = i; placed = true; break }
      if (nowMin >= rows[i].s && nowMin < rows[i].e) { rows[i].live = true; placed = true; break }
    }
    if (!placed) insertAt = rows.length
  }

  const out: ReactNode[] = []
  rows.forEach((r, i) => {
    if (insertAt === i) out.push(<NowRow key={'now' + i} nowMin={nowMin} />)
    if (r.type === 'gap') {
      if (r.live) {
        if (nowMin - r.s >= 12) out.push(<GapRow key={'ga' + i} dim label={`${fmtDur(nowMin - r.s)} libre`} />)
        out.push(<NowRow key={'nowg' + i} nowMin={nowMin} />)
        out.push(<GapRow key={'gb' + i} accent label={`quedan ${fmtDur(r.e - nowMin)} libres`} />)
      } else {
        out.push(<GapRow key={'g' + i} dim={isPastDay || (isToday && r.e <= nowMin)} label={`${fmtDur(r.e - r.s)} libre`} />)
      }
    } else if (r.ev) {
      out.push(<SpineEvent key={r.ev.id} ev={r.ev} live={r.live} past={isPastDay || (isToday && r.e <= nowMin && !r.live)} nowMin={nowMin} onSelect={onSelect} />)
    }
  })
  if (insertAt === rows.length) out.push(<NowRow key="nowend" nowMin={nowMin} />)

  return (
    <div style={{ padding: '18px 22px 22px' }}>
      {allday.length > 0 && (
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingLeft: RAIL_X + 16, minHeight: 30, marginBottom: 10 }}>
          <span className="eyebrow" style={{ position: 'absolute', left: 0, width: RAIL_X - 16, textAlign: 'right', fontSize: 9 }}>Todo el día</span>
          {allday.map((e) => (
            <button key={e.id} onClick={() => onSelect(e)} title={e.title}
              style={{ textAlign: 'left', border: 'none', cursor: 'pointer', borderRadius: 6, padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 7, background: `var(${ORIGIN_SOFT[e.origin]})`, color: `var(${ORIGIN_TXT[e.origin]})`, boxShadow: `inset 2px 0 0 var(${ORIGIN_VAR[e.origin]})`, fontFamily: 'var(--sans)' }}>
              <Icon n={ORIGIN_ICON[e.origin]} s={13} sw={1.7} style={{ flex: '0 0 auto' }} />
              <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--fg1)' }}>{e.title}</span>
            </button>
          ))}
        </div>
      )}
      {rows.length > 0 ? (
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: RAIL_X, top: 10, bottom: 10, borderLeft: '.5px solid var(--border)' }} />
          {out}
        </div>
      ) : (
        <div style={{ padding: `26px 0 14px ${RAIL_X + 16}px`, fontSize: 14, color: 'var(--fg2)' }}>
          Nada agendado. Espacio libre todo el día.
          {isToday && <NowRow nowMin={nowMin} />}
        </div>
      )}
    </div>
  )
}

/* ── Semana: board ── */
function NowDivider({ nowMin }: { nowMin: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '2px 0' }}>
      <span className="pulse" style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--bad)', flex: '0 0 auto' }} />
      <span style={{ flex: 1, borderTop: '1.5px solid var(--bad)' }} />
      <span className="mono" style={{ fontSize: 9.5, color: 'var(--bad)', fontWeight: 500 }}>{fmtT(nowMin)}</span>
    </div>
  )
}
function BoardItem({ ev, live, past, nowMin, onSelect }: { ev: Ev; live?: boolean; past?: boolean; nowMin?: number; onSelect: (e: Ev) => void }) {
  if (ev.allDay) {
    return (
      <button onClick={() => onSelect(ev)} title={ev.title}
        style={{ textAlign: 'left', border: 'none', cursor: 'pointer', borderRadius: 6, padding: '5px 8px', display: 'flex', alignItems: 'flex-start', gap: 6, background: `var(${ORIGIN_SOFT[ev.origin]})`, color: `var(${ORIGIN_TXT[ev.origin]})`, boxShadow: `inset 2px 0 0 var(${ORIGIN_VAR[ev.origin]})`, fontFamily: 'var(--sans)', opacity: past ? .5 : 1, overflow: 'hidden' }}>
        <Icon n={ORIGIN_ICON[ev.origin]} s={12} sw={1.7} style={{ flex: '0 0 auto' }} />
        <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--fg1)', lineHeight: 1.25, ...clamp2 }}>{ev.title}</span>
      </button>
    )
  }
  if ((ev.e - ev.s) < MOMENT_MAX) {
    return (
      <button onClick={() => onSelect(ev)} title={`${ev.title} · ${fmtT(ev.s)}–${fmtT(ev.e)}`}
        style={{ textAlign: 'left', cursor: 'pointer', height: 24, flex: '0 0 auto', padding: '0 8px', display: 'flex', alignItems: 'center', gap: 6, border: '.5px solid var(--border-strong)', borderRadius: 999, background: 'var(--s2)', fontFamily: 'var(--sans)', opacity: past ? .5 : 1, overflow: 'hidden' }}>
        <span style={{ width: 6, height: 6, borderRadius: 3, background: `var(${ORIGIN_VAR[ev.origin]})`, flex: '0 0 auto' }} />
        <span className="mono" style={{ fontSize: 10, color: 'var(--fg3)', flex: '0 0 auto' }}>{fmtT(ev.s)}</span>
        <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--fg1)', lineHeight: 1.25, ...clamp2 }}>{ev.title}</span>
      </button>
    )
  }
  return (
    <button onClick={() => onSelect(ev)}
      style={{ textAlign: 'left', cursor: 'pointer', borderRadius: 7, padding: '5px 8px', display: 'flex', flexDirection: 'column', gap: 1, background: `var(${ORIGIN_SOFT[ev.origin]})`, border: live ? '1px solid var(--brand)' : 'none', boxShadow: `inset 2px 0 0 var(${ORIGIN_VAR[ev.origin]})`, fontFamily: 'var(--sans)', opacity: past ? .5 : 1, overflow: 'hidden' }}>
      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg1)', lineHeight: 1.25, ...clamp2 }}>{ev.title}</span>
      <span className="mono" style={{ fontSize: 10.5, color: `var(${ORIGIN_TXT[ev.origin]})` }}>{fmtT(ev.s)}–{fmtT(ev.e)}{live && nowMin != null ? ` · quedan ${fmtDur(ev.e - nowMin)}` : ''}</span>
    </button>
  )
}
function WeekBoard({ weekStart, now, visible, showGaps, onPickDay, onSelect }: { weekStart: Date; now: Date; visible: Ev[]; showGaps: boolean; onPickDay: (d: Date) => void; onSelect: (e: Ev) => void }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const minsArr = days.map((d) => visible.filter((e) => !e.allDay && e.date === ymd(d)).reduce((a, e) => a + (e.e - e.s), 0))
  const maxMin = Math.max(...minsArr, 60)
  const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const nowMin = now.getHours() * 60 + now.getMinutes()
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
      {days.map((d, i) => {
        const isToday = sameDay(d, now), isPastDay = !isToday && d < todayMid
        const dayEvs = visible.filter((e) => e.date === ymd(d))
        const allday = dayEvs.filter((e) => e.allDay)
        const timed = dayEvs.filter((e) => !e.allDay).sort((a, b) => a.s - b.s)
        const rows: Row2[] = []; let prevEnd: number | null = null
        timed.forEach((e) => {
          if (showGaps && prevEnd != null && e.s - prevEnd >= 60) rows.push({ type: 'gap', s: prevEnd, e: e.s })
          rows.push({ type: 'ev', ev: e, s: e.s, e: e.e })
          prevEnd = prevEnd == null ? e.e : Math.max(prevEnd, e.e)
        })
        let insertAt = -1
        if (isToday) {
          let placed = false
          for (let j = 0; j < rows.length; j++) {
            if (nowMin < rows[j].s) { insertAt = j; placed = true; break }
            if (nowMin >= rows[j].s && nowMin < rows[j].e) { rows[j].live = true; placed = true; break }
          }
          if (!placed) insertAt = rows.length
        }
        const nodes: ReactNode[] = []
        rows.forEach((r, j) => {
          if (insertAt === j) nodes.push(<NowDivider key={'n' + j} nowMin={nowMin} />)
          if (r.type === 'gap') {
            if (r.live) {
              nodes.push(<NowDivider key={'ng' + j} nowMin={nowMin} />)
              nodes.push(<span key={'gl' + j} className="mono" style={{ fontSize: 10, color: 'var(--brand-text)', padding: '0 2px' }}>quedan {fmtDur(r.e - nowMin)} libres</span>)
            } else {
              nodes.push(<span key={'g' + j} className="mono" style={{ fontSize: 10, color: 'var(--fg3)', padding: '0 2px', opacity: isPastDay || (isToday && r.e <= nowMin) ? .5 : 1 }}>{fmtDur(r.e - r.s)} libre</span>)
            }
          } else if (r.ev) {
            nodes.push(<BoardItem key={r.ev.id} ev={r.ev} live={r.live} past={isPastDay || (isToday && r.e <= nowMin && !r.live)} nowMin={nowMin} onSelect={onSelect} />)
          }
        })
        if (insertAt === rows.length) nodes.push(<NowDivider key="ne" nowMin={nowMin} />)
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
            <button onClick={() => onPickDay(d)} title="Abrir el día"
              style={{
                height: 64, borderRadius: 'var(--r-ctrl)', cursor: 'pointer', fontFamily: 'var(--sans)',
                border: isToday ? '1px solid var(--brand)' : '.5px solid var(--border)',
                background: isToday ? 'var(--brand-soft-20)' : 'var(--s1)',
                boxShadow: isToday ? '0 0 0 2px var(--brand-soft)' : 'none',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
                transition: 'border-color .15s, background .15s',
              }}>
              <span style={{ fontSize: 9.5, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.08em', color: isToday ? 'var(--brand-text)' : 'var(--fg3)' }}>{DOW[dowMon(d)]}</span>
              <span className="mono" style={{ fontSize: 19, fontWeight: 500, color: 'var(--fg1)', lineHeight: 1 }}>{d.getDate()}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, height: 4 }}>
                <span style={{ width: 24, height: 3, borderRadius: 999, background: 'var(--s3)', overflow: 'hidden', display: 'block' }}>
                  <span style={{ display: 'block', height: '100%', width: `${Math.round((minsArr[i] / maxMin) * 100)}%`, background: isToday ? 'var(--brand)' : 'var(--fg3)', borderRadius: 999 }} />
                </span>
                {allday.map((e) => <span key={e.id} style={{ width: 4, height: 4, borderRadius: 2, background: `var(${ORIGIN_VAR[e.origin]})` }} />)}
              </span>
            </button>
            <div style={{ flex: 1, minHeight: 130, background: 'var(--s1)', border: '.5px solid var(--border)', borderRadius: 'var(--r-card)', padding: 7, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {allday.map((e) => <BoardItem key={e.id} ev={e} past={isPastDay} onSelect={onSelect} />)}
              {nodes}
              {dayEvs.length === 0 && <span style={{ fontSize: 11.5, color: 'var(--fg3)', padding: '6px 2px' }}>Libre.</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── main ── */
type View = 'board' | 'week' | 'spine'
export interface HorarioCalendarProps {
  events: Ev[]
  variant?: 'A' | 'B'
  rangeStart?: number
  rangeEnd?: number
  rowHeight?: number
  showGaps?: boolean
}
export function HorarioCalendar({ events, variant = 'B', rangeStart = 0, rangeEnd = 24, rowHeight = 40, showGaps = true }: HorarioCalendarProps) {
  const mount = useRef(Date.now())
  const [, setTick] = useState(0)
  useEffect(() => { const id = setInterval(() => setTick((x) => x + 1), 1000); return () => clearInterval(id) }, [])
  // `now` real, recalculado cada tick (sin red).
  const now = new Date(mount.current + (Date.now() - mount.current))

  const [view, setView] = useState<View>('board')
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date()))
  const [dayDate, setDayDate] = useState<Date>(() => startOfDay(new Date()))
  const origins = useMemo(() => presentOrigins(events), [events])
  const [filters, setFilters] = useState<Record<Origin, boolean>>({ cal: true, date: true, task: true, health: true })
  const [sel, setSel] = useState<Ev | null>(null)

  const cols = view === 'week' ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)) : [dayDate]
  const visible = events.filter((e) => filters[e.origin])
  const nowState = useMemo(() => deriveNow(events, now), [now.getMinutes(), events]) // eslint-disable-line react-hooks/exhaustive-deps

  const pxMin = rowHeight / 60
  const timed = visible.filter((e) => !e.allDay && cols.some((d) => ymd(d) === e.date))
  const tl = buildScale(timed, rangeStart, rangeEnd, pxMin)
  const gridH = tl.total

  const goWeek = (n: number) => setWeekStart((w) => addDays(w, n * 7))
  const goDay = (n: number) => setDayDate((d) => addDays(d, n))
  const today = () => { setWeekStart(mondayOf(now)); setDayDate(startOfDay(now)) }

  let rangeLabel: string
  if (view !== 'spine') {
    const a = weekStart, b = addDays(weekStart, 6)
    rangeLabel = a.getMonth() === b.getMonth()
      ? `${a.getDate()}–${b.getDate()} ${MON[a.getMonth()]} ${a.getFullYear()}`
      : `${a.getDate()} ${MON[a.getMonth()]} – ${b.getDate()} ${MON[b.getMonth()]}`
  } else {
    rangeLabel = `${DOW_FULL[dowMon(dayDate)]} ${dayDate.getDate()} de ${MON_FULL[dayDate.getMonth()]}`
  }

  return (
    <div className="sir-horario" style={{ position: 'relative' }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {/* header */}
        <div style={{ minHeight: L.header, display: 'flex', alignItems: 'center', gap: 14, marginBottom: L.gHeader, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button className="btn btn-icon" onClick={() => view === 'spine' ? goDay(-1) : goWeek(-1)} aria-label="Anterior"><Icon n="chevL" s={16} /></button>
            <button className="btn" onClick={today} style={{ height: 34 }}>Hoy</button>
            <button className="btn btn-icon" onClick={() => view === 'spine' ? goDay(1) : goWeek(1)} aria-label="Siguiente"><Icon n="chevR" s={16} /></button>
          </div>
          <div className="mono" style={{ fontSize: 14, color: 'var(--fg2)', fontWeight: 500 }}>{rangeLabel}</div>
          <div style={{ flex: 1 }} />
          <div className="seg">
            <button aria-pressed={view === 'board'} onClick={() => { setWeekStart(mondayOf(dayDate)); setView('board') }}>Semana</button>
            <button aria-pressed={view === 'week'} onClick={() => { setWeekStart(mondayOf(dayDate)); setView('week') }}>Grilla</button>
            <button aria-pressed={view === 'spine'} onClick={() => setView('spine')}>Día</button>
          </div>
        </div>

        {/* now / próximo */}
        <NowNext variant={variant} nowState={nowState} now={now} />
        <div style={{ height: L.gNN }} />

        {/* filters */}
        {origins.length > 1 && (
          <div style={{ minHeight: L.filters, display: 'flex', alignItems: 'center', gap: 8, marginBottom: L.gFilters, flexWrap: 'wrap' }}>
            {origins.map((k) => (
              <div key={k} className="chip" data-off={!filters[k]} onClick={() => setFilters((f) => ({ ...f, [k]: !f[k] }))}>
                <span className="dot" style={{ background: `var(${ORIGIN_VAR[k]})` }} />{ORIGIN_LABEL[k]}
              </div>
            ))}
          </div>
        )}

        {/* calendar */}
        {view === 'board' ? (
          <WeekBoard weekStart={weekStart} now={now} visible={visible} showGaps={showGaps}
            onPickDay={(d) => { setDayDate(d); setView('spine') }} onSelect={setSel} />
        ) : view === 'week' ? (
          <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', border: '.5px solid var(--border)', borderRadius: 'var(--r-card)', overflow: 'hidden', background: 'var(--s1)' }}>
            {/* day header */}
            <div style={{ height: L.calHead, display: 'flex', borderBottom: '.5px solid var(--border)', flex: '0 0 auto' }}>
              <div style={{ width: L.gutter, flex: '0 0 auto', borderRight: '.5px solid var(--border)' }} />
              {cols.map((d, i) => {
                const isToday = sameDay(d, now)
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, borderLeft: i ? '.5px solid var(--border)' : 'none' }}>
                    <span style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.07em', color: isToday ? 'var(--brand-text)' : 'var(--fg3)' }}>{DOW[dowMon(d)]}</span>
                    <span className="mono" style={{ fontSize: 15, fontWeight: 500, color: isToday ? '#fff' : 'var(--fg1)', width: 26, height: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, background: isToday ? 'var(--brand)' : 'transparent' }}>{d.getDate()}</span>
                  </div>
                )
              })}
            </div>
            {/* all-day band */}
            <div style={{ height: L.allDay, display: 'flex', borderBottom: '.5px solid var(--border)', flex: '0 0 auto', background: 'var(--bg)' }}>
              <div style={{ width: L.gutter, flex: '0 0 auto', borderRight: '.5px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', padding: '8px 8px 0 0' }}>
                <span className="eyebrow" style={{ fontSize: 9, textAlign: 'right', lineHeight: 1.2 }}>Todo<br />el día</span>
              </div>
              {cols.map((d, i) => {
                const items = visible.filter((e) => e.allDay && e.date === ymd(d))
                return (
                  <div key={i} style={{ flex: 1, borderLeft: i ? '.5px solid var(--border)' : 'none', padding: 5, display: 'flex', flexDirection: 'column', gap: 4, overflow: 'hidden' }}>
                    {items.map((e) => (
                      <button key={e.id} onClick={() => setSel(e)} title={e.title}
                        style={{ textAlign: 'left', border: 'none', cursor: 'pointer', borderRadius: 6, padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 6, background: `var(${ORIGIN_SOFT[e.origin]})`, color: `var(${ORIGIN_TXT[e.origin]})`, boxShadow: `inset 2px 0 0 var(${ORIGIN_VAR[e.origin]})` }}>
                        <Icon n={ORIGIN_ICON[e.origin]} s={12.5} sw={1.7} style={{ flex: '0 0 auto' }} />
                        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.title}</span>
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>
            {/* timed grid — elastic */}
            <div style={{ position: 'relative', height: gridH, flex: '0 0 auto' }}>
              {tl.mapped.filter((s) => s.collapse).map((s, i) => {
                const night = s.s <= tl.lo + 1
                return (
                  <div key={'g' + i} style={{ position: 'absolute', left: 0, right: 0, top: s.y0, height: s.h, background: 'var(--bg)', borderTop: '.5px dashed var(--border)', borderBottom: '.5px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, zIndex: 0 }}>
                    <span className="mono" style={{ fontSize: 10, color: 'var(--fg3)', textTransform: 'uppercase', letterSpacing: '.08em' }}>{night ? 'madrugada' : `${fmtT(s.s)}–${fmtT(s.e)}`} · {fmtDur(s.e - s.s)}</span>
                  </div>
                )
              })}
              {(() => {
                const marks: ReactNode[] = []
                for (let h = rangeStart; h <= rangeEnd; h++) {
                  const seg = tl.mapped.find((s) => h * 60 >= s.s && h * 60 <= s.e)
                  if (!seg || seg.collapse) continue
                  const y = tl.scale(h * 60)
                  marks.push(
                    <div key={'hl' + h} style={{ position: 'absolute', left: L.gutter, right: 0, top: y, borderTop: '.5px solid var(--border)', zIndex: 0 }} />
                  )
                  marks.push(
                    <div key={'hm' + h} className="mono" style={{ position: 'absolute', left: 0, width: L.gutter - 8, textAlign: 'right', top: y - 6, fontSize: 10.5, color: 'var(--fg3)', zIndex: 1 }}>{pad2(h)}:00</div>
                  )
                }
                return marks
              })()}
              <div style={{ position: 'absolute', left: L.gutter, top: 0, bottom: 0, borderLeft: '.5px solid var(--border)', zIndex: 0 }} />
              <div style={{ position: 'absolute', left: L.gutter, right: 0, top: 0, bottom: 0, display: 'flex', zIndex: 1 }}>
                {cols.map((d, ci) => {
                  const dayEvents = visible.filter((e) => !e.allDay && e.date === ymd(d))
                  const isToday = sameDay(d, now)
                  const showNow = isToday && nowState.nowMin >= tl.lo && nowState.nowMin <= tl.hi
                  const nowTop = tl.scale(nowState.nowMin)
                  const blocks = dayEvents.filter((e) => (e.e - e.s) >= MOMENT_MAX)
                  const moments = dayEvents.filter((e) => (e.e - e.s) < MOMENT_MAX).sort((a, b) => a.s - b.s)
                  let lastBottom = -Infinity
                  return (
                    <div key={ci} style={{ flex: 1, position: 'relative', borderLeft: ci ? '.5px solid var(--border)' : 'none' }}>
                      {blocks.map((e) => {
                        const top = tl.scale(e.s)
                        const h = Math.max(tl.scale(e.e) - top, 18)
                        return <EventBlock key={e.id} ev={e} top={top} height={h} onClick={() => setSel(e)} />
                      })}
                      {moments.map((e) => {
                        const top = Math.max(tl.scale(e.s), lastBottom + 3)
                        lastBottom = top + MOMENT_H
                        return <MomentPill key={e.id} ev={e} top={top} onClick={() => setSel(e)} />
                      })}
                      {showNow && (
                        <div style={{ position: 'absolute', left: -1, right: 0, top: nowTop, zIndex: 5, pointerEvents: 'none' }}>
                          <div style={{ position: 'absolute', left: -4, top: -4, width: 8, height: 8, borderRadius: 4, background: 'var(--bad)' }} />
                          <div style={{ borderTop: '1.5px solid var(--bad)' }} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        ) : (
          <>
            <WeekStrip selDate={dayDate} now={now} visible={visible} onPick={(d) => setDayDate(d)} />
            <div style={{ flex: '0 0 auto', border: '.5px solid var(--border)', borderRadius: 'var(--r-card)', overflow: 'hidden', background: 'var(--s1)' }}>
              <SpineDay date={dayDate} dayEvents={visible.filter((e) => e.date === ymd(dayDate))} now={now} onSelect={setSel} />
            </div>
          </>
        )}
      </div>

      <Detail ev={sel} onClose={() => setSel(null)} />
    </div>
  )
}

export default HorarioCalendar
