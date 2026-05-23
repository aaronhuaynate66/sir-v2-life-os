import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/pages/**/*.{js,ts,jsx,tsx,mdx}', './src/components/**/*.{js,ts,jsx,tsx,mdx}', './src/app/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        background: '#0a0a0a', surface: '#111111', 'surface-raised': '#1a1a1a',
        border: '#1e1e1e', 'border-subtle': '#2a2a2a',
        'text-primary': '#f5f5f5', 'text-secondary': '#888888', 'text-muted': '#444444',
        accent: '#3b82f6', 'accent-hover': '#2563eb',
        peace: '#22c55e', 'peace-dim': '#166534',
        warning: '#f59e0b', 'warning-dim': '#78350f',
        danger: '#ef4444', 'danger-dim': '#7f1d1d',
        gold: '#d4af37', 'gold-dim': '#713f12',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Courier New', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config
