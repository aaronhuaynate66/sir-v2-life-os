'use client'

// SIR V2 — RichContextDebugPanel (R5.1D + Sesion 6)
// Debug consumer for useRichContext. Validates end-to-end that the hook
// builds a RichContextSnapshot and reacts to store mutations.
// Sesion 6: adds Snapshot History viewer + manual capture + clear.

import { useEffect, useState } from 'react'
import { useRichContext } from '@/hooks/useRichContext'
import { useSnapshotStore } from '@/stores/useSnapshotStore'
import type { RichContextSnapshot, SnapshotSummary } from '@/engines/context'

/**
 * RichContextDebugPanel — debug-only UI for inspecting RichContextSnapshot in runtime.
 *
 * NOT for production use. Should be replaced with a proper /debug/context route
 * or feature-flagged before Fase 4 (UI producción).
 *
 * Current scope: shows current snapshot JSON, history of recent snapshots,
 * manual capture trigger, and history clear with confirm.
 *
 * Component is client-only (mount-gate) to avoid SSR hydration issues with
 * timestamp-based snapshot IDs.
 */
function toManualSummary(snapshot: RichContextSnapshot): SnapshotSummary {
  return {
    id: snapshot.id,
    timestamp: snapshot.timestamp,
    date: snapshot.date,
    peaceScore: snapshot.peace.score,
    peaceMode: snapshot.peace.mode,
    summary: snapshot.summary,
    risks: snapshot.risks,
    opportunities: snapshot.opportunities,
    triggerReason: 'manual',
  }
}

function formatRowTime(iso: string): string {
  const d = new Date(iso)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function firstSignal(s: SnapshotSummary): string {
  if (s.risks.length > 0) return s.risks[0]
  if (s.opportunities.length > 0) return s.opportunities[0]
  if (s.summary.length > 0) return s.summary[0]
  return ''
}

export function RichContextDebugPanel() {
  const snapshot = useRichContext()
  const [open, setOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const snapshots = useSnapshotStore(s => s.snapshots)
  const addSnapshot = useSnapshotStore(s => s.addSnapshot)
  const clearHistory = useSnapshotStore(s => s.clearHistory)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  if (!snapshot) {
    return (
      <div className="mt-6 border border-dashed border-[#2a2a2a] rounded-lg p-4 bg-[#0c0c0c]">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/30">
            DEBUG
          </span>
          <span className="text-xs text-[#555] font-mono">
            Snapshot not available yet
          </span>
        </div>
      </div>
    )
  }

  const recent = snapshots.slice(-20).reverse()

  function handleManualCapture() {
    if (!snapshot) return
    addSnapshot(toManualSummary(snapshot))
  }

  function handleClearHistory() {
    if (typeof window !== 'undefined' && !window.confirm('Limpiar todo el historial de snapshots?')) return
    clearHistory()
  }

  return (
    <section
      aria-label="Rich Context Debug Panel"
      className="mt-6 border border-dashed border-[#2a2a2a] rounded-lg bg-[#0c0c0c]"
    >
      <header className="flex items-center justify-between px-4 py-3 border-b border-dashed border-[#1e1e1e]">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#3b82f6]/10 text-[#3b82f6] border border-[#3b82f6]/30">
            DEBUG
          </span>
          <h2 className="text-xs font-mono uppercase tracking-widest text-[#555]">
            Rich Context Debug Panel
          </h2>
          <span className="text-[10px] font-mono text-[#333]">
            id: {snapshot.id}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="text-[10px] font-mono px-2 py-1 rounded bg-[#1a1a1a] text-[#555] border border-[#222] hover:bg-[#222]"
        >
          {open ? 'Ocultar' : 'Mostrar'} snapshot
        </button>
      </header>

      {open && (
        <pre className="px-4 py-3 text-[11px] font-mono text-[#888] overflow-x-auto whitespace-pre-wrap break-all leading-relaxed border-b border-dashed border-[#1e1e1e]">
          {JSON.stringify(snapshot, null, 2)}
        </pre>
      )}

      <div className="px-4 py-3 flex items-center justify-between border-b border-dashed border-[#1e1e1e] last:border-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#3b82f6]/10 text-[#3b82f6] border border-[#3b82f6]/30">
            DEBUG
          </span>
          <h3 className="text-xs font-mono uppercase tracking-widest text-[#555]">
            Historial de snapshots
          </h3>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#1a1a1a] text-[#666] border border-[#222]">
            {snapshots.length} capturados
          </span>
        </div>
        <button
          type="button"
          onClick={() => setHistoryOpen(v => !v)}
          className="text-[10px] font-mono px-2 py-1 rounded bg-[#1a1a1a] text-[#555] border border-[#222] hover:bg-[#222]"
        >
          {historyOpen ? 'Ocultar' : 'Mostrar'} historial
        </button>
      </div>

      {historyOpen && (
        <div className="px-4 py-3">
          <div className="flex items-center gap-2 mb-3">
            <button
              type="button"
              onClick={handleManualCapture}
              className="text-[10px] font-mono px-2 py-1 rounded bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/30 hover:bg-[#22c55e]/20"
            >
              Capturar manual ahora
            </button>
            <button
              type="button"
              onClick={handleClearHistory}
              className="text-[10px] font-mono px-2 py-1 rounded bg-[#ef4444]/10 text-[#ef4444] border border-[#ef4444]/30 hover:bg-[#ef4444]/20"
            >
              Limpiar historial
            </button>
          </div>

          {snapshots.length === 0 ? (
            <div className="text-[11px] font-mono text-[#333] py-2">
              Sin snapshots capturados aun
            </div>
          ) : (
            <ul className="font-mono text-[11px] text-[#888] space-y-1">
              {recent.map((s) => {
                const extra = firstSignal(s)
                return (
                  <li
                    key={s.id}
                    className="flex gap-2 px-2 py-1 rounded hover:bg-[#111] truncate"
                  >
                    <span className="text-[#444]">[{formatRowTime(s.timestamp)}]</span>
                    <span className="text-[#bbb]">{s.peaceScore.toFixed(1)}/10</span>
                    <span className="text-[#555]">·</span>
                    <span className="text-[#888]">{s.peaceMode}</span>
                    <span className="text-[#555]">·</span>
                    <span className="text-[#666]">{s.triggerReason}</span>
                    {extra && (
                      <>
                        <span className="text-[#555]">·</span>
                        <span className="text-[#666] truncate">{extra}</span>
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

export default RichContextDebugPanel
