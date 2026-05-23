// SIR V2 — UI Components
// Card, Badge, Button, Input, Select, Textarea, SectionHeader, EmptyState
import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

// ─── Card ─────────────────────────────────────────────────────────────────────
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-[#111] border border-[#1e1e1e] rounded-lg p-4 ${className}`}>
      {children}
    </div>
  )
}

// ─── Badge ────────────────────────────────────────────────────────────────────
type BadgeVariant = 'default' | 'ok' | 'warn' | 'bad' | 'info' | 'muted'
const badgeStyles: Record<BadgeVariant, string> = {
  default: 'text-[#888] border-[#222] bg-[#1a1a1a]',
  ok: 'text-[#22c55e] border-[#22c55e]/30 bg-[#22c55e]/10',
  warn: 'text-[#f59e0b] border-[#f59e0b]/30 bg-[#f59e0b]/10',
  bad: 'text-[#ef4444] border-[#ef4444]/30 bg-[#ef4444]/10',
  info: 'text-[#3b82f6] border-[#3b82f6]/30 bg-[#3b82f6]/10',
  muted: 'text-[#333] border-[#1a1a1a] bg-transparent',
}
export function Badge({ label, variant = 'default' }: { label: string; variant?: BadgeVariant }) {
  return (
    <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${badgeStyles[variant]}`}>
      {label}
    </span>
  )
}

// ─── Button ───────────────────────────────────────────────────────────────────
type ButtonVariant = 'default' | 'ghost' | 'danger' | 'ok'
const btnStyles: Record<ButtonVariant, string> = {
  default: 'bg-[#1a1a1a] text-[#888] border-[#222] hover:bg-[#222] hover:text-[#aaa]',
  ghost: 'bg-transparent text-[#444] border-[#1a1a1a] hover:text-[#666] hover:border-[#333]',
  danger: 'bg-transparent text-[#444] border-[#1a1a1a] hover:text-[#ef4444] hover:border-[#ef4444]/30',
  ok: 'bg-[#22c55e]/10 text-[#22c55e] border-[#22c55e]/20 hover:bg-[#22c55e]/20',
}
export function Button({ children, variant = 'default', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={`text-[11px] font-mono px-3 py-1.5 rounded border transition-colors ${btnStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

// ─── Input ────────────────────────────────────────────────────────────────────
export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`bg-[#0a0a0a] border border-[#1e1e1e] rounded px-2 py-1.5 text-xs font-mono text-[#f5f5f5] placeholder-[#333] focus:outline-none focus:border-[#333] w-full ${className}`}
      {...props}
    />
  )
}

// ─── Select ───────────────────────────────────────────────────────────────────
export function Select({ className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`bg-[#0a0a0a] border border-[#1e1e1e] rounded px-2 py-1.5 text-xs font-mono text-[#f5f5f5] focus:outline-none focus:border-[#333] w-full ${className}`}
      {...props}
    >
      {children}
    </select>
  )
}

// ─── Textarea ─────────────────────────────────────────────────────────────────
export function Textarea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`bg-[#0a0a0a] border border-[#1e1e1e] rounded px-2 py-1.5 text-xs font-mono text-[#f5f5f5] placeholder-[#333] focus:outline-none focus:border-[#333] w-full resize-none ${className}`}
      {...props}
    />
  )
}

// ─── SectionHeader ────────────────────────────────────────────────────────────
export function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex justify-between items-start mb-6">
      <div>
        <div className="text-[10px] text-[#333] font-mono uppercase tracking-widest mb-1">SIR V2</div>
        <h1 className="text-base font-medium text-[#f5f5f5]">{title}</h1>
        {subtitle && <p className="text-xs text-[#444] mt-0.5">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}

// ─── EmptyState ───────────────────────────────────────────────────────────────
export function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="text-[#222] text-xs font-mono mb-4">{message}</div>
      {action && <div>{action}</div>}
    </div>
  )
}
