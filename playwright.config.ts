// SIR V2 — Config de Playwright (harness de QA móvil, issue #819).
//
// AISLADO del pipeline `validate` (type-check/lint/vitest/build):
//  - vitest solo mira `src/**/*.test.ts` (este dir es `e2e/`) → no lo toca.
//  - tsconfig raíz excluye `e2e` y este archivo → `tsc --noEmit` no lo revisa.
//  - `next lint`/`next build` no miran `e2e/`.
// Corre en su PROPIO workflow (.github/workflows/e2e.yml), nunca en `validate`.
//
// Auth: el server arranca en modo dev (`next dev`) para que `/api/dev-login`
// (guardado a NODE_ENV=development) pueda mintear la sesión del mono-usuario;
// global-setup navega ahí y guarda el storageState. Sin service-role / si el
// login falla, los tests de rutas privadas se SALTAN solos (ver helpers).

import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.E2E_PORT ?? 3000)
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  // El primer hit a cada ruta en `next dev` compila on-demand → damos aire.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // UN worker: hay un solo server (dev, SSR + Supabase real). Navegación paralela
  // lo satura y da timeouts en cascada (visto en el primer run). Serial = estable.
  workers: 1,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }], ['github']]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    storageState: 'e2e/.auth/state.json',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
  },
  // Viewports de QA móvil pedidos (375/390/414/768) + baseline desktop.
  // TODOS sobre Chromium (emulación de viewport): un solo navegador para instalar
  // (CI hace `playwright install chromium`), consistente, y suficiente para cazar
  // roturas de layout/overflow. `isMobile`/`hasTouch` son chromium-only.
  projects: [
    { name: 'mobile-se', use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true } },
    { name: 'mobile-390', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'mobile-xl', use: { ...devices['Desktop Chrome'], viewport: { width: 414, height: 896 }, isMobile: true, hasTouch: true } },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 }, hasTouch: true } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
  // Sin E2E_BASE_URL, levantamos el server nosotros (modo dev para dev-login).
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        stdout: 'pipe',
        stderr: 'pipe',
      },
})
