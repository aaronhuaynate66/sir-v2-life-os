// SIR V2 — QA móvil: cada ruta carga y pinta contenido, sin errores de consola
// que rompan (issue #819). Corre por cada viewport.

import { test, expect } from '@playwright/test'
import { PUBLIC_ROUTES, APP_ROUTES } from './routes'
import { gotoRoute, isAuthed } from './helpers'

// Ruido conocido/benigno que NO debe hacer fallar el smoke (quota de embeddings,
// extensiones, favicon, etc.). Se filtra por substring, case-insensitive.
const IGNORED_CONSOLE = [
  'quota', 'exceeded your current quota', 'insufficient_quota',
  'favicon', 'manifest', 'service worker', 'sw.js',
  'ResizeObserver', 'hydration', // avisos, no crashes
]

function isRealError(text: string): boolean {
  const t = text.toLowerCase()
  return !IGNORED_CONSOLE.some((n) => t.includes(n.toLowerCase()))
}

async function checkRoute(page: import('@playwright/test').Page, route: string): Promise<void> {
  const errors: string[] = []
  page.on('console', (msg) => { if (msg.type() === 'error' && isRealError(msg.text())) errors.push(msg.text()) })
  page.on('pageerror', (err) => { if (isRealError(err.message)) errors.push(`pageerror: ${err.message}`) })

  const ok = await gotoRoute(page, route)
  test.skip(!ok, `rebotó al login: ${route}`)

  // Pintó algo real: hay un <main> o el shell con contenido no vacío.
  const main = page.locator('main, #main').first()
  await expect(main, `${route}: no renderizó <main>`).toBeVisible({ timeout: 20_000 })

  expect(errors, `${route}: errores de consola:\n${errors.join('\n')}`).toEqual([])
}

test.describe('Smoke — rutas públicas', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route}`, async ({ page }) => { await checkRoute(page, route) })
  }
})

test.describe('Smoke — rutas de la app', () => {
  test.skip(!isAuthed(), 'sin sesión — se saltan las rutas privadas')
  for (const route of APP_ROUTES) {
    test(`${route}`, async ({ page }) => { await checkRoute(page, route) })
  }
})
