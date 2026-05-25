'use client'

// SIR V2 — RichContextDebugPanel (R5.1D)
// Debug consumer for useRichContext. Validates end-to-end that the hook
// builds a RichContextSnapshot and reacts to store mutations.

import { useEffect, useState } from 'react'
import { useRichContext } from '@/hooks/useRichContext'

export function RichContextDebugPanel() {
  const snapshot = useRichContext()
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

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
        <pre className="px-4 py-3 text-[11px] font-mono text-[#888] overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
          {JSON.stringify(snapshot, null, 2)}
        </pre>
      )}
    </section>
  )
}

export default RichContextDebugPanel
