import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        // ─── Sistema de diseño SIR V2 (tokens HSL via CSS vars) ─────────
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        // Botón primario estilo Vercel (bg claro / texto oscuro).
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        // accent = superficie de hover (surface-2), NO color de marca.
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        // ─── Acento de marca (UNO solo): IA + acción primaria ──────────
        brand: {
          DEFAULT: 'hsl(var(--brand))',
          foreground: 'hsl(var(--brand-foreground))',
          soft: 'hsl(var(--brand) / 0.14)',
          'soft-foreground': '#b9a9f5',
        },
        // ─── Semánticos: SOLO significado (salud/estado) ───────────────
        ok: {
          DEFAULT: '#2dd4a7',
          soft: 'rgba(45, 212, 167, 0.12)',
          foreground: '#7fe9cf',
        },
        warn: {
          DEFAULT: '#e0a93b',
          soft: 'rgba(224, 169, 59, 0.12)',
          foreground: '#f0cd8a',
        },
        bad: {
          DEFAULT: '#e5564c',
          soft: 'rgba(229, 86, 76, 0.12)',
          foreground: '#f0a09a',
        },
        // Alias semánticos de shadcn (apuntan a los mismos valores).
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
        },
        // ─── Superficies, bordes y texto en escala ─────────────────────
        surface: {
          1: 'hsl(var(--card))',
          2: 'hsl(var(--secondary))',
          3: '#232327',
        },
        border: {
          DEFAULT: 'hsl(var(--border))',
          strong: 'hsl(var(--border-strong))',
        },
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        // Texto en 3 niveles (primary = foreground; tertiary nuevo).
        'text-tertiary': 'hsl(var(--text-tertiary))',
      },
      borderRadius: {
        // 12px cards / 9px controles.
        lg: 'var(--radius)',                    /* 12px */
        md: 'calc(var(--radius) - 3px)',        /* 9px — controles */
        sm: 'calc(var(--radius) - 6px)',        /* 6px */
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'JetBrains Mono', 'Courier New', 'monospace'],
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}

export default config
