// SIR V2 — Currency formatter
//
// Single source of truth for monetary display. Replaces every hardcoded
// '$' across the app. Uses es-PE locale so thousand separators and
// decimal commas match the user's expectations in Lima.

import type { Currency } from '@/types'

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  PEN: 'S/',
  USD: '$',
}

const PEN_FORMATTER = new Intl.NumberFormat('es-PE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const USD_FORMATTER = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function numberFormatter(currency: Currency): Intl.NumberFormat {
  return currency === 'USD' ? USD_FORMATTER : PEN_FORMATTER
}

export function formatCurrency(amount: number, currency: Currency): string {
  return `${CURRENCY_SYMBOLS[currency]} ${numberFormatter(currency).format(amount)}`
}

export function formatPEN(amount: number): string {
  return formatCurrency(amount, 'PEN')
}

export function formatCurrencyCompact(amount: number, currency: Currency): string {
  // Integer-rounded variant for dashboards / stats where two decimals are noise.
  const rounded = Math.round(amount)
  return `${CURRENCY_SYMBOLS[currency]} ${rounded.toLocaleString(currency === 'USD' ? 'en-US' : 'es-PE')}`
}
